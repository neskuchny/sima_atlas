# Security Policy

## Reporting a Vulnerability

Если вы нашли security-issue в Sima Atlas — пожалуйста, **не открывайте публичный GitHub issue**. Это даст потенциальному злоумышленнику доступ к деталям до того, как мы успеем выпустить фикс.

### Как сообщить

Используйте один из приватных каналов:

1. **GitHub Security Advisory** (предпочтительно).
   Открой → [Security Advisories](https://github.com/neskuchny/sima_atlas/security/advisories/new) → «Report a vulnerability». Это создаст приватный thread, видимый только maintainer'ам.

2. **Email** на адрес maintainer'а (если он указан в `LICENSE`/`README` или [GitHub-профиле](https://github.com/neskuchny)).

Включи в отчёт:
- Описание уязвимости и потенциального impact'а
- Шаги воспроизведения (включая команду / запрос / payload)
- Версия Sima Atlas (commit hash, ветка)
- Окружение (OS, Node version, какой LLM-провайдер настроен)
- Если есть PoC — приложите

### Что мы обещаем

- **Подтверждение получения** в течение 48 часов.
- **Первичный triage** (severity, scope) в течение 7 дней.
- **Фикс или mitigation** для критичных issues — настолько быстро, насколько возможно (обычно 1-3 недели).
- **Credit** в release-notes, если вы хотите, чтобы вас упомянули (или anonymous, если предпочитаете).

### Что НЕ считается уязвимостью

- Поведение MCP-сервера, требующее explicit permission от пользователя (это by design — пользователь сам решает, запускать или нет).
- Возможность спровоцировать LLM на нежелательный output путём специально подготовленного chat-transcript'а (это inherent property любой LLM-системы; мы фильтруем noise в `sima_watch_chats`, но 100%-защиты не существует).
- Race-conditions, требующие физического доступа к файловой системе оператора.

### Supported versions

Sima Atlas сейчас в **early-stage (v0.x)**. Мы поддерживаем только `main` ветку и последний release. Если вы пользуетесь pre-release commit'ом — пожалуйста, обновитесь до текущего state of the art перед репортом.

| Версия | Поддержка |
|--------|-----------|
| `main` | ✅ всегда |
| последний tagged release | ✅ |
| старые tagged releases | ❌ — апгрейдитесь |

### Threat model

Sima Atlas работает **локально** на машине оператора. Мы не храним ваши данные у себя; единственные внешние вызовы — это LLM-провайдеры, которых вы сами настраиваете (`anthropic`, `google`, `claude_cli`, или `mock` без сети вообще).

Основные классы угроз, которые нас интересуют:
- **Prompt injection** через chat-transcripts → влияние на блок-контракты (мы фильтруем noise; см. `sima_watch_chats`)
- **Code execution** через manipulated proposals → мы не запускаем proposed-код автоматически без accept'а оператора
- **File-system escape** через path-traversal в block-id или client-id → мы валидируем regex'ом (`/^[a-zA-Z0-9._-]+$/`)
- **Credential leak** через trace-логи → `atlas/llm_traces/` gitignored по умолчанию

Если вы видите угрозу, не входящую в этот список, — особенно интересно. Сообщите.

---

Спасибо за помощь в безопасности проекта.
