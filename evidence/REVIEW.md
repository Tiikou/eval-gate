# Fresh Luna reviews and Sol verification

Two fresh Luna medium reviews inspected correctness/isolation and proof quality.
Confirmed and fixed: native dependency no longer executed from source checkout;
POC owns pinned SQLite dependency with lock/library/binary hashes. SQL symlink
escapes now rejected with a regression test. Final compact proof and provenance
are committed, not only generated in ignored reports. Baseline contract hash
protects expected/input/schema parameter changes in addition to upstream types.

Accepted limitations: VM is for trusted modules, not malicious code containment;
30 cases include six legacy references; leaf contracts do not cover complete
runtime pipelines. Final verdict remains NEEDS_WORK for full integration.
A fresh GPT-6.1 Sol medium review was requested on the final staged diff and evidence.
Lead performed source checks, reviewed
changes, ran full upstream97, adapter6, Georgia30 and behavioral mutations10.

Fresh Sol review found missing rendered amount/currency assertions in the positive
price-slot case. Added structural moneyTokens expectations and a reached-source
mutation. Verified control USD130 GREEN0, corruption EUR999 RED1, restored
USD130 GREEN0. Reviewer confirmed no remaining severe findings within limited
scope. Its first proposed mutation was dormant; it did not prove a changed output
escaped detection, and that claim was explicitly corrected.
