# Georgia comments customer-output boundary — pinned Eval failure adjudication

Identities: Georgia last PASS `2b85fb5` (tree `6e34e9e`, = main merge `893a7d1`),
main `163546b` (PR #132), release candidate `7e72cca`; prior gate pin
`e32027b54eb65775fd96dd7210e463d7d08dc3a1` (tree `659c7f18`).

Fresh pinned runs (exact `git archive` exports, wrapped in vps-heavy): control
84/84 EXIT 0; main 83/84 (integration 53/54) EXIT 1; candidate 83/84
(integration 53/54) EXIT 1. One shared failure, no candidate-only or main-only
failure, no environment difference (control reproduces the release gate).

Bisect over 893a7d1..163546b: the case first fails at `8425b24` ("Enforce
published first-party customer links and isolate SITE CRM routing") and at every
later commit; it is not caused by F1-F6 follow-ups or by the candidate delta.

Approved decision (lead decision, 2026-10-09; basis owner-merged PR #132 /
`8425b24`): customer-facing text that carries supplier-internal wording or an
unapproved/supplier URL is rejected fail-closed by
`instagram-v2/customer-output-boundary.js` (source-isolation invariant). For
Comments the whole decision is unsendable: it is retried under the existing
comments retry policy (`retry_wait`) and nothing reaches Graph. Sanitise-and-send
of such a reply is retired.

| Case | Classification | Old expected | New expected | Unchanged invariants |
|---|---|---|---|---|
| int_comments_unverified_source_price | STALE_EVAL_CONTRACT | public+private SENT, replay already_sent | nothing sent (0/0), no delivery states, replay retry_wait | no money token, no percent, non-empty private text, no duplicate send on replay |

New cases (corpus 84 -> 87, production 78 -> 81, integration 54 -> 57, within the
documented 20-90 bound):
- int_comments_unverified_price_no_supplier_word (D): restores money-guard
  coverage that the old fixture lost (its supplier wording is now stopped earlier,
  so the comments money guard was no longer reached). Current Georgia sanitises
  and sends; no money reaches the customer.
- int_comments_first_party_link_delivered (D): positive control; an approved
  first-party catalog link is delivered once and not replayed.
- int_comments_supplier_url_blocked (D): negative control; a supplier URL is
  never sent and the decision is withheld.

Mutations (run.py, each must fail its named detectors; all anchored on both main
and candidate source):
- comments_money_guard_bypass (existing): detectors re-pointed from the migrated
  case to the new money-guard case.
- comments_supplier_word_check_disabled -> int_comments_unverified_source_price.
- comments_customer_output_boundary_noop -> int_comments_supplier_url_blocked,
  int_comments_unverified_source_price.
- Not added: a mutation that no-ops only the adapter-level
  `requireSafeCustomerText` call. It is an equivalent mutant at this boundary:
  `comments/output-guard.js` applies the same `customerTextIssue` earlier, so the
  adapter check is defense in depth and no end-to-end scenario can distinguish it.

- Re-anchored (no behaviour change to the mutation intent): the pre-existing
  interpretation_outage_fabricates_progress and semantic_week_statement_availability
  anchors no longer matched current Georgia source (a technical-reply wrapper and
  an extra property in the proposal result); `--prove-mutations` returned error 2
  on `2b85fb5`, `163546b` and `7e72cca` alike. They now anchor on the current
  lines and kill their original detectors.

Expected old/new behaviour: the new contract fails on the pre-boundary control
(`2b85fb5`) only in the migrated and new boundary cases; main and candidate pass.
Georgia, dependency files (package.json, package-lock.json, node_modules) and the
Eval core/threshold/exit codes are unchanged. Baseline re-recorded only after this
review, as a requirement change approved by the lead decision above.

Counts: REAL_PRODUCT_BUG 0, STALE_EVAL_CONTRACT 1, HARNESS_ADAPTER_DRIFT 0,
ENVIRONMENT_OR_INFRA 0, UNKNOWN 0.
