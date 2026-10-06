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
# Layer D: real Georgia runtime entry points driven with mocked external
# boundaries only (georgia/integration.cjs). Their closure may name subprocess/
# network modules; the integration harness replaces those with blocking stubs
# and fails the run (exit 2) if any is touched.
INTEGRATION_ENTRIES = ['instagram-v2/runtime/direct-runtime.js', 'instagram-v2/providers/tripster-hybrid-catalog-provider.js',
                       'instagram-v2/integration/direct-knowledge-provider.js', 'instagram-v2/integration/direct-crm-mirror-record.js',
                       'georgia-on-demand-quote.js', 'instagram-v2/integration/direct-entrypoint.js', 'instagram-v2/integration/ownership.js',
                       'instagram-v2/runtime/comments-runtime.js']
LEAF_CAPABILITIES = {'node:fs','node:path','node:crypto','better-sqlite3'}
INTEGRATION_CAPABILITIES = LEAF_CAPABILITIES | {'fs','path','crypto','node:url','child_process','node:child_process','node:net','node:dns'}
DEFAULT_SOURCE = '/root/georgia-pr97-integration-20261001-evidence/primary-release-build'
BASELINE = ROOT / 'georgia/baseline.json'
CASE_FILES = [ROOT/'georgia/cases.json', ROOT/'georgia/integration_cases.json']
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
 # Layer D: one behavioral defect each, reached through the real runtime.
 'wrong_calculated_amount': ('georgia-sales-pricing.js', 'Object.freeze({ minCents: 5000n, maxCents: 10000n, minimumCents: 3000n, rateBps: 4000n })', 'Object.freeze({ minCents: 5000n, maxCents: 10000n, minimumCents: 3000n, rateBps: 3000n })'),
 'wrong_calculated_currency': ('georgia-sales-pricing.js', "return `$${raw.endsWith('.00') ? raw.slice(0, -3) : raw}${BASIS_LABELS[basis]}`;", "return `€${raw.endsWith('.00') ? raw.slice(0, -3) : raw}${BASIS_LABELS[basis]}`;"),
 'wrong_rendered_amount': ('instagram-v2/direct/money-authority.js', 'return `${FRAGMENT}${entry.id}${FRAGMENT}${owner} — ${entry.label}`;', 'return `${FRAGMENT}${entry.id}${FRAGMENT}${owner} — ${entry.label.replace(/\\d+/, d => String(Number(d) + 10))}`;'),
 'wrong_rendered_currency': ('instagram-v2/direct/money-authority.js', 'return `${FRAGMENT}${entry.id}${FRAGMENT}${owner} — ${entry.label}`;', "return `${FRAGMENT}${entry.id}${FRAGMENT}${owner} — ${entry.label.replace('$', '€')}`;"),
 'crm_duplicate_write': ('instagram-v2/adapters/direct-polling-adapter.js', '    const result = await mirrorTurn(input);', '    await mirrorTurn(input); const result = await mirrorTurn(input);'),
 'crm_wrong_delivery_id': ('instagram-v2/adapters/direct-polling-adapter.js', '    outboundDeliveryId: outboundDeliveryId || null,', "    outboundDeliveryId: 'synthetic_delivery_0',"),
 'unknown_resent_on_replay': ('instagram-v2/state-store.js', 'return{claimed:false,status,event:e}', 'if(e.status===\'DELIVERY_UNKNOWN\'){this.db.prepare("UPDATE events SET status=\'PROCESSING\' WHERE account_id=? AND channel=? AND event_id=?").run(text(accountId),channel,text(eventId));return{claimed:true,status:\'PROCESSING\',event:e}}return{claimed:false,status,event:e}'),
 'unverified_price_accepted': ('georgia-sales-pricing.js', "if (input.priceVerified !== true) fail('PRICE_UNVERIFIED');", ''),
 'stale_price_accepted': ('georgia-sales-pricing.js', "assertFresh(input.priceVerifiedAt, nowMs, maxAgeMs, 'PRICE_EVIDENCE_STALE');", ''),
 'exact_failure_falls_back_to_catalog_price': ('instagram-v2/providers/tripster-hybrid-catalog-provider.js', 'return { ok: false, code: result.code, card: withoutCustomerMoney(card), metrics: result.metrics };', 'return { ok: false, code: result.code, card, metrics: result.metrics };'),
 'exact_quote_ignores_fx': ('georgia-on-demand-quote.js', 'const unitUsd = convertToUsd(moneyText(facts.unit), facts.currency, facts.fx.rate);', 'const unitUsd = moneyText(facts.unit);'),
 'comments_money_guard_bypass': ('instagram-v2/comments/no-money.js', '  if (!value.trim()) return value;', '  return value;'),
 # Broad/relative-date qualification (real regression class, 2026-10-01).

 'semantic_unproved_quote_inputs': ('instagram-v2/direct/transaction-proof.js', '|| !quoteDerivable(update.field, update.value, update.quote, input.referenceAt, prior, text, before, input.lastOptionsAwaitingSelection === true)) return null;', '|| false && !quoteDerivable(update.field, update.value, update.quote, input.referenceAt, prior, text, before, input.lastOptionsAwaitingSelection === true)) return null;'),
 'semantic_stale_history': ('instagram-v2/direct/conversation-semantics.js', "if (update.source !== 'CURRENT_MESSAGE' && prior[update.field] != null", "if (false && update.source !== 'CURRENT_MESSAGE' && prior[update.field] != null"),
 'semantic_withdrawn_resurrection': ('instagram-v2/direct/conversation-semantics.js', 'if (supersededHistory(update, withdrawn, input.history)) continue;', 'if (false && supersededHistory(update, withdrawn, input.history)) continue;'),
 'semantic_stale_format': ('instagram-v2/direct/conversation-semantics.js', "if (format.source !== 'CURRENT_MESSAGE' && (prior.format || prior.formatOpen === true)", "if (false && format.source !== 'CURRENT_MESSAGE' && (prior.format || prior.formatOpen === true)"),
 'semantic_false_product': ('instagram-v2/direct/conversation-semantics.js', 'if (review.unsupportedProductClaims.length) {', 'if (false && review.unsupportedProductClaims.length) {'),
 'semantic_false_action': ('instagram-v2/direct/conversation-semantics.js', "if (review.completedActions.length) return 'semantic_unverified_external_action';", "if (false && review.completedActions.length) return 'semantic_unverified_external_action';"),
 'semantic_false_prior': ('instagram-v2/direct/conversation-semantics.js', 'for (const claim of review.priorClaims) {', 'for (const claim of []) {'),
 'fabricated_availability': ('instagram-v2/direct/output-guard.js', 'if (factReason) return { text: null, reason: factReason };', 'if (false && factReason) return { text: null, reason: factReason };'),
 'stale_delivery_claim': ('instagram-v2/state-store.js', "if(!event||event.lease_owner!==claim.leaseOwner||event.revision!==claim.eventRevision)throw new GeorgiaV2Error('event_claim_mismatch');", "if(!event||event.lease_owner!==claim.leaseOwner)throw new GeorgiaV2Error('event_claim_mismatch');"),
 'manual_stale_cas': ('instagram-v2/state-store.js', 'WHERE account_id=? AND conversation_id=? AND revision=?`).run(mode,reason,now,boundaryReceivedAt,boundaryEventId,now,text(accountId),text(conversationId),expectedRevision);', 'WHERE account_id=? AND conversation_id=? AND ? IS NOT NULL`).run(mode,reason,now,boundaryReceivedAt,boundaryEventId,now,text(accountId),text(conversationId),expectedRevision);'),
 'interpretation_outage_fabricates_progress': ('instagram-v2/direct/builder.js', "catch (error) { return noFallbackNeedsHuman(error.message?.startsWith('semantic_') ? error.message : 'semantic_model_unavailable', {", "catch (error) { return {type:'reply',text:'Подскажите формат поездки?',leadFacts:{people:2},modelCalls:1}; noFallbackNeedsHuman(error.message?.startsWith('semantic_') ? error.message : 'semantic_model_unavailable', {"),
 'foreign_delivery_owner': ('instagram-v2/state-store.js', "if(!event||event.lease_owner!==claim.leaseOwner||event.revision!==claim.eventRevision)throw new GeorgiaV2Error('event_claim_mismatch');", "if(!event||event.revision!==claim.eventRevision)throw new GeorgiaV2Error('event_claim_mismatch');"),
 'overwrite_current_format': ('instagram-v2/direct/conversation-semantics.js', 'facts.format = choice;', "facts.format = 'group';"),
 'broad_date_dropped': ('instagram-v2/context/direct-lead-state.js', 'const broad=broadDateWindow(value,today);', 'const broad=null;'),
 'broad_window_collapsed_to_one_day': ('instagram-v2/context/direct-lead-state.js', 'if(sy===ey&&sm===em)return`${start.getUTCDate()}–${end.getUTCDate()} ${MONTH_NAMES[em]} ${ey}`;', 'if(sy===ey&&sm===em)return`${start.getUTCDate()} ${MONTH_NAMES[sm]} ${sy}`;'),
 'semantic_week_statement_availability': ('instagram-v2/direct/conversation-semantics.js', 'return Object.freeze({ ...proposal, action, managerIntent, selection, droppedSelection, leadFacts: facts, priorLeadFacts: prior, provenance, currentFacts });', "return Object.freeze({ ...proposal, action, managerIntent, availabilityRequested:true, questions:['date_availability'], selection, droppedSelection, leadFacts: facts, priorLeadFacts: prior, provenance, currentFacts });"),
 'semantic_human_boundary_bypass': ('instagram-v2/direct/builder.js', "if (managerIntent?.outcome === 'MANUAL_HANDOFF') {", "if (false) {"),
 # Direct handoff lifecycle (approved AUTO / NOTIFY_MANAGER / MANUAL_HANDOFF policy).
 'technical_hard_handoff': ('instagram-v2/direct/fallback-policy.js', "handoffOutcome: 'NOTIFY_MANAGER', handoffReason: 'technical_failure',", "handoffOutcome: 'MANUAL_HANDOFF', handoffReason: 'technical_failure',"),
 'complete_custom_brief_not_notified': ('instagram-v2/direct/handoff-policy.js', "if (intent.reason === 'custom_quote' && !customBriefComplete(facts, intent)) return null;", "if (intent.reason === 'custom_quote') return null;"),
 'incomplete_custom_brief_hard_handoff': ('instagram-v2/direct/handoff-policy.js', "if (intent.reason === 'custom_quote' && !customBriefComplete(facts, intent)) return null;", "if (intent.reason === 'custom_quote' && !customBriefComplete(facts, intent)) return { ...intent, outcome: 'MANUAL_HANDOFF' };"),
 'manager_sent_without_receipt': ('instagram-v2/outbox/auxiliary-delivery.js', "const id = String(result?.messageId || result?.message_id || '').trim();", "const id = String(result?.messageId || result?.message_id || 'assumed_receipt').trim();"),
 'manager_unknown_auto_replay': ('instagram-v2/outbox/auxiliary-delivery.js', "      store.markOutboxUnknown(job.claim);\n      return { status: 'delivery_unknown', id: job.id };", "      store.markOutboxRetry({ ...job.claim, nextAttemptAt: new Date(0).toISOString() });\n      return { status: 'retry', id: job.id };"),
 'post_handoff_inbound_dropped': ('instagram-v2/adapters/direct-polling-adapter.js', "      await mirrorTurnInbound(mirrorInbound, { event, accountId, conversationId, conversationMode: conversation.mode });\n      return { status: 'manual_or_needs_human' };", "      return { status: 'manual_or_needs_human' };"),
 'bot_fallback_as_human': ('instagram-v2/direct/human-takeover-guard.js', ".filter(row => !['direct', 'fallback'].some(channel =>", ".filter(row => !['direct'].some(channel =>"),
 'attention_episode_lost_per_inbound': ('instagram-v2/state-store.js', "if (Object.prototype.hasOwnProperty.call(priorPayload, 'managerAttention')) payload.managerAttention = priorPayload.managerAttention;", "/* active manager episode pointer not carried forward */"),
 # The guard re-checks freshness after its in-flight history read (callback + store); dropping that re-check is one defect.
 'stale_bot_send_after_takeover': ('instagram-v2/direct/human-takeover-guard.js', "    await beforeGraphRequest?.();\n    if (!store.isConversationFresh({ accountId, conversationId, revision: snapshot.revision, mode: snapshot.mode })) {\n      throw blocked('DIRECT_SUPERSEDED_BEFORE_GRAPH');\n    }", "    // post-observation freshness re-check removed"),
}
# Named cases a mutation must turn RED (a subset of what fails). Every
# production business invariant above has at least one end-to-end (int_) detector.
EXPECTED_DETECTORS = {
 'duplicate_send': {'direct_duplicate', 'int_direct_duplicate_inbound'},
 'unknown_as_success': {'delivery_unknown', 'int_direct_delivery_unknown'},
 'hallucinated_price': {'hallucinated_price'},
 'ignore_verified_fx': {'direct_eur_verified_fx', 'int_direct_discovery_eur_fx'},
 'exact_quote_ignores_fx': {'int_direct_exact_order_fx'},
 'corrupt_rendered_money': {'authorized_price_slot'},
 'break_current_rounding': {'pricing_below_tier', 'int_direct_priced_discovery'},
 'wrong_calculated_amount': {'int_direct_priced_discovery'},
 'wrong_calculated_currency': {'int_direct_priced_discovery', 'int_direct_exact_order_fx'},
 'wrong_rendered_amount': {'int_direct_priced_discovery', 'int_direct_exact_order_fx'},
 'wrong_rendered_currency': {'int_direct_priced_discovery', 'int_direct_exact_order_fx'},
 'crm_duplicate_write': {'int_direct_priced_discovery'},
 'crm_wrong_delivery_id': {'int_direct_priced_discovery'},
 'unknown_resent_on_replay': {'int_direct_delivery_unknown', 'int_direct_delivery_timeout_unknown'},
 'unverified_price_accepted': {'int_direct_unverified_price'},
 'stale_price_accepted': {'int_direct_stale_price_evidence'},
 'exact_failure_falls_back_to_catalog_price': {'int_direct_exact_quote_unavailable'},
 'comments_money_guard_bypass': {'int_comments_money_suppressed', 'int_comments_unverified_source_price'},
 'crm_without_evidence': {'crm_insufficient_evidence'},

 'semantic_unproved_quote_inputs': {'int_hard_wrong_people', 'int_hard_wrong_date'},
 'semantic_stale_history': {'int_hard_stale_people'},
 'semantic_withdrawn_resurrection': {'int_hard_withdrawn_people'},
 'semantic_stale_format': {'int_hard_wrong_format'},
 'semantic_false_product': {'int_hard_product_fact'},
 'semantic_false_action': {'int_hard_external_action'},
 'semantic_false_prior': {'int_hard_false_prior'},
 'fabricated_availability': {'int_hard_availability'},
 'stale_delivery_claim': {'int_hard_claim_cas'},
 'manual_stale_cas': {'int_hard_manual_cas'},
 'interpretation_outage_fabricates_progress': {'int_model_unavailable_broad_date_real', 'int_model_unavailable_exact_date'},
 'foreign_delivery_owner': {'int_hard_claim_owner'},
 'overwrite_current_format': {'int_hard_current_format'},
 'broad_date_dropped': {'int_hard_broad_windows'},
 'broad_window_collapsed_to_one_day': {'int_hard_broad_windows'},
 'semantic_week_statement_availability': {'int_hard_date_statement'},
 'semantic_human_boundary_bypass': {'int_review22_boundaries', 'int_handoff_human_receipt_owned'},
 'technical_hard_handoff': {'int_model_unavailable_broad_date_real', 'int_response_model_unavailable'},
 'complete_custom_brief_not_notified': {'int_handoff_custom_complete_notify_once'},
 'incomplete_custom_brief_hard_handoff': {'int_handoff_custom_incomplete_auto'},
 'manager_sent_without_receipt': {'int_handoff_unknown_receipt_held'},
 'manager_unknown_auto_replay': {'int_handoff_unknown_receipt_held'},
 'post_handoff_inbound_dropped': {'int_handoff_human_receipt_owned'},
 'bot_fallback_as_human': {'int_handoff_unknown_receipt_held'},
 'attention_episode_lost_per_inbound': {'int_handoff_custom_complete_notify_once'},
 'stale_bot_send_after_takeover': {'int_handoff_takeover_before_send'},
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
    def copy(relative, allowed):
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
                copy(rel.parent / name, allowed)
            elif name not in allowed:
                raise ValueError(f'unsupported capability {name} in {rel}')
    for entry in ENTRIES:
        copy(Path(entry), LEAF_CAPABILITIES)
    for entry in INTEGRATION_ENTRIES:
        copy(Path(entry), INTEGRATION_CAPABILITIES)
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
    leaf_cases = json.loads(CASE_FILES[0].read_text())
    integration_cases = json.loads(CASE_FILES[1].read_text())
    cases = leaf_cases + integration_cases
    # Explicit corpus bound: raise it deliberately as the reviewed corpus grows.
    if len(cases)<20 or len(cases)>90 or len(integration_cases)<10 or len({c['id'] for c in cases})!=len(cases) or any(not re.fullmatch(r'[a-z0-9_]+', c['id']) for c in cases):
        raise ValueError('insufficient/duplicate cases')
    if any(c['layer']!='D' for c in integration_cases) or any(c['layer']=='D' for c in leaf_cases):
        raise ValueError('integration cases must be layer D and only in integration_cases.json')
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
        proc = subprocess.run([shutil.which('node') or 'node', '--max-old-space-size=128', str(ROOT/'georgia/harness.cjs'), str(snapshot), str(work/'db'), str(ROOT), str(CASE_FILES[0])],
                              env={'PATH':os.defpath, 'TZ':'UTC'}, capture_output=True,text=True,timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f'harness exit={proc.returncode}: {proc.stderr[-2500:]}')
        outputs = json.loads(proc.stdout)
        (work/'integration').mkdir()
        proc = subprocess.run([shutil.which('node') or 'node', '--max-old-space-size=256', str(ROOT/'georgia/integration.cjs'), str(snapshot), str(work/'integration'), str(ROOT), str(CASE_FILES[1])],
                              env={'PATH':os.defpath, 'TZ':'UTC'}, capture_output=True,text=True,timeout=120)
        if proc.returncode != 0:
            raise RuntimeError(f'integration harness exit={proc.returncode}: {proc.stderr[-2500:]}')
        integration_outputs = json.loads(proc.stdout)
        if set(outputs) & set(integration_outputs):
            raise ValueError('leaf and integration outputs overlap')
        outputs.update(integration_outputs)
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
        contract_hash = hashlib.sha256((json.dumps(cases,sort_keys=True,ensure_ascii=False)+hashlib.sha256((ROOT/'georgia/integration.cjs').read_bytes()).hexdigest()+hashlib.sha256((ROOT/'georgia/hard-invariants.cjs').read_bytes()).hexdigest()).encode()).hexdigest()
        if base and base.get('contract_sha256') != contract_hash:
            verdict.passed = False
            verdict.reasons.append('case contract differs from baseline: review inputs/assertions before recording')
        report_dir.mkdir(parents=True,exist_ok=True)
        write_json(result,report_dir/'report.json',verdict)
        write_html(result,verdict,report_dir/'report.html')
        # Independent A/C deterministic assertions as a separate required bar.
        # Compare selected contract fields, not complete prose or extra metadata.
        code_failures = [c['id'] for c in cases if c['layer']!='B' and any(outputs[c['id']].get(k)!=v for k,v in c['expected'].items())]
        reference = [c['id'] for c in cases if c.get('production_contract') is False]
        failing = set(result.failing_case_ids()) | set(code_failures)
        counts = {'production_passed': sum(1 for c in cases if c['id'] not in reference and c['id'] not in failing),
                  'production_total': len(cases)-len(reference),
                  'integration_passed': sum(1 for c in integration_cases if c['id'] not in failing), 'integration_total': len(integration_cases),
                  'reference_passed': sum(1 for i in reference if i not in failing), 'reference_total': len(reference)}
        (report_dir/'provenance.json').write_text(json.dumps({'source_root':str(source),'source_hashes':hashes,'native_dependency':native_provenance(),'mutation':mutation,'code_failures':code_failures,'counts':counts,'contract_sha256':contract_hash,'network':False,'production_writes':False,'external_calls':0},indent=2)+'\n')
        result.code_failures = code_failures
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
                detected = sorted(set(result.failing_case_ids()) | set(result.code_failures))
                expected = sorted(EXPECTED_DETECTORS.get(name, set()))
                row={'mutation':name,'expected':1,'actual':code,'expected_detectors':expected,'detected_by':detected,'restored':restored}
                proof.append(row)
                print(json.dumps(row))
            (reports/'mutation-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
            return 0 if all(r['actual']==1 and r['detected_by'] and set(r['expected_detectors'])<=set(r['detected_by']) and r['restored']==0 for r in proof) else 1
        code,result=evaluate(source,reports,mutation=args.mutation,baseline=not args.record_baseline)
        if args.record_baseline:
            if code!=0: raise ValueError('refusing baseline from failing run')
            write_json(result,BASELINE,evaluate_gate(result))
            recorded = json.loads(BASELINE.read_text())
            recorded['contract_sha256'] = json.loads((reports/'provenance.json').read_text())['contract_sha256']
            BASELINE.write_text(json.dumps(recorded,indent=2,ensure_ascii=False)+'\n')
        counts = json.loads((reports/'provenance.json').read_text())['counts']
        print(f"GEORGIA_CASES={result.n_passed}/{result.n_cases} PRODUCTION={counts['production_passed']}/{counts['production_total']} "
              f"INTEGRATION={counts['integration_passed']}/{counts['integration_total']} LEGACY_REFERENCE_ONLY={counts['reference_passed']}/{counts['reference_total']} EXIT={code}")
        return code
    except Exception as exc:
        print(f'CONFIG/INFRA ERROR: {exc}',file=sys.stderr)
        return 2

if __name__=='__main__':
    sys.exit(main())
