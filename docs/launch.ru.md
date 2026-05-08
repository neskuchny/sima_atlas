export ANTHROPIC_API_KEY=sk-ant-...
npm run dev

Шаг 1. Подготовка окружения
# Клонировать ветку (она ещё не в main)
git checkout claude/visual-component-system-N2W07

# Установить зависимости (если ещё нет)
npm install

# LLM — нужен ключ хотя бы одного провайдера, иначе Sima работает в demo-режиме
export ANTHROPIC_API_KEY=sk-ant-...
# или
export GOOGLE_API_KEY=...

# Если хочешь чтобы Sima реально дёргала Claude Code для написания кода:
npm install -g @anthropic-ai/claude-code   # или ваш способ установки claude CLI
Шаг 2. Запуск
npm run dev
Это поднимает:

atlas_api_server на :8787 (бэк со всеми endpoint-ами)
python http-server на :8000 (статика)
Открывает браузер на /atlas_design/index.html
Шаг 3. Создать новый проект
В шапке кликаешь pill main (project picker) → ＋ новый клиент → вводишь имя своего продукта (my-saas например). Перезагружается на ?client=my-saas.

Альтернатива — посмотреть как работает на готовом примере: переключиться на example (Habit Tracker, 5 блоков с полным контентом).

Шаг 4. Наполнить контекст
В шапке 📖 Доки → редактируешь:

project.md — цель, миссия, JTBD, аудитория продукта
rules.md — запреты в коде (no any, no zod, не делать модалки, и т.п.)
tech_stack.md — фреймворки + версии + чего НЕ использовать
Это самое важное — агенты читают эти файлы перед каждой работой.

Шаг 5. Создать первые блоки
Три способа:

a) Из шаблона (быстро): Topbar ⌬ Шаблоны → выбираешь Продукт/Книга/Идея/Маркетинг → префикс ID → создаются 5-6 блоков сразу.

b) Из источника (умно): Topbar ＋ Артефакт → вставляешь транскрипт встречи / документ → опционально «◔ Найти смыслы» (LLM достанет goals/risks/ideas) → «✦ Sima предложит блоки» → принимаешь 1-3 драфта → блоки созданы с готовыми mission/kpi/acceptance.

c) Вручную: ПКМ на канвасе → «＋ Новый модуль».

Шаг 6. Дозаполнить контракт каждого блока
Кликаешь на блок → Контракт tab. Видишь 7 файлов с флагами (! пусто / ⚠ слабо / ✓ заполнено):

mission.md · user_story.md · kpi.md · acceptance.md · depends_on.md · provides.md · code_summary.md
На пустых — ✨ Заполнить (Sima пишет черновик из контекста, ты редактируешь, сохраняешь). На заполненных — ✏ Переформулировать.

Шаг 7. Запустить агента
В блоке → Запуски tab → Запустить блок → → выбираешь Claude Code / Cursor / Codex.

Что происходит:

Sima собирает context-pack: project + rules + tech_stack + mission/user_story/kpi/acceptance этого блока + provides соседей + dead-файлы исключены
Спавнит агента в workspace под ~/.atlas_workspaces/<run_id>/
Live tail stdout/stderr виден в той же tab-е
После завершения автоматически:
acceptance verifier (deterministic)
distill — атомарные decisions из лога → decisions.log
reflect — урок (что сработало / нет / на следующий раз) → patterns.md
summarize — code_summary.md блока обновлён
cleanup — память подрезана до cap
Шаг 8. Проверить результат
Приёмка tab — verdict + violations + acceptance diff (что улучшилось / регрессировало)
Соответствие tab — LLM-судья «миссия vs реализация»
Если fail → ↻ Исправить и перезапустить — Sima собирает промпт из failed assertions и шлёт обратно
Шаг 9. Систему проверки
Topbar ⟳ Sync — детерминистичный sync-report (9 валидаторов)
Topbar 🔍 Ревью продукта — то же + LLM-судья по каждому блоку
Topbar 🏛 Архитектура — целостность стэков, масштабируемость, multi-tenant fit на уровне всего продукта
Topbar ⚙ Подагенты — schema-syncer / verifier / wiki-builder вручную
Шаг 10. Что Sima пишет сама
После того как ты «уехал» в Cursor и поработал над кодом руками:

Запусти node scripts/subagent_wiki_builder.mjs (или из UI ⚙ Подагенты → wiki-builder) — пересобирает WIKI.md / wiki.html / roadmap / auto_tz из канона
Per-block 📖 Гайд пользователю в Overview генерит step-by-step «куда нажать» для конечника