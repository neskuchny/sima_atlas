# b.proposals-panel — mission

Sidecol-панель PR3.5: рисует pending LLM-предложения по существующим блокам с цветным diff'ом и кнопками Accept/Reject. Дёргает atlas_api_server.mjs HTTP endpoints с CORS.

## Layer
front

## Logic flow
Каждый компонент рендерит фрагмент UI, читает данные через единый context-pack атласа и не пишет в общий store без подтверждения через b.atlas-sync.
