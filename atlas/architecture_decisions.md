# Architecture decisions

This file is **append-only**. Every architectural choice the operator makes about the product is logged here. Agents read it as part of context-pack and MUST NOT silently reverse a past decision — if they think a decision should change, they surface it in `narrative.md` and ask the operator.

Format per entry:

```
## <ISO-date> · <one-line decision>

**Rationale:** <why this and not the alternative>
**Affects:** <block ids or "all">
**Reversible:** <yes / no / "needs operator approval">
```

The latest entry is always at the bottom — chronological, not most-important-first.

---
