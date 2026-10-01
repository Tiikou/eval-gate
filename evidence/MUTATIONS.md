# Mutation evidence

| MUTATION | EXPECTED | ACTUAL | DETECTED_BY | RESTORED |
|---|---|---|---|---|
| disable_plus25 | RED / 1 | RED / 1 | legacy_eur36, legacy_below_midpoint, legacy_midpoint, legacy_no_double_markup | GREEN / 0 |
| break_legacy_rounding | RED / 1 | RED / 1 | legacy_midpoint | GREEN / 0 |
| eur_to_usd | RED / 1 | RED / 1 | legacy_eur36, legacy_below_midpoint, legacy_midpoint, legacy_no_double_markup | GREEN / 0 |
| duplicate_send | RED / 1 | RED / 1 | direct_duplicate, comments_duplicate | GREEN / 0 |
| unknown_as_success | RED / 1 | RED / 1 | delivery_unknown | GREEN / 0 |
| crm_without_evidence | RED / 1 | RED / 1 | crm_insufficient_evidence | GREEN / 0 |
| hallucinated_price | RED / 1 | RED / 1 | hallucinated_price, partial_source_unknown_slot, authorized_price_slot | GREEN / 0 |
| ignore_verified_fx | RED / 1 | RED / 1 | direct_eur_verified_fx | GREEN / 0 |
| corrupt_rendered_money | RED / 1 | RED / 1 | authorized_price_slot | GREEN / 0 |
| break_current_rounding | RED / 1 | RED / 1 | pricing_below_tier, direct_eur_verified_fx | GREEN / 0 |

The first three rows validate the undeployed legacy reference only. Other rows mutate copied real Georgia modules.
The narrow residual-money guard mutation survived redundant defenses; initial-mutation-proof.json preserves it.
Fresh Sol found rendered tokens were unasserted. Its initial final-branch mutation was dormant, not a behavioral false-negative proof. The reached early-return corruption above produces EUR999 versus expected USD130 and fails authorized_price_slot.
