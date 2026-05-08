# Tech Stack (MVP lock)

- Frontend: React (Babel standalone в текущем прототипе)
- Runtime storage: localStorage (MVP)
- Atlas storage: Markdown + JSON (`/atlas`)
- Automation: CLI agents (Cursor/Claude/Codex) через hooks/адаптеры
- Backend automation: Node.js 18+ (ESM, native fetch)
- LLM providers: Anthropic API, Google Gemini API (via b.llm-gateway)

## Запреты MVP (machine-readable for guard_against_drift.mjs)

`forbidden_commands` (regex applied to the full command string):

```forbidden
^pip\s+install
^pipx\s+install
^poetry\s+(add|install)
^conda\s+install
^cargo\s+(add|install)
^go\s+install
^bundle\s+install
^gem\s+install
^composer\s+(install|require)
```

`forbidden_substrings`:

```forbidden_substrings
yarn add vue
yarn add @angular
npm install vue
npm install @angular
npm i vue
npm i @angular
```

## Allowed package managers

- `npm` / `npx` (Node.js)
- `node` / direct script execution

## Прочие правила

- Не смешивать второй фронтенд-фреймворк в активных блоках (см. forbidden_substrings).
- Не использовать альтернативные «источники правды» вне `/atlas`.
- Не устанавливать Python/Ruby/Go-зависимости — это репо чисто на Node.js.

