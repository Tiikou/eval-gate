# Georgia deterministic gate POC

This fork adapts [dbhavery/eval-gate](https://github.com/dbhavery/eval-gate) at
`71b832630e76da7d1dbe0d91c0c35145db2847c6`. Upstream code is unchanged.
It runs 30 anonymous contracts, regenerates outputs from selected Georgia source
modules on every invocation, and applies upstream structural JSON assertions,
a 100% threshold, and a reviewed baseline. It is not connected to deployment.

**POC verdict: NEEDS_WORK for full integration.** The requested legacy
`€36 + €25 -> €61 -> €60` rule was not found in release
`2ebaf59d78fb8adddc4aa035f63184a751a08f97`. Its six cases test the clearly labelled
`legacy_policy.cjs` reference, not production. Current Georgia pricing validates
supplier evidence, converts EUR using verified FX to USD, applies tier markup,
and rounds UP to $10; current Comments suppress all money. Do not replace that
business rule with the reference or interpret its mutations as production proof.
No live process inspection was performed: the default source is the clean release
build identified by local deployment evidence, not the old dirty backend checkout.

## Run

Prerequisites: Python >=3.11; Node compatible with the POC's pinned
`better-sqlite3` 12.10.0 dependency (verified here with Node 26.9.0). Run `npm ci`
in this separate project once; no dependency install occurs during evaluation.

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
npm ci
./scripts/run-georgia-evals.sh
./scripts/run-georgia-evals.sh --source-root /path/to/isolated/georgia/candidate
./scripts/run-georgia-evals.sh --prove-mutations
```

Default source:
`/root/georgia-pr97-integration-20261001-evidence/primary-release-build`.
Override with `--source-root` or `GEORGIA_EVAL_SOURCE_ROOT`. Candidate source is
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
Graph delivery, production DB concurrency, whole agent pipelines, real CRM writes,
or guarantee factual correctness of all prose. Tests are derived from existing
Georgia source regression classes, not exported customer transcripts. No PII,
credentials, `.env`, customer logs, catalogs or production DBs are copied to Git.
For full runtime/concurrency and CRM transport coverage, keep Georgia's native
unit/integration tests as independent required gates.

## Cases and baseline

`georgia/cases.json` records ID, harness operation, anonymous input, selected
expected fields, layer and provenance. Add a case for a real failure class and
its positive control. Extend the finite dispatch in `harness.cjs` only with a
reviewed pure module or fully mocked effect contract. The POC accepts 20-30 cases;
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

Ten behavioral defects are covered: legacy +25/rounding/EUR label, current FX
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
