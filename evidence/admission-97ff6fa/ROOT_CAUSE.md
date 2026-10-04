# Exact-main admission: external gate contract migration

Georgia runtime remains `97ff6fa962cc9b5bb41c0d476bcd447b37d65fa9`, tree
`6d17fb3ba1b1f1a01d6a82dbd5af2b3fcf9cec64`. No Georgia product source was edited.
No production process, configuration, database, delivery, merge or deployment
was changed. This branch changes **Tiikou/eval-gate**, not Georgia.

## Original identity and reproduction

Native receipt `97ff6fa-2026-10-04T155758225Z-0bccee.json` bound NIGHT RUN
`f321fea7f6739dda92e4437b136dae66b0a7c554`, profile `georgia-direct-ux`, gate
`01481718909288ec0ce36a1fc8dc0adebda9d64d`, gate tree
`165aa2e639e4ad0a630d0ce61840813db4297e41`, and installed dependency digest
`f2a4b9fdeaa66b3eaba38996d26e682dad98e77d81d803245777a0701a4015f3`.
Harness, integration suite and corpus are tracked in that same gate commit;
their individual hashes and exact argv/environment are retained in `original/`.

Fresh unmodified gate + exact candidate archive reproduced **32/58**,
production **26/52**, integration **2/28**, legacy references **6/6**, exit 1.
All **26 failures are Direct integration**; all 30 leaf cases and the two
Comments integration cases passed. The 58-case aggregate is a deterministic
structural evaluation, not a live LLM semantic score. The provider is explicitly
`deterministic`; model, Graph, supplier and catalog boundaries are mocked.
There was no real model/provider call to fail. Original failure records and
old baseline/mutation evidence are retained, not relabelled as success.

## Finding 1 — HARNESS_MISMATCH

**Finding:** `integration.cjs` returned sales prose from `complete()` for every
purpose. Current Direct first requests `purpose=direct_semantics`, requiring
typed interpretation JSON, and later `direct_response_semantics`, requiring a
typed factual review. The old mock implemented neither protocol.

**Impact:** Every failing Direct case stopped before its intended pricing,
catalog, delivery or CRM assertions were reached. Missing prices and sends in
those records do not establish a product regression.

**Evidence:** Original `directModel`/`qualificationModel` versus exact Georgia
`conversation-semantics.js` `interpretConversation`/`decode` and semantic builder
at `builder.js:1123`. All 26 frozen failures show fail-closed/no-send outcomes.

**Root cause:** External gate remained pinned to a pre-semantic mock contract
after Georgia PR104 migrated conversational authority to the model proposal.

**Required outcome:** Purpose-typed, independently authored fixtures, exercised
through the current real V2 runtime. Fixture date/count/city values never come
from the production parser's `PARSER_EVIDENCE`. Existing positive price/FX,
delivery/dedupe and CRM invariants remain asserted.

## Finding 2 — STALE_INTEGRATION_EXPECTATION

**Finding:** Outage/rejected-model cases expected deterministic qualification,
parser-owned facts and AUTO delivery. Negative money cases expected a fixed
fallback status, and duplicate detection expected exactly one model call.

**Impact:** Those implementation expectations reject the intended current
fail-closed semantic behavior, even after correcting the mock protocol.

**Evidence:** Current builder fails closed on interpretation outage/invalid
JSON and does not let the parser create conversational authority. Response
failure after valid interpretation is a different stage. Typed human requests
use the existing handoff acknowledgement. Original and corrected cases are
available for direct comparison; the original corpus was not deleted.

**Root cause:** The gate encoded the former fallback mechanism and former
response shape rather than current outcomes and safety invariants.

**Required outcome:** Interpretation outage means no fabricated facts, money,
action or automatic send. Response-stage outage/rejected money is tested
separately after valid interpretation. Healthy date, participant and family
fixtures still require the correct facts, AUTO, delivery and no re-asks.
Replay asserts no additional generation rather than a fixed number of stages.
No-price fixtures require no unsupported money and consistent CRM delivery.

## Why the other evidence was green

PR104 merged as exact main `97ff6fa`. Its product tests used typed semantic
mocks, and its separately frozen live closure used the actual working inference
path and another evaluator. That clean closure recorded 20 cases/148 successful
native inferences, HARD 0. The native primary profile also passed before the
external gate. Neither exercise used this external gate's outdated prose-only
mock. The observations therefore agree; this fix does not alter PR104's live
evaluator, runtime model, corpus or historical records.

## Safety and proof

All original case IDs remain. Added cases cover interpretation/response stage
distinction and independent HARD evidence/output/state attacks, with valid
controls. The corrected suite contains 78 cases (48 integration-suite cases:
30 runtime scenarios and 18 isolated semantic/output/state boundary probes). HARD checks
cover people/date, current and stale format, stale/withdrawn facts, topic/customer
authority separation, unsupported product facts/actions/prior claims,
availability fabrication, separate event owner/revision checks and MANUAL CAS.
Independent fixed-calendar probes preserve broad windows and prevent their use
as exact quote days. A date statement cannot acquire availability intent; an
explicit human request cannot bypass the current semantic handoff boundary.
Existing quote/pricing, unknown delivery, dedupe and CRM source/delivery checks
remain, with independent source mutations required to turn named detectors RED.

The old mutation anchors remain archived. The two broad-calendar mutations are
retained, with independent literal calendar expectations. Three former fallback
and legacy-classification anchors are superseded by current interpretation
outage, semantic availability-decision and semantic human-boundary mutations;
the legacy anchors are not counted as killed current mutations. Baseline refresh is permitted only
after every reviewed case passes with zero deterministic failures; threshold
remains 1.0. No ignore/skip/noqa, deleted case, provider fallback or safety bypass
was introduced.

This is bounded offline structural proof, not a new live inference closure.
The installed NIGHT RUN gate pin remains unchanged. A separate authorized pin
rollout is required before the deployed admission consumer can use this gate
candidate; this branch does not authorize deployment.
