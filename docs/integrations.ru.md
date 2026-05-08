# Подключение Sima Atlas к AI-инструментам разработки

Sima Atlas построена вокруг **MCP (Model Context Protocol)** — стандарта от Anthropic, который большинство современных AI-агентов уже поддерживают. Один и тот же MCP-сервер `scripts/mcp_atlas_server.mjs` подключается к любому из них; разница только в формате конфига и пути.

В корне репозитория лежит **`.mcp.json`** — это формат, который Claude Code и совместимые инструменты подхватывают автоматически. Для остальных — копируй соответствующий блок ниже.

> **Важно.** Команды и пути конфигов меняются. Если что-то из этого устарело — проверь текущую документацию своего инструмента и пришли PR. Версия документа: 2026-05-06.

---

## TL;DR — копи-пасты

Если коротко, везде нужен один и тот же блок (с минимальными вариациями формата):

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"],
      "cwd": "/абсолютный/путь/к/sima_atlas"
    }
  }
}
```

Если сервер запускается из директории `sima_atlas` (как в Claude Code из коробки) — `cwd` можно опустить. Для большинства инструментов поле `cwd` обязательное, потому что они обычно стартуют из директории проекта пользователя, а не из Sima.

---

## LLM provider: Ollama (local models)

R-7.60 added a local-model provider so you can run Sima entirely offline
against Llama / Qwen / DeepSeek / Mistral / etc. via [Ollama](https://ollama.com).

**Setup:**

```bash
# 1. Install Ollama (https://ollama.com/download)
# 2. Pull a model — qwen2.5-coder:7b is a strong default for code tasks
ollama pull qwen2.5-coder:7b

# 3. Start the daemon (runs on :11434 by default)
ollama serve
```

**Wire it into Sima:**

Set `LLM_PREFER_OLLAMA=1` in your environment (or in a `.env` file Sima
auto-loads). The cascade then becomes
`ollama → claude_cli → anthropic → google → mock` and Ollama wins as long
as the daemon is reachable.

```bash
# .env
LLM_PREFER_OLLAMA=1
LLM_OLLAMA_MODEL=qwen2.5-coder:7b   # whatever you pulled; default: llama3.2
OLLAMA_BASE_URL=http://localhost:11434  # default; override for remote box
```

Or use `LLM_DEFAULT_PROVIDER=ollama` to force it explicitly (no fallback —
fails loudly if Ollama isn't reachable).

**Schema mode.** Ollama's native `format: 'json'` doesn't enforce a
specific schema (unlike Anthropic's tool-use). Sima pastes the schema
into the prompt as a hint and parses the response; if the model returns
markdown-fenced JSON, the fences are stripped automatically. If parsing
fails entirely, the raw text is wrapped into the schema's first string
property — same fallback pattern we use for `claude_cli`.

**Why it's opt-in (not first in cascade by default).** The detection
probe takes ~2 seconds when the daemon isn't running, and most users
have neither installed. Setting `LLM_PREFER_OLLAMA=1` opts in and skips
the cost.

**Cost.** Zero from Sima's POV — it's your hardware. Token counts come
from Ollama's `prompt_eval_count` / `eval_count`.

For vLLM / LM Studio / llama.cpp HTTP adapters — copy the `callOllama`
function in `scripts/llm_gateway.mjs:450-525` and adjust the endpoint /
response shape. ~80 lines per adapter.

---

## Navigation skill — same strategy across all agents

MCP gives an agent the **tools** (`read_block`, `update_block`, etc.); the
navigation skill tells it **when to call which tool** and which directories to
*never* read so tokens aren't wasted on logs and snapshots.

The canonical strategy lives in [`docs/agent-navigation.md`](agent-navigation.md).
It's mirrored into per-agent adapter files that load automatically:

| Agent | File loaded automatically | Format |
|---|---|---|
| Claude Code | `.claude/skills/sima-atlas-navigator/SKILL.md` | Anthropic Skills (frontmatter `name` + `description`) |
| Cursor | `.cursor/rules/sima-atlas-navigator.mdc` | Cursor Rules (frontmatter `description` + `globs` + `alwaysApply`) |
| Codex / Aider / Continue / others | `AGENTS.md` (top-level) + `docs/agent-navigation.md` | plain markdown, include via system prompt |

When you change the strategy, edit `docs/agent-navigation.md` only. The
adapters reference it. To add support for a new agent: create an adapter file
in whatever format the agent reads on startup, with a one-line pointer to the
canonical doc.

**Why this matters:** without the skill, agents reading through `atlas/`
typically read 30+ files per task (logs, traces, history). With the skill,
the standard read order caps at ~10 reads — most of them MCP `read_block`
calls that return one digest each. On a 50-block product this saves
thousands of tokens per session.

---

## Claude Code

**Самый простой путь.** В корне репозитория уже лежит `.mcp.json`:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"]
    }
  }
}
```

Открой Claude Code в директории `sima_atlas` — он подхватит конфиг и спросит разрешение на запуск MCP-сервера. Согласись — и в сессии появятся 65 инструментов с префиксом `mcp__sima-atlas__*`.

**Альтернатива (вне директории Sima Atlas):**

```bash
claude mcp add sima-atlas node /absolute/path/to/sima_atlas/scripts/mcp_atlas_server.mjs
```

**Проверка:** в Claude Code набери `/mcp` — должен показаться `sima-atlas: connected (65 tools)`. Или попробуй: «Sima, проверь чаты» — должен сработать `sima_watch_chats`.

---

## Cursor

Cursor поддерживает MCP с конца 2024. Конфиг — `.cursor/mcp.json` (project-local) или `~/.cursor/mcp.json` (user-global).

**Project-local** (рекомендуется, если Sima — часть твоего workflow для конкретного проекта):

Создай файл `.cursor/mcp.json` в директории твоего проекта:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"],
      "cwd": "/absolute/path/to/sima_atlas"
    }
  }
}
```

**User-global:** тот же файл в `~/.cursor/mcp.json`.

**Проверка:** Cursor → Settings → MCP → должен быть статус `green` у sima-atlas. Или в чате попроси «list available MCP tools» — должны быть `mcp__sima-atlas__*`.

---

## Codex CLI (OpenAI)

Codex CLI поддерживает MCP через `~/.codex/config.toml`:

```toml
[mcp.servers.sima-atlas]
command = "node"
args = ["scripts/mcp_atlas_server.mjs"]
cwd = "/absolute/path/to/sima_atlas"
```

**Проверка:** `codex mcp list` должен показать `sima-atlas`. В сессии — попроси Codex использовать инструмент Sima.

> Точный синтаксис конфига Codex может меняться от версии. Если этот формат не работает — посмотри `codex mcp --help` и `codex --version`, и пришли PR с актуальной структурой.

---

## Continue.dev (VS Code / JetBrains)

Continue (open-source ассистент) поддерживает MCP. Конфиг — `~/.continue/config.json`, секция `experimental.modelContextProtocolServers`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["scripts/mcp_atlas_server.mjs"],
          "cwd": "/absolute/path/to/sima_atlas"
        }
      }
    ]
  }
}
```

**Проверка:** перезапусти Continue — в чате должны быть видны Sima-инструменты в `@`-меню.

---

## Zed

Zed (быстрый редактор с встроенным AI) поддерживает MCP через `settings.json`:

```json
{
  "context_servers": {
    "sima-atlas": {
      "command": {
        "path": "node",
        "args": ["scripts/mcp_atlas_server.mjs"]
      },
      "settings": {
        "cwd": "/absolute/path/to/sima_atlas"
      }
    }
  }
}
```

Открой `cmd-,` (Settings) → блок `context_servers`.

**Проверка:** в AI-панели Zed должны появиться инструменты Sima.

---

## Windsurf (Codeium Cascade)

Windsurf использует Cursor-подобный конфиг. Файл `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"],
      "cwd": "/absolute/path/to/sima_atlas"
    }
  }
}
```

**Проверка:** Cascade panel → MCP servers list.

---

## Aider

Aider не имеет нативной MCP-поддержки на момент написания, но Sima работает с ним через **CLI fallback** — см. секцию ниже.

Если Aider добавит MCP — формат, скорее всего, будет тот же. Следи за `aider --help`.

---

## Antigravity (Google)

Antigravity — относительно молодая платформа Google для AI-разработки. Состояние MCP-поддержки **меняется быстро**; конкретного стабильного формата конфига пока нет (по состоянию на май 2026).

Возможные пути на текущий момент:
1. Если у Antigravity появилась MCP-поддержка через `~/.antigravity/mcp.json` или подобный файл — используй стандартный блок выше.
2. Если нет — используй CLI fallback (см. ниже): команды Sima вызываются через bash прямо из агентского workflow.

**Если ты пользуешься Antigravity и знаешь рабочий формат — пришли PR с обновлением этой секции.**

---

## CLI fallback — для инструментов без MCP

Если твой агент не поддерживает MCP, всё равно можешь использовать Sima через обычные shell-команды. Каждый MCP-инструмент имеет CLI-эквивалент:

| MCP-инструмент | CLI-эквивалент |
|---|---|
| `sima_fill_from_chat` | `node scripts/sima_fill_from_chat.mjs --stdin --json` |
| `sima_watch_chats` | `node scripts/sima_watch_chats.mjs --once --json` |
| `read_block` | `cat atlas/blocks/<id>/*.md` |
| `verify_block_acceptance` | `node scripts/acceptance_verifier.mjs <id>` |
| `accept_proposal` | `node scripts/accept_proposal.mjs <id> [--client <c>]` |
| `nightly_consolidation` | `node scripts/nightly_consolidation.mjs` |
| `generate_full_bundle` | `node scripts/generate_wiki.mjs && node scripts/generate_tz_from_atlas.mjs && node scripts/rebuild_atlas_roadmap.mjs` |

Скармливай агенту такую инструкцию в системном промпте: «для работы со схемой используй команды через Bash: ...».

---

## HTTP API — ещё один путь

Sima ещё запускает HTTP-сервер на порту 8787 (`npm run dev` или `node scripts/atlas_api_server.mjs`). Через него можно ходить любым клиентом, поддерживающим HTTP.

Главные endpoints:
- `GET /atlas/design-payload?client=X` — текущая схема
- `POST /atlas/sima/fill-from-chat` — body `{transcript, client_id?}`
- `POST /atlas/sima/watch-chats` — body `{mode?, min_new_chars?}`
- `POST /atlas/blocks/{create,patch,delete}` — структурные операции
- `GET /atlas/proposals/list?client=X` — `POST /proposals/{accept,reject}`
- `POST /atlas/acceptance/verify` — body `{block_id}`

Это полезно, если у твоего инструмента есть HTTP-tooling, но нет MCP. Например, можно сделать GPT-Action / Claude API tool, который вызывает эти endpoints.

---

## Проверка после подключения

После регистрации MCP-сервера в любом инструменте:

1. **Проверь, что инструменты видны.** В Claude Code: `/mcp`. В Cursor: Settings → MCP. В Codex: `codex mcp list`.
2. **Простейший вызов:** попроси агента «сколько блоков в текущем атласе» — должен сработать `read_block` на корневом графе.
3. **Полный smoke:** «Sima, заполни схему по этой переписке: <вставь любой кусок>». Должен появиться `chat_fill` plan в `atlas/proposals/`.

Если что-то не работает — проверь логи MCP-сервера: запусти его руками `node scripts/mcp_atlas_server.mjs` и посмотри stderr. Большинство ошибок — это (a) неверный `cwd`, (b) Node.js не на PATH, (c) непрочитанный `package.json` (не было `npm install`).

---

## Что нам нужно от сообщества

- Обновлённые конфиги для **Antigravity** и других инструментов, которые быстро меняются.
- Натив-плагины для **VS Code** и **JetBrains**, чтобы canvas жил в side-panel рядом с кодом.
- Адаптеры для агент-фреймворков (LangGraph, AutoGen, CrewAI), которые могут использовать MCP / HTTP API.

Делай PR в этот файл с любыми обновлениями — это живой документ.
