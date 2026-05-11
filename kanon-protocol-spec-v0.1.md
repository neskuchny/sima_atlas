# Kanon Protocol Specification

**Version:** 0.1 (Draft)
**Status:** Pre-release. Subject to change before v1.0.
**Audience:** Implementers of Kanon-compliant tools.

This document defines the structural and behavioural requirements that any Kanon-compliant implementation MUST, SHOULD, or MAY satisfy. It complements the Kanon Protocol Manifesto, which establishes principles; this document establishes enforceable contracts.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in [RFC 2119].

---

## 1. Scope

This specification defines:

1. The structure of a **Kanon block** — the unit of product organisation.
2. The required and optional files inside a block.
3. The semantics of **tri-state acceptance**.
4. The semantics of **cascade verification**.
5. The semantics of **typed memory**.
6. The semantics of **operator profile**.
7. The minimum set of operations a Kanon-compliant implementation MUST provide.
8. The three **compliance levels** an implementation MAY claim.

It does NOT define:

- The user interface of an implementation (canvas style, IDE integration, CLI conventions).
- The choice of programming language, runtime, or storage backend.
- The choice of LLM provider or local model.
- The format of evidence collectors beyond a minimal interface.
- Cost reporting units (currency, token denomination) beyond requiring stability.

Implementations MAY extend the protocol with features not described here, provided such extensions do not contradict the requirements stated.

---

## 2. The Kanon block

### 2.1 Definition

A **Kanon block** is a directory representing one logical unit of product functionality. A block has a unique identifier, a contract, optional code, and optional narrative memory.

Block identifiers MUST be stable across renames of human-readable names. Implementations MAY use any identifier scheme (UUID, slug, content hash) provided identifiers are unique within a project.

### 2.2 Required structure

A Kanon-compliant block MUST contain at minimum:

```
blocks/<block-id>/
├── contract/
│   ├── mission.md          # REQUIRED
│   ├── acceptance.md       # REQUIRED
│   ├── depends_on.json     # REQUIRED (MAY be empty array)
│   └── provides.json       # REQUIRED (MAY be empty array)
├── narrative.md            # REQUIRED, MAY be empty on creation
└── code/                   # OPTIONAL until the block is implemented
```

Implementations MAY add files to `contract/` (for example, `kpi.md`, `constraints.md`, `interface.md`) provided the four required files are present.

### 2.3 `mission.md`

A free-form Markdown document stating, in human language, what the block exists for. Length is not constrained but SHOULD be between 50 and 500 words. The mission MUST be readable in isolation — without reference to other blocks — and SHOULD answer:

- What does this block do.
- Why does it exist (what would be lost without it).
- What is explicitly NOT in scope for this block.

### 2.4 `acceptance.md`

A document defining what makes a run on this block **pass**, **fail**, or **inconclusive**. The format is implementation-defined but MUST allow:

- At least one **deterministic check** (exit code, file presence, file content match, log pattern, self-test pass).
- At least one explicit **inconclusive condition** (what circumstances cause the run to be neither passed nor failed).

Implementations MUST NOT permit a block to be declared "passed" if no deterministic check has been satisfied. An LLM-as-judge result alone is INSUFFICIENT for pass — it MAY contribute to a verdict but MUST be paired with at least one deterministic collector.

### 2.5 `depends_on.json`

A JSON array of block identifiers this block depends on. An empty array (`[]`) is valid. The contents are used to construct the project graph.

```json
["block-auth", "block-db-schema"]
```

### 2.6 `provides.json`

A JSON array of identifiers (or descriptors) that this block exposes for other blocks to consume. The format is implementation-defined.

```json
["api/users", "schema/User"]
```

### 2.7 `narrative.md`

A per-block append-only log of attempts: what was tried, what worked, what failed, why. Each entry SHOULD include a timestamp and a verdict (pass / fail / inconclusive). The narrative is read by the agent on every run on this block; it is the block's local memory.

Implementations MUST NOT silently truncate `narrative.md`. They MAY archive old entries to a sibling file but MUST preserve historical record.

---

## 3. Tri-state acceptance

### 3.1 The three verdicts

Every run of a Kanon-compliant implementation against a block MUST conclude with exactly one of three verdicts:

- **pass** — at least one deterministic check satisfied; no deterministic check failed.
- **fail** — at least one deterministic check failed.
- **inconclusive** — no deterministic check satisfied AND no deterministic check failed; OR a condition explicitly enumerated as inconclusive in `acceptance.md` was met.

A run that produces no evidence MUST default to **inconclusive**, NOT pass. This is the central anti-pattern Kanon prevents.

### 3.2 Evidence collectors

A Kanon-compliant implementation MUST support at minimum the following deterministic evidence collectors:

| Collector | Triggers verdict |
|---|---|
| `exit_code` | pass on 0; fail on non-zero |
| `file_exists` | pass if all named files present; fail if any missing |
| `file_content_matches` | pass on regex/string match; fail on no match |
| `log_pattern` | pass on pattern present in stdout/stderr; fail on absent |
| `selftest` | pass on self-test exit 0; fail otherwise |

Implementations MAY support additional collectors. Implementations MAY support an `llm_judge` collector but it MUST NOT be the sole basis for a pass verdict.

### 3.3 Evidence aggregation

When multiple collectors report on a single run, the verdict is determined as follows:

1. If any collector returns **fail** → run verdict is **fail**.
2. Else if at least one deterministic collector returns **pass** → run verdict is **pass**.
3. Else → run verdict is **inconclusive**.

An implementation MAY allow operator override of this aggregation but MUST log the override and the reason.

---

## 4. Cascade verification

### 4.1 Trigger

After a run on block X concludes with verdict **pass**, a Kanon-compliant implementation MUST initiate cascade verification on the reverse-dependency closure of X — that is, every block that lists X (directly or transitively) in its `depends_on.json`.

Cascade verification MAY be deferred (queued for batch execution) but MUST NOT be skipped. If deferred, the implementation MUST mark dependent blocks as `pending-cascade` until verification completes.

### 4.2 Per-dependent verdict

For each block Y in the reverse-dependency closure, the implementation re-runs Y's acceptance checks. The verdict is recorded as one of:

- **green** — Y still passes after X's change.
- **desync** — Y previously passed but now fails or is inconclusive.
- **untouched** — Y has no acceptance checks runnable in the current environment (this is logged but not treated as a failure of cascade).

### 4.3 Surfacing

Blocks in `desync` state MUST be visible on the implementation's primary surface (canvas, CLI report, IDE panel) within the same session as the triggering run. Implementations MUST NOT defer surfacing to a later session.

A `desync` block MUST also have a line appended to its `narrative.md` describing the cascade event: which upstream block changed, when, and what acceptance check began failing.

---

## 5. Typed memory

### 5.1 Operator profile

A Kanon-compliant implementation MUST support a per-operator profile directory, separate from per-project memory. The profile MUST contain at minimum:

```
operator_profile/
├── lessons.json          # generalised lessons across projects
├── dont_use.json         # operator-level prohibitions
└── always_use.json       # operator-level requirements
```

### 5.2 Project memory

A Kanon-compliant implementation MUST support per-project memory, separate from per-block narrative. Project memory MUST contain at minimum:

```
project/
├── architecture_decisions.md   # append-only design log
└── decisions.log               # structured run log
```

### 5.3 Severity levels

Entries in `dont_use.json` and `always_use.json` MUST support a `severity` field with at least two levels:

- `hard` — violation MUST cause a run to be marked **fail**.
- `soft` — violation MUST be surfaced as a warning but does NOT force fail.

Implementations MAY support additional severity levels (`info`, `critical`) but MUST preserve the semantics of `hard` and `soft`.

### 5.4 Injection rules

Implementations MUST inject `architecture_decisions.md` into agent context on every run. Implementations SHOULD inject relevant `lessons.json` entries (relevance is implementation-defined). Implementations MUST inject the `narrative.md` of the current block on every run on that block.

Implementations MUST NOT inject the entire project codebase on every run. The graph of `depends_on` is the basis for selective context inclusion.

---

## 6. Required operations

A Kanon-compliant implementation MUST expose at minimum the following operations to its user (via CLI, API, or UI). The names are conceptual; implementations MAY name their commands differently.

| Operation | Behaviour |
|---|---|
| `block.create(id, mission)` | Creates a new block with required structure. |
| `block.run(id)` | Executes one round of work on the block: builds context pack, invokes agent, captures evidence, returns verdict. |
| `block.verify(id)` | Re-runs acceptance checks without modifying code. Returns verdict. |
| `cascade.verify(id)` | Walks reverse-dep closure of `id`, runs `block.verify` on each, returns map of verdicts. |
| `graph.export()` | Returns the project graph in a machine-readable form (JSON or equivalent). |
| `graph.visualise()` | Returns or renders a visual representation (web canvas, SVG, ASCII — implementation's choice). |
| `memory.read(scope, key)` | Reads from operator or project memory. |
| `memory.append(scope, key, entry)` | Appends to memory. |

Implementations MUST document these operations and their semantics in their own documentation.

---

## 7. Compliance levels

An implementation MAY claim one of three compliance levels.

### 7.1 Level 1 — Core

An implementation is **Level 1 Kanon-compliant** if it satisfies all of:

- Section 2 (block structure) in full.
- Section 3 (tri-state acceptance) in full.
- Section 5 (typed memory) in full.
- Section 6 (required operations) — all operations except `cascade.verify` and `graph.visualise`.

Level 1 represents the structural minimum: contracts, tri-state, typed memory.

### 7.2 Level 2 — Cascade-aware

An implementation is **Level 2 Kanon-compliant** if it satisfies Level 1 plus:

- Section 4 (cascade verification) in full.
- Section 6 — including `cascade.verify` and `graph.visualise`.

Level 2 adds the cross-block discipline that makes Kanon viable on projects of more than ~20 blocks.

### 7.3 Level 3 — Cost-transparent

An implementation is **Level 3 Kanon-compliant** if it satisfies Level 2 plus:

- Records, for every run, the cost in tokens, the operation type, the provider, and a **shadow-bill** value computed against a stable reference price.
- Exposes cost data aggregated by block, operation, provider, and day.
- Surfaces cost on the same primary interface as block status.

Level 3 closes the feedback loop on the protocol itself: the standard becomes economically falsifiable.

### 7.4 Claiming a level

An implementation claiming a compliance level MUST include the claim in its README and documentation, MUST link to this specification, and MUST be willing to defend the claim against the compliance test suite (forthcoming, separate document).

Implementations MAY claim partial compliance with a specific level by enumerating the sections satisfied.

---

## 8. Reserved file names

To avoid collisions across implementations, the following file and directory names are reserved by this specification:

- `contract/`, `narrative.md` (block scope)
- `architecture_decisions.md`, `decisions.log` (project scope)
- `operator_profile/`, `lessons.json`, `dont_use.json`, `always_use.json` (operator scope)
- `mission.md`, `acceptance.md`, `depends_on.json`, `provides.json` (contract scope)

Implementations MUST NOT use these names for unrelated purposes within Kanon-managed directories. Implementations MAY use these names outside Kanon-managed paths.

---

## 9. Versioning and stability

This is version **0.1 — Draft**. The protocol is not stable until v1.0 and may change in incompatible ways. After v1.0:

- Patch versions (1.0.x) MUST be backward-compatible.
- Minor versions (1.x.0) MAY add new requirements but MUST NOT remove existing ones.
- Major versions (x.0.0) MAY break compatibility, with a migration document accompanying the release.

Implementations are encouraged to declare the protocol version they target in machine-readable form (for example, `kanon_version: "0.1"` in their project metadata).

---

## 10. Relation to other protocols

Kanon Protocol does not displace, replace, or compete with:

- **Model Context Protocol (MCP)** — operates on the agent ↔ tool boundary; Kanon operates on the human ↔ task ↔ agent boundary. Implementations are encouraged to use both.
- **Agent Contracts (Ye & Tan, 2025)** — formalises resource and temporal bounds for autonomous agents; Kanon formalises task structure. The two are complementary.
- **OpenAPI, JSON Schema** — describe data interfaces; Kanon describes work units. A Kanon block's `provides.json` MAY reference OpenAPI or JSON Schema documents.

---

## 11. Open questions

The following items are explicitly under-specified in v0.1 and are expected to be tightened or clarified before v1.0:

1. The precise format of `acceptance.md` (free-form Markdown vs. structured DSL).
2. Standardised schema for `lessons.json` entries.
3. Cost reporting units and shadow-bill reference choice.
4. Identifier collision rules across project boundaries (operator profile reuse).
5. Concurrency model when multiple agents run on the same block.

Comments and proposals are welcome via the protocol repository (link to be added).

---

## Appendix A — Minimal example

A minimal compliant block:

```
blocks/auth-jwt/
├── contract/
│   ├── mission.md
│   ├── acceptance.md
│   ├── depends_on.json     → ["db-users"]
│   └── provides.json       → ["middleware/authenticate"]
├── narrative.md            → (empty on creation)
└── code/
    └── auth.py
```

`acceptance.md` (illustrative, not normative):

```yaml
checks:
  - kind: exit_code
    command: pytest tests/auth_test.py
    expect: 0
  - kind: file_content_matches
    file: code/auth.py
    must_contain: "jwt.decode"
    must_not_contain: "mock_token"
inconclusive_if:
  - "tests/auth_test.py is missing"
  - "no JWT library is installed in the environment"
```

This block is Level 1 compliant. It uses two deterministic collectors (`exit_code`, `file_content_matches`) and declares two inconclusive conditions.

---

*Editors: Anton Kalabukhov / Synlabs. Licence: CC-BY 4.0. References to "Kanon Protocol" in compliant implementations are encouraged. Forks and alternative specifications are welcomed; please mark them as such to avoid confusion.*

[RFC 2119]: https://www.ietf.org/rfc/rfc2119.txt
