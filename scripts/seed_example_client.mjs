#!/usr/bin/env node
// Phase P-2.1 — seed atlas/clients/example/ with a realistic demo
// product so a new operator immediately sees what Sima IS for —
// the existing canon describes Sima itself, which is confusing.
//
// Demo: a Habit Tracker mobile/web product. 5 blocks (one per layer +
// data) with full mission/kpi/acceptance/depends_on/provides + a
// pre-built graph.json + project.md/rules.md/tech_stack.md.
//
// Idempotent — safe to re-run; only writes files that don't exist yet.
// Pass `--force` to overwrite (will snapshot prior versions to history/
// via patchBlockFile semantics — actually we just overwrite directly,
// no etag here; this is a seed).
//
// CLI:
//   node scripts/seed_example_client.mjs           # idempotent
//   node scripts/seed_example_client.mjs --force   # overwrite
//   node scripts/seed_example_client.mjs --json    # report

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TARGET = path.join(ROOT, 'atlas', 'clients', 'example');

// ─── Demo content: Habit Tracker product ───────────────────────────
const PROJECT_MD = `# Habit Tracker
_(demo client — example of Sima Atlas in action)_

## Цель (goal)
Дать человеку сформировать новую полезную привычку за 21-30 дней через
ежедневные короткие чек-ины и систему серий (streaks).

## Миссия (mission)
Каждое касание продукта должно занимать ≤ 30 секунд. Если выпуск из ритма —
помочь вернуться без чувства вины. Стрики мотивируют, но не наказывают
жестоко за пропуски.

## JTBD
Когда я хочу выработать новую привычку, я хочу видеть свой прогресс наглядно
и получать дружелюбные напоминания, чтобы не сорваться в первые недели.

## Аудитория
Люди 22-45, осваивающие новые привычки (фитнес, чтение, медитация, работа).
Привычны к мобильным приложениям, но скептичны к gamification-перегибам.
`;

const RULES_MD = `# Rules

## Codebase
- TypeScript strict — no \`any\`, no \`@ts-ignore\` без обоснования.
- Никаких runtime валидаторов в горячем пути (zod/yup только на edge).
- Все функции пишут unit-тесты при первом коммите, не «потом».

## UX
- Любой экран приложения должен быть полезен в течение ≤ 30 секунд.
- Не использовать модальные окна для основных действий — только bottom sheet.
- Нет жёсткого штрафования за пропуск — спокойный тон, ободрение.

## Privacy
- Данные пользователя не покидают device-local storage до явного opt-in.
- Никакого third-party tracking (Sentry, Mixpanel, Hotjar и пр.) в MVP.
`;

const TECH_STACK_MD = `# Tech stack

## Frontend
- React Native (Expo)
- TypeScript 5.x strict
- Zustand для state, TanStack Query для server-state

## Backend
- Node 22 + Fastify
- PostgreSQL 16 (через Prisma)
- Redis для streak counters

## Infra
- Single VPS на старте, переход на Fly.io после 1k DAU
- GitHub Actions CI

## Запреты
- Firebase (vendor lock-in)
- Микросервисы на старте (один монолит до 5k DAU)
`;

const BLOCKS = {
  'b.auth': {
    title: 'Auth',
    layer: 'logic',
    canvas_x: 200, canvas_y: 220,
    canvas_size: 'md',
    tech_stack: ['fastify', 'jwt', 'oauth-google', 'oauth-apple'],
    depends_on: [],
    provides: ['session_token', 'user_identity'],
    mission: `OAuth-аутентификация (Google + Apple для iOS) с выпуском JWT-сессий.
Нужна тонкая интеграция: на onboarding'е хочется минимум фрикции
(один тап через native sheet), но без compromise по приватности.

JWT — короткоживущие (15 мин) + refresh-token (30 дней) с rotation на
каждом обновлении. Никаких email/password — это лишний поверхностный
вектор атаки и трение для пользователя.`,
    kpi: [
      'p95 verify ≤ 30ms',
      'OAuth onboarding ≤ 8 секунд от тапа до главного экрана',
      '0 CVE high за 90 дней',
      'refresh rotation: 100% новых токенов выпускаются с новым refresh',
    ],
    acceptance: [
      '/auth/oauth/google возвращает JWT + refresh после успешного code exchange',
      '/auth/oauth/apple работает идентично',
      'Истёкший refresh-токен возвращает 401 без подсказок об учётке',
      'JWT secret вращается раз в 30 дней — старые токены принимаются ещё 24ч',
      'Проверено что без User-Agent header запрос отбрасывается (anti-bot)',
    ],
    tasks: [
      'T-1: Подключить @fastify/oauth2 для Google',
      'T-2: Apple sign-in через identity-token validation',
      'T-3: JWT issuer + key rotation механизм',
      'T-4: Refresh-token rotation table в Postgres',
      'T-5: Rate-limit /auth/* (10 req/min/IP)',
    ],
  },

  'b.habits': {
    title: 'Habits Storage',
    layer: 'data',
    canvas_x: 540, canvas_y: 220,
    canvas_size: 'md',
    tech_stack: ['postgresql', 'prisma', 'redis'],
    depends_on: ['b.auth: session_token'],
    provides: ['habit_record', 'habit_query'],
    mission: `Хранение привычек пользователя: имя, частота (daily/weekly), время
напоминания, активный/архивный статус, метаданные (иконка, цвет).

PostgreSQL для основного хранилища — простая реляционная модель,
миллионы записей не пугают. Никаких JSON-полей для основных атрибутов —
только структурированные колонки. Это упрощает индексацию и аналитику.`,
    kpi: [
      'p95 GET /habits ≤ 50ms (cached)',
      'p95 POST /habits ≤ 100ms',
      'Миграции Prisma идут zero-downtime',
    ],
    acceptance: [
      'CRUD endpoints для /habits с user_id из JWT',
      'Hard limit: 50 активных привычек на пользователя',
      'Soft delete: архивные привычки сохраняют историю чек-инов',
      'Schema migration tested на 100k row dataset',
    ],
    tasks: [
      'T-1: Prisma schema (Habit, HabitMeta)',
      'T-2: Repository pattern с типизированными query',
      'T-3: Redis cache для GET /habits (1 min TTL)',
    ],
  },

  'b.tracker': {
    title: 'Daily Tracker',
    layer: 'logic',
    canvas_x: 880, canvas_y: 220,
    canvas_size: 'md',
    tech_stack: ['fastify', 'redis'],
    depends_on: ['b.habits: habit_query', 'b.auth: session_token'],
    provides: ['checkin_event', 'daily_state'],
    mission: `Бизнес-логика ежедневных чек-инов: пользователь отмечает что
выполнил привычку. Самое важное — простота: один тап = один чек-ин.

Чек-ин фиксируется в Postgres (event sourcing — мы не апдейтим counter,
а добавляем event). Streak пересчитывается лениво при чтении или
проактивно через streak block.`,
    kpi: [
      'p95 POST /checkin ≤ 80ms',
      'Чек-ин сохраняется даже offline (idempotent через client-id)',
      'Дублирование одного и того же чек-ина за день безопасно (idempotent)',
    ],
    acceptance: [
      'POST /checkin с habit_id + date → 200 + новый event',
      'Двойной POST с тем же client_event_id → 200 + same event id',
      'Чек-ин на будущую дату → 400',
      'Чек-ин на дату > 30 дней назад → 400 (anti-cheating)',
    ],
    tasks: [
      'T-1: Event model + insert-only repository',
      'T-2: Idempotency через client_event_id UNIQUE',
      'T-3: Сервисный слой с date validation',
    ],
  },

  'b.streak': {
    title: 'Streak Engine',
    layer: 'logic',
    canvas_x: 1220, canvas_y: 220,
    canvas_size: 'md',
    tech_stack: ['redis', 'fastify'],
    depends_on: ['b.tracker: checkin_event'],
    provides: ['streak_count', 'achievement_event'],
    mission: `Подсчёт серий (streaks) и достижений. Серия = N дней подряд с чек-ином.
Главная UX-задача: дружелюбное обращение со срывами. После 1 пропущенного
дня серия НЕ обнуляется — даём «freeze» (как в Duolingo). После 2-х
пропусков серия мягко обнуляется с поздравлением «Время начать заново».

Хранение: Redis sorted set для top streaks, Postgres для истории.`,
    kpi: [
      'p95 GET /streak ≤ 30ms (Redis hot path)',
      'Streak пересчитывается корректно при offline check-ins (eventual consistency)',
      'Достижения (7/30/100/365 дней) триггерятся ровно один раз',
    ],
    acceptance: [
      'streak_count = N когда есть N дней подряд с чек-ином',
      '1 пропуск + freeze available → серия сохраняется',
      '2+ пропуска подряд → серия = 0, событие streak_reset',
      'Достижение на 7 дней триггерится ровно один раз даже после reset+rebuild',
    ],
    tasks: [
      'T-1: Redis ZSET по user_id → streak count',
      'T-2: Worker для пересчёта при offline burst',
      'T-3: Achievement triggers (7/30/100/365)',
    ],
  },

  'b.dashboard': {
    title: 'Dashboard UI',
    layer: 'front',
    canvas_x: 720, canvas_y: 480,
    canvas_size: 'lg',
    tech_stack: ['react-native', 'expo', 'zustand', 'tanstack-query'],
    depends_on: [
      'b.auth: session_token',
      'b.habits: habit_query',
      'b.tracker: checkin_event',
      'b.streak: streak_count',
    ],
    provides: [],
    mission: `Главный экран приложения. Видишь все активные привычки в виде
карточек, тапаешь — отмечаешь выполнение. Сверху — текущая серия + iconcа
достижения. Если что-то пропустил, freeze карточка приходит мягко.

UX-приоритеты: каждое касание ≤ 30 секунд. Никаких модалок для основного
действия — bottom sheet для деталей. Анимации — пастельные, не агрессивные.`,
    kpi: [
      'TTI (time to interactive) ≤ 1.5s на medium phone',
      'Тап «выполнено» → визуальный feedback ≤ 100ms',
      '60fps скролл списка из 50 привычек',
    ],
    acceptance: [
      'Список карточек с habit + текущим прогрессом за сегодня',
      'Тап карточки → POST /checkin + optimistic UI',
      'Bottom sheet с деталями (история, серия, заметки) — не модалка',
      'Pull-to-refresh обновляет данные с сервера',
      'Offline mode: чек-ины ставятся в очередь, sync на reconnect',
    ],
    tasks: [
      'T-1: Главный экран со скроллом карточек',
      'T-2: Habit card компонент с анимацией check-mark',
      'T-3: Bottom sheet с деталями',
      'T-4: Offline queue + sync',
      'T-5: Skeleton loaders для cold start',
    ],
  },
};

const EDGES = [
  { from: 'b.auth',    to: 'b.habits',    kind: 'rbac',   capability: 'session_token' },
  { from: 'b.auth',    to: 'b.tracker',   kind: 'rbac',   capability: 'session_token' },
  { from: 'b.auth',    to: 'b.dashboard', kind: 'rbac',   capability: 'session_token' },
  { from: 'b.habits',  to: 'b.tracker',   kind: 'data',   capability: 'habit_query' },
  { from: 'b.habits',  to: 'b.dashboard', kind: 'data',   capability: 'habit_query' },
  { from: 'b.tracker', to: 'b.streak',    kind: 'event',  capability: 'checkin_event' },
  { from: 'b.tracker', to: 'b.dashboard', kind: 'data',   capability: 'checkin_event' },
  { from: 'b.streak',  to: 'b.dashboard', kind: 'data',   capability: 'streak_count' },
];

// ─── Seed function ─────────────────────────────────────────────────
function writeIfMissing(p, content, force) {
  if (fs.existsSync(p) && !force) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
  return true;
}

function ts() { return new Date().toISOString(); }

export function seedExampleClient({ force = false } = {}) {
  const written = [];
  const skipped = [];
  const log = (p, did) => { (did ? written : skipped).push(path.relative(ROOT, p)); };

  // Top-level meta
  log(path.join(TARGET, 'project.md'),    writeIfMissing(path.join(TARGET, 'project.md'),    PROJECT_MD,    force));
  log(path.join(TARGET, 'rules.md'),      writeIfMissing(path.join(TARGET, 'rules.md'),      RULES_MD,      force));
  log(path.join(TARGET, 'tech_stack.md'), writeIfMissing(path.join(TARGET, 'tech_stack.md'), TECH_STACK_MD, force));

  // graph.json
  const graph = {
    blocks: Object.entries(BLOCKS).map(([id, b]) => ({
      id,
      title: b.title,
      status: 'idea',
      status_reason: `Demo block seeded at ${ts()}`,
      layer: b.layer,
      type: 'module',
      mvp: true,
      updated_at: ts(),
      depends_on: (b.depends_on || []).map((d) => d.split(':')[0].trim()),
      tech_stack: b.tech_stack || [],
      canvas_x: b.canvas_x,
      canvas_y: b.canvas_y,
      canvas_size: b.canvas_size,
      files: [`atlas/blocks/${id}/mission.md`],
    })),
    edges: EDGES,
  };
  log(path.join(TARGET, 'graph.json'), writeIfMissing(path.join(TARGET, 'graph.json'), JSON.stringify(graph, null, 2) + '\n', force));

  // Per-block contract files
  for (const [id, b] of Object.entries(BLOCKS)) {
    const dir = path.join(TARGET, 'blocks', id);
    log(path.join(dir, 'mission.md'),    writeIfMissing(path.join(dir, 'mission.md'),    `# ${id} — mission\n\n${b.mission}\n`,                                                                       force));
    log(path.join(dir, 'kpi.md'),        writeIfMissing(path.join(dir, 'kpi.md'),        `# ${id} — KPI\n\n${b.kpi.map((k) => `- ${k}`).join('\n')}\n`,                                                  force));
    log(path.join(dir, 'acceptance.md'), writeIfMissing(path.join(dir, 'acceptance.md'), `# ${id} — acceptance\n\n${b.acceptance.map((a, i) => `- [ ] **A${i + 1}.** ${a}`).join('\n')}\n`,             force));
    log(path.join(dir, 'tasks.md'),      writeIfMissing(path.join(dir, 'tasks.md'),      `# ${id} — tasks\n\n${b.tasks.map((t) => `- [ ] ${t}`).join('\n')}\n`,                                          force));
    log(path.join(dir, 'depends_on.md'), writeIfMissing(path.join(dir, 'depends_on.md'), `# ${id} — depends_on\n\n${b.depends_on.length ? b.depends_on.map((d) => `- ${d}`).join('\n') : '- none'}\n`, force));
    log(path.join(dir, 'provides.md'),   writeIfMissing(path.join(dir, 'provides.md'),   `# ${id} — provides\n\n${b.provides.length ? b.provides.map((p) => `- ${p}`).join('\n') : '- none'}\n`,       force));
    log(path.join(dir, 'files.md'),      writeIfMissing(path.join(dir, 'files.md'),      `# ${id} — files\n\n- atlas/blocks/${id}/mission.md [alive]\n`,                                                 force));
    log(path.join(dir, 'patterns.md'),   writeIfMissing(path.join(dir, 'patterns.md'),   `# ${id} — patterns\n\n_(будет наполнено реальными уроками после первых run-ов)_\n`,                            force));
    log(path.join(dir, 'decisions.log'), writeIfMissing(path.join(dir, 'decisions.log'), `# decisions\n${ts()}\tseed\tdemo\tDemo block created from seed_example_client.mjs\n`,                          force));
    log(path.join(dir, 'checks.log'),    writeIfMissing(path.join(dir, 'checks.log'),    `${ts()}\tseed\tpass\tDemo block created\n`,                                                                    force));
  }

  return {
    ok: true,
    target: path.relative(ROOT, TARGET),
    written: written.filter(Boolean).length,
    skipped: skipped.filter(Boolean).length,
    files: { written, skipped },
    blocks: Object.keys(BLOCKS),
    edges: EDGES.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  const wantJson = process.argv.includes('--json');
  const r = seedExampleClient({ force });
  if (wantJson) console.log(JSON.stringify(r, null, 2));
  else console.log(`seed_example_client → ${r.target}\n  written: ${r.written}\n  skipped: ${r.skipped}\n  blocks:  ${r.blocks.length}\n  edges:   ${r.edges}`);
}
