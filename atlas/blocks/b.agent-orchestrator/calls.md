# b.agent-orchestrator — calls

Что этот блок вызывает во время работы: запускает отдельным процессом или
вызывает по HTTP. Это не зависимость для порядка сборки — её пишут в
depends_on.md, и она не может замыкать цикл. Вызов может идти «вверх», к
блоку, который сам зависит от этого. Каждую строку подтверждает код: карта
кода и проверка графа кода сверяют их с тем, что код делает.

- b.acceptance-verifier-loop: agent_loop_daemon.mjs и run_block_implementation.mjs запускают verify_block_acceptance.mjs, cascade_verify.mjs, semantic_verify.mjs и verify_done_blocks_still_green.mjs — после прогона агента решает проверка приёмки, а не самоотчёт агента; соседи перепроверяются каскадом
- b.diff-review: agent_loop_daemon.mjs запускает review_diff.mjs — изменение, прошедшее приёмку, ещё читает независимый ревьюер диффа
- b.docs: auto_sync_iteration.mjs, finalize_cursor_iteration.mjs и pipeline_step.mjs запускают generate_atlas_bootstrap_js.mjs, generate_wiki.mjs, generate_tz_from_atlas.mjs и rebuild_atlas_roadmap.mjs — после итерации пересобираются данные канваса, вики, ТЗ и дорожная карта
