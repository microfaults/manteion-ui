# API-NEEDED — the contract `manteion-ui` expects from `manteion-go`

This doc is authored from the UI's point of view. It enumerates every HTTP
endpoint a faithful implementation of the screens in `UI-DESIGN.md` (and the
redesigned Rules / Experiments pages — see `docs/figma-changes.md`) needs the
backend to expose.

It also calls out **drift** between the current Figma/UI assumptions and
`manteion-go`'s reality — places where the backend has to pick a resolution
before the UI can honour the design.

Audience: the manteion-go team. This doc is the single source of truth for
the missing backend work. Update it in the same PR as any schema change.

---

## 0. TL;DR

- 23 endpoints referenced by the UI.
- Currently exposed by manteion-go: **9** (rules CRUD, SDK endpoints, zeus
  proxies, health).
- Missing: **14** (Experiments, Faults, Runs/SSE, Workflows/Flows, Datasets,
  rule compile/validate, SDK kill-switch).
- Backend has repo code for most of what's missing — the gap is HTTP routes,
  not business logic.
- Three semantic mismatches between Figma and the `Rule` data model require a
  product decision (§B.3 #1, #2, #4).

---

## A. What exists today (`manteion-go/internal/api/server.go:68-99`)

```
GET    /healthz                                -- infra
GET    /readyz                                 -- infra
GET    /api/v1/status                          -- {rules:int, instances:int, zeus_reachable:bool}

POST   /api/v1/rules                           -- create Rule
GET    /api/v1/rules                           -- list Rule[]   (no pagination)
GET    /api/v1/rules/{id}                      -- get Rule
PUT    /api/v1/rules/{id}                      -- update Rule
DELETE /api/v1/rules/{id}                      -- delete Rule

POST   /api/v1/sdk/register                    -- upsert SDKInstance
DELETE /api/v1/sdk/register/{id}
GET    /api/v1/sdk/instances                   -- list SDKInstance[]
GET    /api/v1/sdk/rules                       -- version-checked poll for atropos SDKs
GET    /api/v1/sdk/init

POST   /api/v1/zeus/workloads     GET ... DEL ...    -- blind passthrough to Archer
POST   /api/v1/zeus/attacks       GET ... DEL ...    -- blind passthrough
POST   /api/v1/zeus/policies      GET ... DEL ...    -- blind passthrough
```

That's the entire API surface today. Everything else in this doc is **new**.

---

## B. Endpoints the UI needs (by screen)

Each row: method · path · request shape · response shape · UI consumer ·
priority · status (✔ exists / ◻ missing).

### B.1 Dashboard (`/dashboard`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/status` | — | `{rules:int, instances:int, zeus_reachable:bool}` | StatCards | P1 | ✔ |
| GET | `/api/v1/rules` | — | `Rule[]` (active-only filter would help) | "Enabled rules" StatCard | P1 | ✔ |
| GET | `/api/v1/sdk/instances` | — | `SDKInstance[]` | Services panel | P1 | ✔ |
| GET | `/api/v1/dashboard/summary` *(optional)* | — | `{failing_services:int, active_experiments:int, queued_experiments:int, active_faults_by_type:{inline,network,resource,cache_box}}` | StatCard fan-out collapsed into one call | P2 | ◻ |

### B.2 Services (`/services`, `/services/:id`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/sdk/instances` | — | `SDKInstance[]` | list | P1 | ✔ |
| GET | `/api/v1/sdk/instances/{id}` | — | `SDKInstance & {last_error?: string, last_rule_version_acked?: uint64, active_rule_ids: string[], recent_run_ids: string[]}` | detail panel | P1 | ◻ |
| POST | `/api/v1/sdk/instances/{id}/kill-switch` | — | `{disabled_rule_ids: string[], at: timestamp}` | primary "Kill switch" action | P1 | ◻ |

### B.3 Rules (`/rules`, `/rules/:id`)  — redesigned, see figma-changes.md

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/rules` | — | `Rule[]` | list | P1 | ✔ |
| GET | `/api/v1/rules/{id}` | — | `Rule` | editor | P1 | ✔ |
| POST | `/api/v1/rules` | see below | `Rule` | create | P1 | ✔ (input shape has gaps) |
| PUT | `/api/v1/rules/{id}` | see below | `Rule` | update | P1 | ✔ (input shape has gaps) |
| DELETE | `/api/v1/rules/{id}` | — | 204 | delete | P1 | ✔ |
| POST | `/api/v1/rules/{id}/test-push?sdk_instance={id}` | — | `{matched: bool, trace: string[], rule_version: uint64, sdk_instance_id: string}` | "Test push" dry-run | P1 | ◻ |
| POST | `/api/v1/rules/compile-match` | `{ast: MatchNode}` | `{rego: string}` | authoritative AST→rego compile (UI compiles too for preview) | P1 | ◻ |
| POST | `/api/v1/rules/validate-rego` | `{rego: string}` | `{ok: bool, diagnostics: string[], ast?: MatchNode}` | "paste rego" tab validation | P1 | ◻ |

**Updated Rule input shape (PUT/POST):**

```jsonc
{
  "name": "freeze-productcatalog",
  "service": "productcatalog",
  "enabled": true,
  "priority": 100,
  "mode": "inline",                       // inline | background
  "fault_spec_id": "fault-123",           // XOR with composition
  // NEW — replaces / augments the flat match.labels
  "match_ast": { /* MatchNode, see src/lib/rego/ast.ts */ },
  "match_expr": "package faults.match\n\ndefault allow := false\n\nallow if { input.service == \"productcatalog\" }\n",
  // LEGACY — kept as a projection for backward-compat with atropos SDK poll
  "match": { "injection_point": "ingress", "labels": {"atropos.workflow": "browse"} }
}
```

### B.4 Faults (`/faults`, `/faults/:id`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/faults/specs` | `?category=inline|network|resource&cursor=&limit=` | `{data: FaultSpec[], cursor?: string}` | library table | P1 | ◻ |
| POST | `/api/v1/faults/specs` | `FaultSpec` (no id/created_at) | `FaultSpec` | create | P1 | ◻ |
| GET | `/api/v1/faults/specs/{id}` | — | `FaultSpec` | detail | P1 | ◻ |
| PUT | `/api/v1/faults/specs/{id}` | `FaultSpec` | `FaultSpec` | update | P1 | ◻ |
| DELETE | `/api/v1/faults/specs/{id}` | — | 204 | delete | P1 | ◻ |
| GET | `/api/v1/faults/compositions` | — | `FaultComposition[]` | library | P2 | ◻ |
| POST | `/api/v1/faults/compositions` | `FaultComposition` | `FaultComposition` | — | P2 | ◻ |
| GET | `/api/v1/faults/incompatibilities` | — | `{pairs: [{a: fault_type, b: fault_type, severity: "soft"|"hard", reason: string}]}` | editor validation | P2 | ◻ |

All handlers already exist as repo methods — just not wired to mux.

### B.5 Workflows / Flows / Personas (`/workflows`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/flows` | — | `FlowListItem[]` | workflow grid | P2 | ✔ |
| POST | `/api/v1/flows` | `createFlowRequest` | `Flow` | new workflow dialog | P2 | ✔ |
| GET | `/api/v1/flows/{id}` | — | `Flow` | detail / tree editor | P2 | ✔ |
| POST | `/api/v1/flows/{id}/validate?dataset={id}` | — | `{ok: bool, errors: [...]}` | "Validate against dataset" | P2 | ◻ |
| GET | `/api/v1/personas` | — | `Persona[]` | persona picker | P2 | ✔ |
| * | `/api/v1/zeus/workloads/*` | opaque | opaque | existing proxy — document the passthrough shape | P2 | ✔ (opaque) |

### B.6 Datasets (`/datasets`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/datasets` | — | `Dataset[]` | list | P2 | ◻ |
| POST | `/api/v1/datasets` | `{name, ttl?}` | `Dataset` | create | P2 | ◻ |
| POST | `/api/v1/datasets/{id}/pools` | NDJSON body (content-type `application/x-ndjson`) | `{pool: string, rows: int, bytes: int}` | pool upload | P2 | ◻ |

### B.7 Experiments (`/experiments`, `/experiments/:id`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/experiments` | `?status=&cursor=&limit=` | `{data: Experiment[], cursor?: string}` | list | P1 | ◻ |
| POST | `/api/v1/experiments` | `ExperimentInput` | `Experiment` | create | P1 | ◻ |
| GET | `/api/v1/experiments/{id}` | — | `Experiment` (with `phases: PhaseSummary[]`) | detail | P1 | ◻ |
| PUT | `/api/v1/experiments/{id}` | partial | `Experiment` | edit | P1 | ◻ |
| DELETE | `/api/v1/experiments/{id}` | — | 204 | delete | P1 | ◻ |
| POST | `/api/v1/experiments/{id}/runs` | `{phase: PhaseName, workflow_id, dataset_id?, vus, duration_ms}` | `Run` | "Run" primary action per phase | P1 | ◻ |
| GET | `/api/v1/experiments/{id}/runs` | — | `Run[]` | observability tab | P1 | ◻ |
| GET | `/api/v1/experiments/{id}/phase/{phase_name}/status` | — | `PhaseSummary` (rules applied, frozen services, live metrics) | **hover card on phase pills** (Task C.2) — polled at 2s while hovered on running phases | P1 | ◻ |

### B.8 Runs (`/runs/:id`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/runs/{id}` | — | `Run & {sent:uint, dropped:uint, iterations:uint, p50_us, p95_us, p99_us}` | header / StatCards | P1 | ◻ |
| GET | `/api/v1/runs/{id}/steps` | — | `StepStat[]` | per-step table | P1 | ◻ |
| GET | `/api/v1/runs/{id}/events` | SSE (`text/event-stream`), `Last-Event-ID` resumable | events: `step.ok`, `step.drop`, `iteration.done`, `phase.transition` | live event tail | P1 | ◻ |

### B.9 Attacks (`/attacks`)

| Method | Path | Request | Response | Consumer | Prio | Status |
|---|---|---|---|---|---|---|
| GET | `/api/v1/attacks` | — | `Attack[]` | list | P2 | ◻ (currently blind-proxied) |
| POST | `/api/v1/attacks` | `AttackInput` | `Attack` | launcher | P2 | ◻ |
| GET | `/api/v1/attacks/{id}/results` | — | `AttackResult` | detail | P2 | ◻ |

### B.10 Settings / Environments

Product decision required before we define routes. See §D.

---

## C. Drift, inconsistencies, ambiguities

### C.1 Cache-box on Rules — the Target is not real **[blocker for Rules page]**

- **Figma (old):** right-panel editor shows a Target radio `Apply a fault | Use cache-box`, and a Cache-box mode sub-radio `passthrough | replay | replay-with-delay`.
- **Backend:** `internal/model/rule.go:11-23` — Rule has `fault_spec_id XOR fault_composition_id`. **No cache-box field.** `CacheBoxConfig` lives on `ExperimentRun.frozen_services` (`internal/model/experiment.go` + `internal/model/trace.go:50-60`).

**Resolutions:**

- **(a)** Extend `Rule` with `cache_box: CacheBoxConfig?` as a third oneof alongside the fault fields. Pro: matches current Figma. Con: changes the SDK polling contract, duplicates data that already lives on experiments.
- **(b) [RECOMMENDED]** Keep cache-box scoped to experiments. Remove "Use cache-box" as a Rules-page Target. Operators who want cache-box freeze-and-replay express it in the Experiment phase editor (where `frozen_services` is already the authoritative field). **This is what `docs/figma-changes.md` assumes for the Rules-v1.1 redesign.**

### C.2 Match criteria is AND-only, string-equality **[blocker for Rules v1.1]**

- **Figma (new):** AND/OR/NOT nested tree of conditions (`service = …`, `method in […]`, `header.x-trace-id matches /…/`). See `src/components/rule-builder/`.
- **Backend:** `internal/model/rule.go` — `match.labels map[string]string` AND-combined, exact-match only. No OR, no regex, no numeric comparison.

**Resolution (recommended):**

- Add `match_expr: string` (rego) on `Rule`. Evaluation happens SDK-side via
  embedded OPA (atropos has a Go OPA binding option) **or** manteion-side as a
  lookup service keyed on request metadata. Backend team chooses the execution
  strategy; the UI is agnostic.
- Keep `match.labels` as a convenience projection (server-side derivable from
  top-level AND leaves with `op==eq`). The atropos SDK poll can continue to
  receive the projection until it gains OPA; the two paths coexist.
- Add `match_ast: json` to preserve the round-tripping UI state.

### C.3 Zeus proxy is opaque

- `/api/v1/zeus/*` strips the prefix and blindly forwards (`handleZeusProxy`).
- UI has no schema, no error mapping, no rate limit visibility.

**Resolution:** either ship a generated TS client from Zeus's OpenAPI (if
Archer has one) or wrap each zeus passthrough with a manteion-side DTO and a
validation layer.

### C.4 Naming collision: "policies"

- Zeus `/policies` (via proxy) = metric-triggered actions (vegeta attacks when
  p99 > threshold).
- Manteion `model.PolicyRule` (not exposed yet) = also metric-triggered
  actions.
- Both are unrelated to "rules" (`Rule`) which match requests to faults.

**Resolution:** rename one. The UI uses **AutoRules** for the manteion
`PolicyRule` concept to keep /rules = request-matching only.

### C.5 No consistent error envelope

- Success: bare object (e.g. `Rule`, `SDKInstance[]`).
- Error: `{error: string}`.
- No status codes beyond 200/204/4xx — UI has to parse `error` heuristically.

**Resolution:** adopt `problem+json` (RFC 9457) or a consistent
`{code, message, details?}` envelope. Success can stay bare.

### C.6 No pagination

- `GET /api/v1/rules`, `GET /api/v1/sdk/instances` return full arrays.
- Fine for a single-operator admin today, scales poorly.

**Resolution:** `?cursor=&limit=` on every list endpoint. UI is already
written to send the params (no-op until server honours them).

### C.7 No real-time

- Run detail, experiment logs, phase hover card need live updates.
- `manteion-go` has zero SSE/WebSocket.

**Resolution:** at minimum, `GET /api/v1/runs/{id}/events` as SSE with
`Last-Event-ID` resume. The hover card polls HTTP at 2s — acceptable for now.

### C.8 SDK instance status is computed, opaque

- `status ∈ {alive, stale, dead}` derived from `last_poll_at`.
- No `last_error`, no `last_rule_version_acked`.

**Resolution:** surface both. UI already has the field names wired in
`types/api.ts`.

### C.9 Unexposed repos

- `ExperimentRepo`, `FaultRepo`, `WorkloadRepo`, `PolicyRepo`, `TraceRepo` are
  in `server.go:17-59` but no routes use them.

**Resolution:** this doc is the route list. Start with §B.3–B.7 / P1.

### C.10 No auth

- Every endpoint accepts every request.
- Fine for local dev; not fine anywhere else.

**Resolution:** not blocking Phase 1 UI, but needed before multi-user.

---

## D. Unresolved product decisions

1. **Environment scoping.** Dropdown exists in the sidebar. Do we run one
   manteion-go per env (simpler, matches kustomize overlay boundary) or one
   manteion with a tenant column on every table (harder)?
2. **Kill-switch granularity.** Per-service (recommended by UI-DESIGN.md §8)
   vs per-rule vs both. UI assumes per-service for Phase 1.
3. **Do non-operator roles view this UI?** If yes: add RBAC + read-only mode.
   Phase 1 says no.

---

## E. How to use this doc

1. **Backend PRs** that add/change an endpoint edit the same row(s) here.
2. The UI's `NotWiredYet` placeholder on each route renders the endpoint list
   verbatim — if you remove a row, delete the corresponding placeholder.
3. When enough rows flip from ◻ to ✔, we bump the manteion-ui MVP and drop
   the `NotWiredYet` component on that route.
