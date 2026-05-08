# b.composer — mission

Композитор задач для агентов: composer.jsx собирает текст промпта + контекст и шлёт в Cursor / Claude / Codex. PR4.5 уже даёт кнопку Run agent в инспекторе; этот блок будет использоваться для свободно-формы prompt'ов.

## Layer
front

## Logic flow
Каждый компонент рендерит фрагмент UI, читает данные через единый context-pack атласа и не пишет в общий store без подтверждения через b.atlas-sync.
