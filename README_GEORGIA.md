# Georgia deterministic gate POC

This fork adapts [dbhavery/eval-gate](https://github.com/dbhavery/eval-gate) at
`71b832630e76da7d1dbe0d91c0c35145db2847c6`. Upstream code is unchanged.
It runs 78 anonymous contracts (72 production + 6 legacy reference) regenerated from
Georgia source on every invocation. Its 48-case integration suite contains 30
mocked scenarios through Georgia's own runtime entry points and 18 isolated
HARD probes of the semantic/output/SQLite boundaries. It applies structural JSON
assertions, a 100% threshold and a reviewed baseline. NIGHT RUN's native Georgia
admission consumer uses a separately pinned version of this repository.

**Scope: isolated gate correction for exact Georgia main `97ff6fa`.** The installed
NIGHT RUN pin is not changed by this branch. See
`evidence/admission-97ff6fa/ROOT_CAUSE.md` for the reproduced external-gate failure,
the reviewed contract migration and preserved original evidence; see
`evidence/PRICING_CONTRACT.md` for the unchanged production pricing contract.

**Production pricing contract (canonical 2ebaf59, verified in code, not prose):** money
reaches a customer only in Direct, only from a validated quote: supplier price with
verified, fresh evidence -> verified FX to USD (ceil to the cent) -> tier markup
(`GEORGIA_SALES_PRICING_V1`) -> round UP to $10 -> rendered by the code-owned price slot.
Discovery uses the collector (XLSX authority) row; a concrete order (product + date +
party size) uses a live supplier quote, and a failed live quote withholds money (no
fallback). Comments, the legacy Direct path and site fallback carry no money.

**Legacy +€25: LEGACY_REFERENCE_ONLY.** The `€36 + €25 -> €61 -> €60` rule exists in no
Georgia source or runtime (2ebaf59 Direct/webhook, 263f9ba Gateway companion). Its six
cases (`production_contract: false`) test the POC-owned `legacy_policy.cjs` and are
reported separately as `LEGACY_REFERENCE_ONLY=6/6`. They are not production guarantees.
Changing production pricing to +€25 would be a new product decision; this gate does not
infer or implement it.

## Run

Prerequisites: Python >=3.11; Node compatible with the POC's pinned
`better-sqlite3` 12.10.0 dependency (verified here with Node 26.9.0). Run `npm ci`
in this separate project once; no dependency install occurs during evaluation.

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
npm ci
./scripts/run-georgia-evals.sh --source-root /path/to/isolated/georgia/candidate
./scripts/run-georgia-evals.sh --source-root /path/to/isolated/georgia/candidate --prove-mutations
```

Default source:
`/root/georgia-pr97-integration-20261001-evidence/primary-release-build`.
This default is historical, not the current release candidate. Always bind an
exact candidate archive with `--source-root` (or `GEORGIA_EVAL_SOURCE_ROOT`). Candidate source is
read-only. A literal dependency closure and SQL schema/migrations are copied into
one disposable directory. Each state case gets its own synthetic SQLite DB there.
The source closure must contain only known local dependencies plus crypto, path,
fs and the POC-owned pinned native SQLite binding; an unknown capability returns error 2.
Node VM modules receive no process/env, network APIs, fetch, or subprocess APIs.
Filesystem access is restricted to copied modules and temporary DBs; the trusted
native SQLite binding receives only a temporary filename. This is a capability
harness for trusted code, **not a security boundary for malicious JavaScript**.
The Python evaluator disables sockets and always uses the deterministic provider.
The temporary directory is removed on success or failure. Reports are written only
under this POC's ignored `reports/georgia/` directory.

Exit codes: **0 PASS; 1 REGRESSION; 2 configuration/infrastructure error**.
Missing dependencies, invalid source/mutation anchors, harness errors or timeout
are infrastructure errors, never successful mutation detections. Reports include
source SHA-256 hashes, SQLite version/binary hashes and npm lock hash; fixture responses are regenerated, never replayed as proof
that changed Georgia code still works.

## Layers and scope

- A: actual pure pricing/FX validation and boundary arithmetic. The legacy EUR
  reference is a separately labelled A-reference subset (6/30 cases).
- B: actual Direct money renderer and Comments no-money guard: supported price
  slots, unknown slots, hallucinated amounts, safe deferrals, currency leakage.
  Assertions constrain structural outcomes and rendered money tokens rather than attractive wording.
- D (`georgia/integration.cjs`, `georgia/integration_cases.json`): synthetic event ->
  Direct host disposition (`processDirectAtV2Boundary` + `runDirectOwnership`) -> V2
  Direct runtime/adapter/builder (the same composition as `instagram-agent.js`) ->
  catalog selection -> discovery/exact pricing -> money renderer/output guard -> mocked
  Graph send -> real SQLite delivery states -> real CRM mirror records on a mocked bridge;
  and Comments webhook -> Comments runtime/builder -> no-money guard -> mocked Graph.
  Mocked only: model (deterministic; fabricates `$130` when it has no slot), Graph send,
  supplier quote gateway, collector XLSX row source, conversation resolver, CRM transport.
  The harness blocks subprocess/network modules, `fetch`, and filesystem reads outside the
  snapshot/work dir/pinned SQLite (exit 2 if touched). Customer-visible money is checked
  by an independent token detector against the authorized calculated value.
- C: actual delivery classifier, real SQLite claim/state transitions, CRM envelope
  mapper and comment-private CRM reconciliation with injected mock callbacks.
  Send/write counts in state cases are simulated effects gated by real claims;
  they are not runs of the complete Direct/Comments runtime adapters. CRM inbound
  receipts and status notifications may legitimately exist before delivery; only
  outbound SENT confirmation is gated by confirmed delivery.

A/C additionally compare contract fields independently before returning green;
B uses upstream `json_schema`. Missing fields, value changes and incorrect types
fail the gate. An assertion/input contract hash detects weakening of parameters
that upstream's check-type-only baseline comparison does not detect.

This does NOT evaluate live LLM behavior, prompts, retrieval quality, real APIs,
Graph delivery, production DB concurrency, the legacy `instagram-agent.js` tick, real CRM writes,
or guarantee factual correctness of all prose. Tests are derived from existing
Georgia source regression classes, not exported customer transcripts. No PII,
credentials, `.env`, customer logs, catalogs or production DBs are copied to Git.
For full runtime/concurrency and CRM transport coverage, keep Georgia's native
unit/integration tests as independent required gates.

## Cases and baseline

The bounded review closure adds three matrix contracts within the existing 20–60
corpus limit. They cover “2 участника” and “двое/два/2 с сыном” on throwing and
rejected-model paths, plus existing human/complaint controls. Every matrix turn
uses a fresh runtime and compares all selected expected fields exactly; reached
model-call counts distinguish outage coverage from pre-model handling. The
existing broad-date acceptance corpus is unchanged. No new edge-case class is added.

`georgia/integration_cases.json` holds layer-D scenarios (bounded 10+; total corpus 20-90).
`georgia/cases.json` records ID, harness operation, anonymous input, selected
expected fields, layer and provenance. Add a case for a real failure class and
its positive control. Extend the finite dispatch in `harness.cjs` only with a
reviewed pure module or fully mocked effect contract. The POC accepts 20-90 cases;
raise that explicit bound as the corpus grows. Do not put customer data in cases.

**Baseline must never be updated only to make a failing regression gate green.**

To update after an independently approved requirement/corpus change:

```bash
./scripts/run-georgia-evals.sh --record-baseline
./scripts/run-georgia-evals.sh
./scripts/run-georgia-evals.sh --prove-mutations
```

Review case/input/schema changes and confirm the new behavior independently first.
Baseline recording refuses a failing suite and any mutation option. Do not update
when a pricing, currency, idempotency, delivery or CRM invariant regresses. The
explicit baseline command bypasses comparison to the previous baseline; it is a
review operation, never part of the ordinary run or CI.

## Mutation proof and evidence

`--prove-mutations` requires a GREEN unmodified control. It applies exactly one
anchored source replacement to a temporary copy, requires exit **1** and named
failing cases, then runs a fresh unmodified GREEN control after EVERY mutation.
Original source is never edited. A surviving mutation, error exit 2, missing or
ambiguous anchor, or failed restoration makes the proof unsuccessful.

The proof covers 27 mutations (24 on Georgia modules, 3 on the legacy
reference): wrong calculated amount/currency, wrong rendered amount/currency, discovery
and exact-quote FX bypass, rounding, duplicate send, UNKNOWN as success, UNKNOWN resent on
replay, duplicate/incorrect CRM write, CRM source-evidence bypass, unverified/stale price
accepted, failed exact quote falling back to catalog money, renderer bypass and Comments
money-guard bypass, broad-date extraction/classification/window preservation, reached
model-unavailable handoff and rejected-output human-boundary bypass. Each mutation
must also fail its named `EXPECTED_DETECTORS`.
Earlier POC history: ten behavioral defects were covered: legacy +25/rounding/EUR label, current FX
and rounding, duplicate claims, UNKNOWN as success, CRM source-evidence bypass,
complete money-renderer bypass, and corruption of a validated rendered amount/currency. The first narrow residual-money-check
mutation survived because an earlier independent guard still rejected the price.
`evidence/initial-mutation-proof.json` preserves that attempt. The final full
renderer bypass demonstrates the hallucinated-price regression can turn RED;
it does not claim every single redundant guard is independently necessary.

`evidence/upstream.json` records upstream tests and explicit 0/1/2 probes.
`evidence/mutation-proof.json` and `evidence/georgia-summary.json` record final
POC results. False-positive/negative numbers cover these synthetic controls and
injected behavioral defects only; they are not production calibration estimates.

## Integration readiness (not wired)

Use `./scripts/run-georgia-evals.sh --source-root <isolated candidate checkout>` as a
blocking step: exit 0 pass, 1 regression (block), 2 config/infrastructure (block, never
treat as pass). Needs Python >=3.11, Node 26 and `npm ci` in this project; ~4 s per run,
~2 min for `--prove-mutations`. No network, credentials or live LLM. Keep Georgia's native
suites as independent gates. Known native results on 2ebaf59: `instagram-v2-runtime-contract-test.js`
fails identically on main 53d0ff6 (pre-existing); `check:repository-boundary` (and the
UX suite's broader-checks subtest that calls it) fails only on 2ebaf59 because its one-line
`openclaw-georgia-deployed-loader-test.ts` change left a stale manifest checksum.

## Upstream maintenance

```bash
git fetch upstream
git switch -c chore/upstream-review
# Review the upstream diff first; then merge the reviewed revision on this branch.
git merge upstream/master
.venv/bin/python -m pytest -q tests
./scripts/run-georgia-evals.sh
./scripts/run-georgia-evals.sh --prove-mutations
```

Keep origin pointed at Tiikou/eval-gate and upstream at dbhavery/eval-gate. Push
feature branches only. Do not merge into Georgia, deploy, enable env flags, or
attach this command to a real release without a separate integration decision.
