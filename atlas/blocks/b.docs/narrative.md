
## 2026-05-09T11:06:56.506Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-05-09T11:06:56.
- Acceptance on this block (`b.docs`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.docs` to clear the desync status

## 2026-06-06T06:39:28.451Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The `b.docs` block fails to meet its contract due to critical omissions in template validation and error handling, which are central to its mission and acceptance criteria. It also contains a bug truncating acceptance content in the wiki and misses generating content from `patterns.md`. While some aspects like layered navigation and topological sorting are correctly implemented, the core integrity of the generated documentation is compromised.

### To genuinely satisfy the contract
- Implement template phrase validation in `scripts/generate_wiki.mjs` and `scripts/generate_tz_from_atlas.mjs` to prevent leakage and cause script failure as per A1 and KPI-1. This may involve integrating or calling `scripts/validate_no_template_placeholders.mjs`.
- Fix the truncation bug in `scripts/generate_wiki.mjs` where `acceptance.md` content is cut short (change `md += '#### Ac'` to `md += '#### Acceptance\n\n' + acc + '\n\n';`).
- Ensure `auto_tz.md` includes explicit links to source `blocks/<id>/*.md` files as per A4.
- Modify `scripts/generate_tz_from_atlas.mjs` to filter blocks based on status (e.g., skip `idea` blocks without mission) and template content as per KPI-5.
- Add `patterns.md` content to the wiki generation in `scripts/generate_wiki.mjs` as specified in the mission.
