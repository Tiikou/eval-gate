## 2026-10-01 — Georgia gate source policy and dependency isolation
- Symptom: Old backend checkout differs from current release; legacy EUR +25 rule absent; narrow residual guard mutation survives
- Cause: Different source lineage and current USD tier policy; redundant earlier money guard still rejects hallucinated price
- Avoid: Do not infer release from old dirty backend or label reference-policy mutations as production proof; do not import source node_modules
- Use: Read release evidence and source; run POC with independent pinned SQLite and fresh generated outputs; distinguish reference from real-module mutations
- Verified: Upstream97 adapter6 cases30 mutations10 PASS; exits0/1/2; no production changes
- Scope: Standalone Georgia eval-gate POC
