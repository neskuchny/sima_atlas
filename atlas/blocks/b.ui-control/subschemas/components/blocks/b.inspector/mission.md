# b.inspector — mission

Правая панель инспектора блока: показывает mission/kpi/acceptance + lifecycle-кнопки (Implement/Review/Done/Rollback) + Run agent (PR4.5) + блок sync-issues (PR2.5).

## Layer
front

## Logic flow
Каждый компонент рендерит фрагмент UI, читает данные через единый context-pack атласа и не пишет в общий store без подтверждения через b.atlas-sync.
