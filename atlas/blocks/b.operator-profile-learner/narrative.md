
## 2026-05-09T11:06:56.506Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-05-09T11:06:56.
- Acceptance on this block (`b.operator-profile-learner`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.operator-profile-learner` to clear the desync status

## 2026-09-22 — R-8.11: A7 (privacy gate) checked — and the rule it claimed was missing

A7 said the operator profile's privacy was explained in atlas/rules.md; it
was not. The rule is there now (history is not committed; profile files carry
no names, e-mails, keys or tokens), and `tests/operator_profile_privacy.selftest.mjs`
checks .gitignore, the rule, a PII scan of every committed profile file, and
that the scanner itself catches each kind. Names are not machine-checkable
and are not claimed.
