{
  "project": {
    "name": "Tessent Monorepo — Architecture Audit",
    "description": "Сводная архитектурная схема монорепо tessent-test_new по результатам аудита кода",
    "goal": "Зафиксировать структуру 4 проектов, их связи, инфраструктуру и узкие места перед production-деплоем",
    "targetAudience": "Tech-lead, DevOps, инвестор / клиент",
    "mvpDescription": "tessent_brain (закрытая бета) + sima-app (single-user) + два async-агентских модуля",
    "idealProduct": "Multi-tenant SaaS с единым auth, общей инфраструктурой Postgres+AGE/Qdrant/Redis, CI/CD, observability и tenant-изоляцией",
    "narrativeProblem": "Монорепо из 4 проектов разной зрелости (~198K LOC), ~12МБ дублей в папках 'копия', нет CI, hardcoded JWT-секреты, sima-app без auth, тяжёлый стек (Postgres+Neo4j+Qdrant+Redis) делает per-tenant деплой дорогим.",
    "narrativeSolution": "Зачистить дубли → ввести multi-tenant в tessent_brain (RLS + namespace в Qdrant + label в Neo4j) → заменить Neo4j на Postgres+AGE для дешёвых деплоев → добавить auth в sima-app → собрать общий CI/CD.",
    "narrativeHowItWorks": "tessent_brain capture → store (graph+vector+sql) → search (hybrid) → think (KAG) → respond через chat/agents/data_bus. Sima-app — отдельный конструктор продуктов на OpenAI. Alfa и Mark001 — async AG2-агенты для встреч и маркетинга через OpenAI-совместимый API.",
    "narrativeProductMap": "Frontend (Next.js) ↔ API (LiteStar) ↔ Workers (Taskiq) ↔ Storage (PG/Neo4j/Qdrant/Redis) ↔ LLM-router (Gemini/OpenAI/Ollama) ↔ Integrations (14 внешних сервисов).",
    "narrativeDecisions": "1) Gemini-first из-за context caching. 2) Neo4j для temporal graph (под вопросом для дешёвых деплоев). 3) Qdrant вместо Pinecone для self-host. 4) AG2 для async агентских модулей. 5) Sima вынесена в standalone next.js."
  },

  "blocks": [
    {
      "id": "b-tessent-brain",
      "label": "TB",
      "name": "tessent_brain",
      "type": "core",
      "layer": "mvp",
      "color": "#6366F1",
      "positionX": 600, "positionY": 300,
      "businessValue": "Корпоративная память + reasoning — основная IP компании",
      "userBenefit": "Один поиск по встречам, документам, задачам со ссылками на источники",
      "problemSolved": "Знания компании размазаны по Slack/Notion/Jira/Gmail",
      "impactIfRemoved": "Без него остальные модули — только обвязка; продукта нет",
      "metrics": "Recall@10 гибридного поиска, latency KAG, точность снэпшотов",
      "description": "LiteStar-бэкенд (~124K Python) + Next.js-фронт. 20+ агентов capture, hybrid search, temporal graph, 3-уровневая память",
      "estimatedComplexity": "high",
      "blockTechStack": "[\"Python 3.11\",\"LiteStar\",\"Granian\",\"Taskiq\",\"Next.js 14\",\"React 18\",\"Tailwind\",\"Zustand\"]",
      "risks": "hardcoded JWT secret_key='change-me-in-production'; 166 print() вместо structlog; APScheduler без distributed lock"
    },
    {
      "id": "b-tb-capture",
      "label": "C",
      "name": "core/capture",
      "type": "agent",
      "layer": "mvp",
      "color": "#10B981",
      "positionX": 320, "positionY": 180,
      "parentBlockId": "b-tessent-brain",
      "description": "Оркестратор 20+ агентов извлечения (decisions, tasks, KPI, opinions, ideas, participants…)",
      "inputData": "Транскрипты встреч, документы, письма",
      "outputData": "Структурированные сущности и связи",
      "estimatedComplexity": "high"
    },
    {
      "id": "b-tb-store",
      "label": "S",
      "name": "core/store",
      "type": "data",
      "layer": "mvp",
      "color": "#F59E0B",
      "positionX": 600, "positionY": 180,
      "parentBlockId": "b-tessent-brain",
      "description": "graph_builder.py (Neo4j) + vector_indexer.py (Qdrant 768D) + Postgres",
      "estimatedComplexity": "high"
    },
    {
      "id": "b-tb-search",
      "label": "Sr",
      "name": "core/search",
      "type": "core",
      "layer": "mvp",
      "color": "#6366F1",
      "positionX": 880, "positionY": 180,
      "parentBlockId": "b-tessent-brain",
      "description": "enhanced_search_orchestrator: vector + BM25 + graph + RRF + LLM reflection",
      "estimatedComplexity": "high"
    },
    {
      "id": "b-tb-think",
      "label": "T",
      "name": "core/think (KAG)",
      "type": "core",
      "layer": "medium",
      "color": "#EC4899",
      "positionX": 880, "positionY": 320,
      "parentBlockId": "b-tessent-brain",
      "description": "reasoning_engine.py — KAG reasoning, частично TODO в routes/analyze.py:5",
      "risks": "KAG не дореализован — в audit найдено 5 TODO именно в analyze.py",
      "estimatedComplexity": "high"
    },
    {
      "id": "b-tb-temporal",
      "label": "Tm",
      "name": "core/temporal (Graphiti)",
      "type": "feature",
      "layer": "mvp",
      "color": "#8B5CF6",
      "positionX": 600, "positionY": 320,
      "parentBlockId": "b-tessent-brain",
      "description": "Версионирование сущностей во времени, episodes"
    },
    {
      "id": "b-tb-databus",
      "label": "DB",
      "name": "core/data_bus",
      "type": "core",
      "layer": "mvp",
      "color": "#0EA5E9",
      "positionX": 320, "positionY": 320,
      "parentBlockId": "b-tessent-brain",
      "description": "12 эндпоинтов с redaction, rate-limit, tenant-policies — единственное место с rate-limit",
      "businessValue": "Multi-tenant выдача наружу — основа SaaS-продажи"
    },
    {
      "id": "b-tb-memory",
      "label": "M",
      "name": "core/memory",
      "type": "feature",
      "layer": "mvp",
      "color": "#A855F7",
      "positionX": 320, "positionY": 460,
      "parentBlockId": "b-tessent-brain",
      "description": "MemGPT 3-уровневая память + rule_book + user_profiles"
    },
    {
      "id": "b-tb-integrations",
      "label": "I",
      "name": "core/integrations (14)",
      "type": "integration",
      "layer": "mvp",
      "color": "#22C55E",
      "positionX": 600, "positionY": 460,
      "parentBlockId": "b-tessent-brain",
      "description": "Slack, Notion, Jira, Trello, Gmail, GitHub, Google Workspace, HubSpot, WhatsApp, Linear, Confluence, Figma",
      "businessValue": "Дорого реплицировать — основной moat"
    },
    {
      "id": "b-tb-llm",
      "label": "L",
      "name": "core/llm router",
      "type": "core",
      "layer": "mvp",
      "color": "#F97316",
      "positionX": 880, "positionY": 460,
      "parentBlockId": "b-tessent-brain",
      "description": "LiteLLM, Gemini-first + context caching (90% экономия), OpenAI fallback, Ollama FunctionGemma локально"
    },

    {
      "id": "b-sima",
      "label": "SM",
      "name": "sima-app (standalone)",
      "type": "feature",
      "layer": "mvp",
      "color": "#EAB308",
      "positionX": 1200, "positionY": 220,
      "businessValue": "AI-конструктор продуктов; 9 моделей Prisma, 19 API-роутов",
      "description": "Next.js 14 + Prisma 5 + SQLite + OpenAI gpt-4o, Playwright e2e ~5%",
      "risks": "🔴 Auth отсутствует. SQLite не масштабируется. as-unknown типизация в /api/ai/chat",
      "estimatedComplexity": "medium",
      "blockTechStack": "[\"Next.js 14\",\"Prisma 5\",\"SQLite\",\"OpenAI SDK\",\"ReactFlow 12\",\"Zustand\",\"Playwright\"]"
    },
    {
      "id": "b-alfa",
      "label": "AL",
      "name": "alfa_asynk_meetflow",
      "type": "agent",
      "layer": "mvp",
      "color": "#14B8A6",
      "positionX": 1200, "positionY": 380,
      "description": "AG2 + FastAPI/Litestar, 12 агентов для встреч/задач, OpenAI-compatible API:8001, ~6.7K LOC",
      "risks": "Default Postgres password в docker-compose.yml:16; 4 голых except в automation_tools_async.py",
      "estimatedComplexity": "medium"
    },
    {
      "id": "b-mark001",
      "label": "MK",
      "name": "mark001_async",
      "type": "agent",
      "layer": "mvp",
      "color": "#F43F5E",
      "positionX": 1200, "positionY": 540,
      "description": "AG2 + Litestar, 6 маркетинговых агентов + web scraper + RAG + guardrails, ~1K LOC",
      "risks": "Несколько TODO в ключевых местах (telegram_agent, automation_tools email); нет docker-compose; голые except в скрапере",
      "estimatedComplexity": "low"
    },

    {
      "id": "b-postgres",
      "label": "PG",
      "name": "Postgres 16 + TimescaleDB",
      "type": "data",
      "layer": "mvp",
      "color": "#0369A1",
      "positionX": 100, "positionY": 700,
      "description": "OLTP + 7 миграций; кандидат на + Apache AGE вместо Neo4j"
    },
    {
      "id": "b-neo4j",
      "label": "N4",
      "name": "Neo4j 5",
      "type": "data",
      "layer": "mvp",
      "color": "#0EA5E9",
      "positionX": 320, "positionY": 700,
      "description": "Граф знаний",
      "risks": "Самый дорогой сервис при per-tenant деплое (AuraDB ~$65/мес)"
    },
    {
      "id": "b-qdrant",
      "label": "QD",
      "name": "Qdrant",
      "type": "data",
      "layer": "mvp",
      "color": "#9333EA",
      "positionX": 540, "positionY": 700,
      "description": "Vector store, 768D"
    },
    {
      "id": "b-redis",
      "label": "RD",
      "name": "Redis 7",
      "type": "data",
      "layer": "mvp",
      "color": "#DC2626",
      "positionX": 760, "positionY": 700,
      "description": "Cache + Taskiq broker"
    },
    {
      "id": "b-supabase",
      "label": "SB",
      "name": "Supabase",
      "type": "integration",
      "layer": "mvp",
      "color": "#16A34A",
      "positionX": 980, "positionY": 700,
      "description": "Используется alfa_asynk и tessent_brain (db/supabase_client.py) для внешних интеграций"
    },

    {
      "id": "b-cicd",
      "label": "CI",
      "name": "CI/CD (отсутствует)",
      "type": "feature",
      "layer": "ideal",
      "color": "#6B7280",
      "positionX": 1500, "positionY": 220,
      "description": "Нет .github/workflows, нет vercel/netlify конфига",
      "risks": "🔴 Блокер прода — релизы вручную"
    },
    {
      "id": "b-multitenant",
      "label": "MT",
      "name": "Multi-tenant layer",
      "type": "feature",
      "layer": "ideal",
      "color": "#6B7280",
      "positionX": 1500, "positionY": 380,
      "description": "tenant_paths.py есть, но не сквозной; нужна RLS в Postgres, namespace в Qdrant, label в Neo4j",
      "businessValue": "Без него каждый клиент = отдельная инфра ($30–60/мес)"
    },
    {
      "id": "b-cleanup",
      "label": "CL",
      "name": "Repo cleanup",
      "type": "feature",
      "layer": "ideal",
      "color": "#6B7280",
      "positionX": 1500, "positionY": 540,
      "description": "Удалить 6 папок 'копия' (~12МБ), банановый модуль, legacy /agents и /memory, объединить alfa+mark001 в одну AG2-обвязку"
    }
  ],

  "connections": [
    { "fromBlockId": "b-tb-capture",     "toBlockId": "b-tb-store",       "type": "data_flow", "label": "entities", "dataFormat": "JSON" },
    { "fromBlockId": "b-tb-store",       "toBlockId": "b-tb-search",      "type": "data_flow", "label": "index" },
    { "fromBlockId": "b-tb-search",      "toBlockId": "b-tb-think",       "type": "data_flow", "label": "candidates" },
    { "fromBlockId": "b-tb-think",       "toBlockId": "b-tb-databus",     "type": "data_flow", "label": "answer" },
    { "fromBlockId": "b-tb-temporal",    "toBlockId": "b-tb-store",       "type": "dependency", "label": "versioning" },
    { "fromBlockId": "b-tb-memory",      "toBlockId": "b-tb-think",       "type": "data_flow", "label": "context" },
    { "fromBlockId": "b-tb-integrations","toBlockId": "b-tb-capture",     "type": "trigger",   "label": "events" },
    { "fromBlockId": "b-tb-llm",         "toBlockId": "b-tb-capture",     "type": "dependency", "label": "Gemini/OpenAI", "style": "dashed" },
    { "fromBlockId": "b-tb-llm",         "toBlockId": "b-tb-think",       "type": "dependency", "style": "dashed" },
    { "fromBlockId": "b-tb-llm",         "toBlockId": "b-tb-search",      "type": "dependency", "style": "dashed", "label": "reflection" },

    { "fromBlockId": "b-tessent-brain",  "toBlockId": "b-postgres",       "type": "dependency" },
    { "fromBlockId": "b-tessent-brain",  "toBlockId": "b-neo4j",          "type": "dependency" },
    { "fromBlockId": "b-tessent-brain",  "toBlockId": "b-qdrant",         "type": "dependency" },
    { "fromBlockId": "b-tessent-brain",  "toBlockId": "b-redis",          "type": "dependency" },

    { "fromBlockId": "b-alfa",           "toBlockId": "b-supabase",       "type": "dependency" },
    { "fromBlockId": "b-alfa",           "toBlockId": "b-redis",          "type": "dependency" },
    { "fromBlockId": "b-mark001",        "toBlockId": "b-redis",          "type": "dependency" },

    { "fromBlockId": "b-sima",           "toBlockId": "b-tessent-brain",  "type": "data_flow", "label": "TODO: integration", "style": "dotted", "businessMeaning": "data-ingestion-service.ts помечен TODO" },
    { "fromBlockId": "b-alfa",           "toBlockId": "b-tessent-brain",  "type": "data_flow", "label": "resync_all_meetings.py", "style": "dotted" },

    { "fromBlockId": "b-multitenant",    "toBlockId": "b-tb-databus",     "type": "dependency", "label": "RLS+namespace", "style": "dashed", "businessMeaning": "Без MT нельзя дёшево обслуживать клиентов" },
    { "fromBlockId": "b-multitenant",    "toBlockId": "b-postgres",       "type": "dependency", "style": "dashed" },
    { "fromBlockId": "b-multitenant",    "toBlockId": "b-qdrant",         "type": "dependency", "style": "dashed" },
    { "fromBlockId": "b-multitenant",    "toBlockId": "b-neo4j",          "type": "dependency", "style": "dashed" },
    { "fromBlockId": "b-cicd",           "toBlockId": "b-tessent-brain",  "type": "trigger",   "style": "dashed", "label": "deploy" },
    { "fromBlockId": "b-cicd",           "toBlockId": "b-sima",           "type": "trigger",   "style": "dashed" },
    { "fromBlockId": "b-cleanup",        "toBlockId": "b-tessent-brain",  "type": "dependency", "style": "dashed", "label": "удалить копии" },
    { "fromBlockId": "b-cleanup",        "toBlockId": "b-alfa",           "type": "dependency", "style": "dashed", "label": "слить с mark001" },
    { "fromBlockId": "b-cleanup",        "toBlockId": "b-mark001",        "type": "dependency", "style": "dashed" }
  ]
}