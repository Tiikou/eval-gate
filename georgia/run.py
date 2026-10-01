"""Generate fresh outputs from isolated source, then apply upstream eval-gate."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
try:
    import yaml
except ImportError:
    print('Missing PyYAML; install .[dev] in .venv', file=sys.stderr)
    sys.exit(2)
from eval_gate.config import load_suite
from eval_gate.gate import evaluate_gate, load_baseline
from eval_gate.report import write_html, write_json
from eval_gate.runner import run_suite

ROOT = Path(__file__).resolve().parents[1]
ENTRIES = ['georgia-sales-pricing.js', 'instagram-v2/delivery-classifier.js',
           'instagram-v2/direct/money-authority.js', 'instagram-v2/comments/no-money.js',
           'instagram-v2/integration/direct-crm-mirror-record.js',
           'instagram-v2/integration/comment-private-crm-reconcile.js', 'instagram-v2/state-store.js']
DEFAULT_SOURCE = '/root/georgia-pr97-integration-20261001-evidence/primary-release-build'
BASELINE = ROOT / 'georgia/baseline.json'
MUTATIONS = {
 'disable_plus25': ('legacy_policy.cjs', 'cents + 2500n', 'cents + 0n'),
 'break_legacy_rounding': ('legacy_policy.cjs', '((raw + 500n) / 1000n) * 1000n', '(raw / 1000n) * 1000n'),
 'eur_to_usd': ('legacy_policy.cjs', "currency: 'EUR', final: true", "currency: 'USD', final: true"),
 'duplicate_send': ('instagram-v2/state-store.js', 'return{claimed:false,status,event:e}', 'if(e.status===\'SENT\'){this.db.prepare("UPDATE events SET status=\'PROCESSING\' WHERE account_id=? AND channel=? AND event_id=?").run(text(accountId),channel,text(eventId));return{claimed:true,status:\'PROCESSING\',event:e}}return{claimed:false,status,event:e}'),
 'unknown_as_success': ('instagram-v2/delivery-classifier.js', "return { status: 'DELIVERY_UNKNOWN', code: !value", "return { status: 'SENT', code: !value"),
 'crm_without_evidence': ('instagram-v2/integration/direct-crm-mirror-record.js', "if (textOrNull(sourceInput.source) !== 'georgia_v2_direct')", "if (false)"),
 'hallucinated_price': ('instagram-v2/direct/money-authority.js', "function renderMoney(value = '', context = {}, { grounded = true, strict = false, replacePending = grounded } = {}) {", "function renderMoney(value = '', context = {}, { grounded = true, strict = false, replacePending = grounded } = {}) { return {text: String(value), reason: null};"),
 'ignore_verified_fx': ('georgia-sales-pricing.js', 'const cost = convertToUsd(sourcePrice, sourceCurrency, input.fxRateToUsd);', 'const cost = sourcePrice;'),
 'corrupt_rendered_money': ('instagram-v2/direct/money-authority.js', 'if (!priced.dropped) return { ...rendered, moneyStatementsReplaced: owned.replaced };', "if (!priced.dropped) return { ...rendered, text: rendered.text.replace('$130', '€999'), moneyStatementsReplaced: owned.replaced };"),
 'break_current_rounding': ('georgia-sales-pricing.js', 'const sell = roundUp(cost + target, 1000n);', 'const sell = cost + target;'),
}

def native_provenance():
    package = ROOT/'node_modules/better-sqlite3'
    files = [package/'package.json', *sorted((package/'lib').rglob('*.js')), *sorted((package/'build/Release').glob('*.node'))]
    for dependency in ['bindings', 'file-uri-to-path']:
        dep = ROOT/'node_modules'/dependency
        files.extend(sorted(dep.rglob('*.js')))
        files.append(dep/'package.json')
    if not any(p.suffix == '.node' for p in files):
        raise ValueError('missing isolated SQLite binary; run npm ci')
    return {'version': json.loads((package/'package.json').read_text())['version'],
            'lock_sha256': hashlib.sha256((ROOT/'package-lock.json').read_bytes()).hexdigest(),
            'files': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}

def isolated_source(source: Path, dest: Path) -> dict:
    """Copy only literal local dependency closure; no env/credentials/data."""
    seen = set()
    def copy(relative):
        file = (source / relative).resolve()
        if not file.is_relative_to(source.resolve()):
            raise ValueError('source dependency escapes root')
        if not file.is_file():
            file = file.with_suffix('.js')
        rel = file.relative_to(source.resolve())
        if str(rel) in seen:
            return
        seen.add(str(rel))
        text = file.read_text()
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        for name in re.findall(r"require\(['\"]([^'\"]+)['\"]\)", text):
            if name.startswith('.'):
                copy(rel.parent / name)
            elif name not in {'node:fs','node:path','node:crypto','better-sqlite3'}:
                raise ValueError(f'unsupported capability {name} in {rel}')
    for entry in ENTRIES:
        copy(Path(entry))
    for file in [source/'instagram-v2/state-schema.sql', *sorted((source/'instagram-v2/migrations').glob('*.sql'))]:
        rel = file.relative_to(source)
        resolved = file.resolve()
        if not resolved.is_relative_to(source.resolve()):
            raise ValueError('SQL asset escapes source root')
        (dest/rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, dest/rel)
        seen.add(str(rel))
    shutil.copyfile(ROOT/'georgia/legacy_policy.cjs', dest/'legacy_policy.cjs')
    return {rel: hashlib.sha256((dest/rel).read_bytes()).hexdigest() for rel in sorted(seen)}

def schema(expected):
    properties = {}
    for key, value in expected.items():
        kind = 'null' if value is None else 'boolean' if isinstance(value,bool) else 'integer' if isinstance(value,int) else 'array' if isinstance(value,list) else 'string'
        properties[key] = {'type': kind, 'enum': [value]}
    return {'type':'object','required':list(expected),'properties':properties}

def evaluate(source: Path, report_dir: Path, mutation=None, baseline=True):
    cases = json.loads((ROOT/'georgia/cases.json').read_text())
    if len(cases)<20 or len(cases)>30 or len({c['id'] for c in cases})!=len(cases) or any(not re.fullmatch(r'[a-z0-9_]+', c['id']) for c in cases):
        raise ValueError('insufficient/duplicate cases')
    with tempfile.TemporaryDirectory(prefix='georgia-eval-') as temp:
        work = Path(temp)
        snapshot = work/'source'; snapshot.mkdir()
        hashes = isolated_source(source, snapshot)
        if mutation:
            relative, old, new = MUTATIONS[mutation]
            file = snapshot/relative; text = file.read_text()
            if text.count(old)!=1:
                raise ValueError(f'mutation {mutation} anchor count={text.count(old)}, expected 1')
            file.write_text(text.replace(old,new,1))
        # A minimal environment prevents inherited provider/env/production config.
        proc = subprocess.run([shutil.which('node') or 'node', '--max-old-space-size=128', str(ROOT/'georgia/harness.cjs'), str(snapshot), str(work/'db'), str(ROOT), str(ROOT/'georgia/cases.json')],
                              env={'PATH':os.defpath, 'TZ':'UTC'}, capture_output=True,text=True,timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f'harness exit={proc.returncode}: {proc.stderr[-2500:]}')
        outputs = json.loads(proc.stdout)
        if set(outputs)!={c['id'] for c in cases}:
            raise ValueError('incomplete harness outputs')
        responses = work/'responses'; responses.mkdir()
        corpus = work/'corpus'; corpus.mkdir()
        (corpus/'scope.txt').write_text('Georgia offline structural contracts; no retrieval quality claim.')
        spec = {'name':'georgia-poc','threshold':1.0,'corpus_dir':str(corpus),'responses_dir':str(responses),'cases':[]}
        for c in cases:
            (responses/f"{c['id']}.json").write_text(json.dumps({'answer':json.dumps(outputs[c['id']],ensure_ascii=False)}))
            spec['cases'].append({'id':c['id'],'question':c['id'],'checks':[{'type':'json_schema','schema':schema(c['expected'])}]})
        suite_file = work/'suite.yaml'; suite_file.write_text(yaml.safe_dump(spec,allow_unicode=True))
        # Provider is explicitly deterministic even if operator has API keys.
        result = run_suite(load_suite(suite_file),provider_mode='deterministic')
        base = load_baseline(BASELINE) if baseline else None
        verdict = evaluate_gate(result, base)
        contract_hash = hashlib.sha256(json.dumps(cases,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        if base and base.get('contract_sha256') != contract_hash:
            verdict.passed = False
            verdict.reasons.append('case contract differs from baseline: review inputs/assertions before recording')
        report_dir.mkdir(parents=True,exist_ok=True)
        write_json(result,report_dir/'report.json',verdict)
        write_html(result,verdict,report_dir/'report.html')
        # Independent A/C deterministic assertions as a separate required bar.
        # Compare selected contract fields, not complete prose or extra metadata.
        code_failures = [c['id'] for c in cases if c['layer']!='B' and any(outputs[c['id']].get(k)!=v for k,v in c['expected'].items())]
        (report_dir/'provenance.json').write_text(json.dumps({'source_root':str(source),'source_hashes':hashes,'native_dependency':native_provenance(),'mutation':mutation,'code_failures':code_failures,'contract_sha256':contract_hash,'network':False,'production_writes':False},indent=2)+'\n')
        return verdict.exit_code or (1 if code_failures else 0), result

def deny_network(*args, **kwargs):
    raise RuntimeError('NETWORK_DISABLED_IN_GEORGIA_EVAL')

def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-root',default=os.getenv('GEORGIA_EVAL_SOURCE_ROOT',DEFAULT_SOURCE))
    parser.add_argument('--mutation',choices=sorted(MUTATIONS))
    parser.add_argument('--prove-mutations',action='store_true')
    parser.add_argument('--record-baseline',action='store_true')
    args=parser.parse_args(argv)
    if args.record_baseline and (args.mutation or args.prove_mutations):
        parser.error('cannot record a mutated baseline')
    socket.socket=deny_network
    socket.create_connection=deny_network
    try:
        source=Path(args.source_root).resolve()
        if not source.is_dir(): raise ValueError('source root missing')
        reports=ROOT/'reports/georgia'
        if args.prove_mutations:
            proof=[]
            control,_=evaluate(source,reports/'control')
            if control!=0: raise ValueError('mutation control is not green')
            for name in MUTATIONS:
                code,result=evaluate(source,reports/name,mutation=name)
                restored,_=evaluate(source,reports/f'{name}-restored')
                row={'mutation':name,'expected':1,'actual':code,'detected_by':result.failing_case_ids(),'restored':restored}
                proof.append(row)
                print(json.dumps(row))
            (reports/'mutation-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
            return 0 if all(r['actual']==1 and r['detected_by'] and r['restored']==0 for r in proof) else 1
        code,result=evaluate(source,reports,mutation=args.mutation,baseline=not args.record_baseline)
        if args.record_baseline:
            if code!=0: raise ValueError('refusing baseline from failing run')
            write_json(result,BASELINE,evaluate_gate(result))
            recorded = json.loads(BASELINE.read_text())
            recorded['contract_sha256'] = json.loads((reports/'provenance.json').read_text())['contract_sha256']
            BASELINE.write_text(json.dumps(recorded,indent=2,ensure_ascii=False)+'\n')
        print(f'GEORGIA_CASES={result.n_passed}/{result.n_cases} EXIT={code}')
        return code
    except Exception as exc:
        print(f'CONFIG/INFRA ERROR: {exc}',file=sys.stderr)
        return 2

if __name__=='__main__':
    sys.exit(main())
