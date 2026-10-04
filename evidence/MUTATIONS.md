# Mutation evidence for exact Georgia main97ff6fa

39/39 mutations produced exit1 with every named required detector failing; all39 fresh restored controls exited0. There are36 production-source mutations and3 separately labeled legacy references. The78-case unmodified control passed. Full records: `mutation-proof.json`; exact source/native dependencies: `admission-97ff6fa/control-provenance.json`. Original proof remains archived under `admission-97ff6fa/original/`.

| Mutation | Required detectors | Mutated/restored exit |
|---|---|---|
| disable_plus25 | legacy reference rejection | 1 / 0 |
| break_legacy_rounding | legacy reference rejection | 1 / 0 |
| eur_to_usd | legacy reference rejection | 1 / 0 |
| duplicate_send | direct_duplicate, int_direct_duplicate_inbound | 1 / 0 |
| unknown_as_success | delivery_unknown, int_direct_delivery_unknown | 1 / 0 |
| crm_without_evidence | crm_insufficient_evidence | 1 / 0 |
| hallucinated_price | hallucinated_price | 1 / 0 |
| ignore_verified_fx | direct_eur_verified_fx, int_direct_discovery_eur_fx | 1 / 0 |
| corrupt_rendered_money | authorized_price_slot | 1 / 0 |
| break_current_rounding | int_direct_priced_discovery, pricing_below_tier | 1 / 0 |
| wrong_calculated_amount | int_direct_priced_discovery | 1 / 0 |
| wrong_calculated_currency | int_direct_exact_order_fx, int_direct_priced_discovery | 1 / 0 |
| wrong_rendered_amount | int_direct_exact_order_fx, int_direct_priced_discovery | 1 / 0 |
| wrong_rendered_currency | int_direct_exact_order_fx, int_direct_priced_discovery | 1 / 0 |
| crm_duplicate_write | int_direct_priced_discovery | 1 / 0 |
| crm_wrong_delivery_id | int_direct_priced_discovery | 1 / 0 |
| unknown_resent_on_replay | int_direct_delivery_timeout_unknown, int_direct_delivery_unknown | 1 / 0 |
| unverified_price_accepted | int_direct_unverified_price | 1 / 0 |
| stale_price_accepted | int_direct_stale_price_evidence | 1 / 0 |
| exact_failure_falls_back_to_catalog_price | int_direct_exact_quote_unavailable | 1 / 0 |
| exact_quote_ignores_fx | int_direct_exact_order_fx | 1 / 0 |
| comments_money_guard_bypass | int_comments_money_suppressed, int_comments_unverified_source_price | 1 / 0 |
| semantic_unproved_quote_inputs | int_hard_wrong_date, int_hard_wrong_people | 1 / 0 |
| semantic_stale_history | int_hard_stale_people | 1 / 0 |
| semantic_withdrawn_resurrection | int_hard_withdrawn_people | 1 / 0 |
| semantic_stale_format | int_hard_wrong_format | 1 / 0 |
| semantic_false_product | int_hard_product_fact | 1 / 0 |
| semantic_false_action | int_hard_external_action | 1 / 0 |
| semantic_false_prior | int_hard_false_prior | 1 / 0 |
| fabricated_availability | int_hard_availability | 1 / 0 |
| stale_delivery_claim | int_hard_claim_cas | 1 / 0 |
| manual_stale_cas | int_hard_manual_cas | 1 / 0 |
| interpretation_outage_fabricates_progress | int_model_unavailable_broad_date_real, int_model_unavailable_exact_date | 1 / 0 |
| foreign_delivery_owner | int_hard_claim_owner | 1 / 0 |
| overwrite_current_format | int_hard_current_format | 1 / 0 |
| broad_date_dropped | int_hard_broad_windows | 1 / 0 |
| broad_window_collapsed_to_one_day | int_hard_broad_windows | 1 / 0 |
| semantic_week_statement_availability | int_hard_date_statement | 1 / 0 |
| semantic_human_boundary_bypass | int_review22_boundaries | 1 / 0 |

Legacy EUR policy mutations are references, not production guarantees. Old fallback and legacy week/human-boundary anchors are not counted as current mutation deaths. The calendar mutations are retained; current typed interpretation outage, availability decision and handoff mutations replace the old conversational implementation anchors. No source mutation was applied to production.
