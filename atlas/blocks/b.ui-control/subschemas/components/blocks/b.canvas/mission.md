# b.canvas — mission

SVG-канвас архитектурной схемы: рисует горизонтальные слои, блоки с портами, связи depends_on/data/path. Отвечает за drag&drop блоков между слоями и подсветку drift/broken (PR2.5).

## Layer
front

## Logic flow
Каждый компонент рендерит фрагмент UI, читает данные через единый context-pack атласа и не пишет в общий store без подтверждения через b.atlas-sync.
