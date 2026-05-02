# b.tweaks-panel — mission

Pop-up панель настроек UI: density / accent / canvas grid / artefacts view. Хранит состояние в localStorage (sima.tweaks).

## Layer
front

## Logic flow
Каждый компонент рендерит фрагмент UI, читает данные через единый context-pack атласа и не пишет в общий store без подтверждения через b.atlas-sync.
