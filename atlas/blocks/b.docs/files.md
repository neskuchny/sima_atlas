# b.docs — files

- scripts/generate_wiki.mjs [alive]
- scripts/generate_tz_from_atlas.mjs [alive]
- scripts/render_wiki_html.mjs [alive]
- scripts/rebuild_atlas_roadmap.mjs [alive]
- scripts/generate_atlas_bootstrap_js.mjs [alive] (PR2 — emits layered bootstrap)
- atlas/WIKI.md [alive] (auto-generated)
- atlas/wiki.html [alive] (auto-generated)
- atlas/roadmap.md [alive] (auto-generated)
- atlas/nightly_report.md [alive] (auto-generated)

## R-8.10 — previously unowned

These files had no owner in any files.md, so the code-graph check never saw their imports.
- scripts/subagent_wiki_builder.mjs [alive]
- scripts/sync_article_status.mjs [alive]
- scripts/capture_hero_screenshot.mjs [alive] (README hero image)
- tests/docs_generators.selftest.mjs [alive] (R-8.11: acceptance A3/A5 — the real roadmap.md respects dependencies; a synthetic atlas where status and dependencies disagree; a block without a layer gets «Без слоя»)
