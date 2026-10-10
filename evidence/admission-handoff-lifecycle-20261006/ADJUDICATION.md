# Georgia PR #122 handoff lifecycle — pinned Eval failure adjudication

Identities: Georgia base `4f50cfafc2c21e3fe6b2018d37fac3a981e6dca9`, candidate
`4f93b5b967b3c6de62851fe5d304265f646b5ac4` (PR #122), prior gate pin
`b35255e6fe4eab11e3657f49f291c3cc6d6a1c31`.

Fresh pinned runs (exact `git archive` exports): base 78/78 EXIT 0; candidate
69/78 (integration 39/48) EXIT 1. All nine failures are introduced by the
candidate. No generic Eval core, threshold, exit code or leaf case changed; no
case removed.

Approved policy: technical failure alone keeps AUTO and, after bounded recovery,
opens one NOTIFY_MANAGER episode; complete custom brief NOTIFY_MANAGER; explicit
human/complaint/sensitive MANUAL_HANDOFF; manager SENT only with a Telegram
receipt; ambiguous delivery DELIVERY_UNKNOWN, never replayed; one active episode;
post-handoff inbound durably mirrored; bot fallback is not human provenance.

| Case | Classification | Old expected | Candidate / new expected | Unchanged invariants |
|---|---|---|---|---|
| int_direct_delivery_unknown | STALE_EVAL_CONTRACT | actions manager_handoff x2 | actions notify_manager x2 (direct-entrypoint.js: exhausted/unknown disposition requests attention, never forced ownership) | sends 1, no resend, retries 0, managerTasks 2, DELIVERY_UNKNOWN, no SENT CRM turn, $130 |
| int_direct_delivery_timeout_unknown | STALE_EVAL_CONTRACT | same | same | same |
| int_model_unavailable_broad_date_real | STALE_EVAL_CONTRACT | NEEDS_HUMAN, sends 0, FAILED | AUTO, one honest safe reply (SENT), NOTIFY_MANAGER/technical_failure ACTIVE, manager outbox [SENT], 1 card (builder.js noFallbackNeedsHuman -> technicalFailureReply) | no money, people/city/date not persisted, no re-ask, managerTasks 0, legacy 0 |
| int_model_unavailable_exact_date | STALE_EVAL_CONTRACT | same | same | same |
| int_review22_participants | STALE_EVAL_CONTRACT | outage/rejected turns NEEDS_HUMAN, sends 0 | outage/rejected turns as above; qualification turn unchanged | facts null on outage turns |
| int_review22_son | STALE_EVAL_CONTRACT | 6 outage/rejected turns NEEDS_HUMAN | as above; 3 qualification turns unchanged | same |
| int_response_model_unavailable | STALE_EVAL_CONTRACT | NEEDS_HUMAN, sends 0 | AUTO, safe reply, NOTIFY technical_failure; externalActionClaimed false added | validated people 2/Батуми/date persisted, no money |
| int_response_rejected_money | STALE_EVAL_CONTRACT | NEEDS_HUMAN, sends 0 | as above; the rejected "$180 … Подтверждаю бронь" never reaches the customer (renderedMoney [], externalActionClaimed false) | money authority, no false booking action |
| int_review22_boundaries | HARNESS_ADAPTER_DRIFT | fallback_sent, NEEDS_HUMAN, semantic_requires_human | fixture emits the current required typed managerIntent (conversation-semantics.js prompt + validateManagerIntent); MANUAL_HANDOFF committed only after receipt: manual_handoff, MANUAL, modeReason manager_handoff:<reason>, attention OWNED, outbox [SENT], 1 card | sends 1, no money, facts null |

Counts: REAL_PRODUCT_BUG 0, STALE_EVAL_CONTRACT 8, HARNESS_ADAPTER_DRIFT 1,
ORACLE_BUG 0, PIN_DRIFT 0, ENVIRONMENT_OR_INFRA 0, UNKNOWN 0. Georgia PR #122
unchanged.

Harness drift corrected (production composition, real candidate code):
- semantic fixture emits typed `managerIntent` (bare `action:'handoff'` is
  invalid model output in the candidate and degrades to technical NOTIFY);
- runtime `notifyManager` = real `notifyManagerDurably` with the production
  event-key derivation; only the Telegram transport is mocked (receipt / no
  receipt / CRM takeover);
- synthetic Graph `getConversationHistorySince` (production wires the real
  reader), so the before-send human-takeover guard runs;
- host entrypoint callback renamed `markNeedsHuman` -> `notifyManager`.
All 69 previously passing cases produce identical selected outputs.

New lifecycle cases (`direct_handoff_lifecycle`): custom_incomplete_auto (B),
custom_complete_notify_once (C, J), human_receipt_owned (D, F, H),
unknown_receipt_held (G, H, I), takeover_before_send (K),
takeover_during_manager (K). A/E are covered by the migrated technical and
boundaries cases.

Mutations: 3 re-anchored to equivalent candidate source
(interpretation_outage_fabricates_progress, semantic_week_statement_availability,
semantic_human_boundary_bypass); 9 added (technical_hard_handoff,
complete_custom_brief_not_notified, incomplete_custom_brief_hard_handoff,
manager_sent_without_receipt, manager_unknown_auto_replay,
post_handoff_inbound_dropped, bot_fallback_as_human,
attention_episode_lost_per_inbound, stale_bot_send_after_takeover). Native
Georgia handoff mutations (9/9 killed on `4f93b5b`) complement them.

Reviews: independent Sonnet B (product contract), C (harness), D (HARD
invariants) PASS_WITH_NOTES; notes addressed (production event key, oracle
regexes, realistic per-inbound mutation). Known limitation: production manager
card building (`directAttentionManagerCard`) and Telegram formatting remain
covered by native Georgia tests, not this gate.
