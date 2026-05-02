# b.atlas-sync — mission

Клиентская state machine: загружает atlas/<projId>/ из bootstrap, делает syncCheck (issues для drift/broken), persists в localStorage. PR3.6 захардил против undefined-JSON crash.

## Layer
logic

## Logic flow
Каждый компонент рендерит фрагмент UI, читает данные через единый context-pack атласа и не пишет в общий store без подтверждения через b.atlas-sync.
