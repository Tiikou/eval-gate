# Bound-answer model fixture migration

The prior mock emitted legacy prose for generation and legacy review JSON.
Current Direct requires source-bound JSON plans and input-hash-bound reviews.
Update only the external model fixtures; all 90 cases, expected customer results,
thresholds, hard invariants and baseline case outcomes remain byte/value identical.
The baseline contract fingerprint changes because it includes integration.cjs;
this is a documented protocol migration, not a baseline regenerated from candidate outputs.

The mandatory negative control sends the exact original unsupported format question
as a prose block. It requires technical attention, one manager receipt, no money,
no original reply admission and two actual deterministic product-guard denials.
The compiler exposes native_safety_rejected; the separate gate-owned trace must
prove unsupported_product_format, so invalid JSON cannot satisfy the control.
Positive adaptation stays disabled in the mandatory negative execution.

This is deterministic structural evidence, not real GPT dialogue quality.
