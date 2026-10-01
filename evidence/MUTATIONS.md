# Mutation evidence

Final proof: `./scripts/run-georgia-evals.sh --prove-mutations --source-root <git archive 2ebaf59>` exit 0.
Each row: GREEN control -> mutation -> exit 1 -> fresh restored GREEN 0. `expected` detectors must all be among the failures.

| MUTATION | EXIT | EXPECTED DETECTORS (all failed) | RESTORED |
|---|---|---|---|
| disable_plus25 | 1 | (any; legacy reference) | 0 |
| break_legacy_rounding | 1 | (any; legacy reference) | 0 |
| eur_to_usd | 1 | (any; legacy reference) | 0 |
| duplicate_send | 1 | direct_duplicate, int_direct_duplicate_inbound | 0 |
| unknown_as_success | 1 | delivery_unknown, int_direct_delivery_unknown | 0 |
| crm_without_evidence | 1 | crm_insufficient_evidence | 0 |
| hallucinated_price | 1 | hallucinated_price | 0 |
| ignore_verified_fx | 1 | direct_eur_verified_fx, int_direct_discovery_eur_fx | 0 |
| corrupt_rendered_money | 1 | authorized_price_slot | 0 |
| break_current_rounding | 1 | int_direct_priced_discovery, pricing_below_tier | 0 |
| wrong_calculated_amount | 1 | int_direct_priced_discovery | 0 |
| wrong_calculated_currency | 1 | int_direct_exact_order_fx, int_direct_priced_discovery | 0 |
| wrong_rendered_amount | 1 | int_direct_exact_order_fx, int_direct_priced_discovery | 0 |
| wrong_rendered_currency | 1 | int_direct_exact_order_fx, int_direct_priced_discovery | 0 |
| crm_duplicate_write | 1 | int_direct_priced_discovery | 0 |
| crm_wrong_delivery_id | 1 | int_direct_priced_discovery | 0 |
| unknown_resent_on_replay | 1 | int_direct_delivery_timeout_unknown, int_direct_delivery_unknown | 0 |
| unverified_price_accepted | 1 | int_direct_unverified_price | 0 |
| stale_price_accepted | 1 | int_direct_stale_price_evidence | 0 |
| exact_failure_falls_back_to_catalog_price | 1 | int_direct_exact_quote_unavailable | 0 |
| exact_quote_ignores_fx | 1 | int_direct_exact_order_fx | 0 |
| comments_money_guard_bypass | 1 | int_comments_money_suppressed, int_comments_unverified_source_price | 0 |

`disable_plus25`, `break_legacy_rounding`, `eur_to_usd` mutate only the LEGACY_REFERENCE_ONLY `legacy_policy.cjs`; they are not production proof.
All other rows mutate copied canonical Georgia modules. Full detector lists: `mutation-proof.json`.
Earlier POC history: `initial-mutation-proof.json` (narrow residual guard mutation survived redundant defenses).
