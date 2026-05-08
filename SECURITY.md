# Security Policy

> Russian original preserved at [`./SECURITY.ru.md`](./SECURITY.ru.md).

## Reporting a Vulnerability

If you've found a security issue in Sima Atlas — please **don't open a public GitHub issue**. That gives a potential attacker access to the details before we can ship a fix.

### How to report

Use one of the private channels:

1. **GitHub Security Advisory** (preferred).
   Open → [Security Advisories](https://github.com/neskuchny/sima_atlas/security/advisories/new) → "Report a vulnerability". This creates a private thread visible only to the maintainers.

2. **Email** to the maintainer's address (if listed in `LICENSE` / `README` or on the [GitHub profile](https://github.com/neskuchny)).

Include in the report:
- A description of the vulnerability and its potential impact
- Reproduction steps (including the command / request / payload)
- Sima Atlas version (commit hash, branch)
- Environment (OS, Node version, which LLM provider is configured)
- A PoC if you have one

### What we promise

- **Acknowledgement** within 48 hours.
- **Initial triage** (severity, scope) within 7 days.
- **Fix or mitigation** for critical issues — as fast as we can (typically 1–3 weeks).
- **Credit** in the release notes if you'd like to be mentioned (or anonymous, if you'd rather).

### What is NOT considered a vulnerability

- Behavior of the MCP server that requires explicit permission from the user (this is by design — the user decides whether to run it).
- The ability to coax an LLM into undesirable output via a specially crafted chat transcript (this is an inherent property of any LLM system; we filter noise in `sima_watch_chats`, but 100% protection doesn't exist).
- Race conditions that require physical access to the operator's filesystem.

### Supported versions

Sima Atlas is currently in **early stage (v0.x)**. We support only the `main` branch and the latest release. If you're on a pre-release commit — please update to the current state of the art before reporting.

| Version | Support |
|--------|-----------|
| `main` | ✅ always |
| latest tagged release | ✅ |
| older tagged releases | ❌ — please upgrade |

### Threat model

Sima Atlas runs **locally** on the operator's machine. We don't store your data on our side; the only outbound calls are to LLM providers that you yourself configure (`anthropic`, `google`, `claude_cli`, or `mock` with no network at all).

Main classes of threat we're interested in:
- **Prompt injection** via chat transcripts → impact on block contracts (we filter noise; see `sima_watch_chats`)
- **Code execution** via manipulated proposals → we don't run proposed code automatically without operator accept
- **Filesystem escape** via path traversal in block-id or client-id → we validate via regex (`/^[a-zA-Z0-9._-]+$/`)
- **Credential leak** through trace logs → `atlas/llm_traces/` is gitignored by default

If you see a threat outside this list — that's especially interesting. Let us know.

---

Thanks for helping with the project's security.
