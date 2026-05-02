# Tech Stack — Demo TODO

- Frontend: React 18 + Vite, TypeScript, Tailwind CSS
- Backend: Node.js 20 + Fastify, TypeScript, ESM
- Database: PostgreSQL 16
- ORM: drizzle-orm
- Tests: Vitest (unit), Playwright (e2e)
- LLM: через `b.llm-gateway` Атласа (Anthropic / Google / mock)

## Запреты MVP

```forbidden
^pip\s+install
^poetry\s+(add|install)
^conda\s+install
```

```forbidden_substrings
yarn add vue
yarn add @angular
yarn add svelte
npm install vue
npm install @angular
```

## Allowed

- `npm` / `npx`
- `node`
- `tsx` (для dev)
