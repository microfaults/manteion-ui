# API contract — what `manteion-ui` consumes from `manteion-go`

Authored from the UI's point of view, against manteion-go `develop` at
schema **epoch 2** (`internal/api/server.go`; `a85ee9e` deployed to VM1 on
2026-09-12 with migrations 10 and 11). It lists every route the UI
calls, per screen, and the drift that still separates the two repos.

Rules of the road: a backend PR that adds or changes a route edits the same
row here; a UI PR that starts consuming a route flips its status. Nothing in
this file is a plan — if it is listed as ✔ the route is served today.

Status legend: ✔ served by `develop` · ⧗ in an open merge request · ◻ not
started · ✖ retired (never coming back in that shape).

---

## 0. TL;DR

- The experiment loop is **fully served**: create → start → phases progress
  (rules pushed, services frozen, k6 runs / vegeta attacks through zeus) →
  harvest → results. `tools/expctl/expctl.py` drives it over plain HTTP; the
  UI now does the same (`src/lib/api/experiments.ts`, `phases.ts`,
  `zeus-runs.ts`).
- Retired and replaced: `/api/v1/runs/*` ("a run is a phase" — use
  `/api/v1/phases/*`), `/api/v1/attacks/*` (vegeta legs are visible per phase
  workflow; zeus attacks are deliberately not proxied), `/api/v1/flows` and
  `/api/v1/personas` (workflows are manteion-owned at `/api/v1/workflows`).
- Drift (section C): everything the bridge needed has landed on develop and
  is deployed; what remains is deferred by decision (SSE) or a note (attacks).

---

## A. Served today (`internal/api/server.go`)

```
GET    /healthz | /readyz | /api/v1/healthz | /api/v1/readyz
GET    /api/v1/status                                     {rules, instances, zeus_reachable}

POST   /api/v1/rules            GET /api/v1/rules          GET|PUT|DELETE /api/v1/rules/{id}

POST   /api/v1/faults/specs     GET /api/v1/faults/specs   GET|PUT|DELETE /api/v1/faults/specs/{id}
POST   /api/v1/faults/compositions   GET /api/v1/faults/compositions   GET|DELETE …/compositions/{id}
GET    /api/v1/faults/catalog
POST   /api/v1/faults/configs   GET /api/v1/faults/configs   DELETE …/configs/{id}
POST   /api/v1/faults/configs/{id}/fire | /cancel

POST   /api/v1/workflows        GET /api/v1/workflows      GET|PUT|DELETE /api/v1/workflows/{id}
POST   /api/v1/workflows/{id}/validate   POST /api/v1/workflows/{id}/runs
GET    /api/v1/catalog/endpoints

POST   /api/v1/experiments                                create (nested full plan, §B.7)
GET    /api/v1/experiments?status=&limit=&offset=         page envelope {data, page} — bare rows, no phases
GET    /api/v1/experiments/{id}                           detail incl. phases[] (each + workflows[] + rule_ids[])
DELETE /api/v1/experiments/{id}
POST   /api/v1/experiments/{id}/start|pause|resume|cancel|stop[?status=completed|failed|cancelled]
GET    /api/v1/experiments/{id}/results                   rollup, or {experiment_id, available:false}
POST   /api/v1/experiments/{id}/phases                    add phase (omit position ⇒ append; see C)
GET|DELETE /api/v1/experiments/{id}/phases/{phaseId}
POST   /api/v1/experiments/{id}/phases/{phaseId}/start|stop[?status=completed|failed|skipped]
GET    /api/v1/experiments/{id}/phases/{phaseId}/results  workflow_results[], service_latency[], service_cache[], verdict?, drain?

GET    /api/v1/phases?limit=&offset=                      flat PhaseListItem page (no filters — UI filters client-side)
GET    /api/v1/phases/{phaseId}                           PhaseDetail (+ experiment_name, workflow_results[], totals)
GET    /api/v1/phases/{phaseId}/faults                    frozen_services[], phase_rules[], fault_events[]
POST   /api/v1/phases/{phaseId}/pause|resume|stop[?status=]

POST   /api/v1/policies         GET /api/v1/policies       GET|DELETE …/policies/{id}   PATCH …/{id}/enable|disable

POST   /api/v1/sdk/register     DELETE /api/v1/sdk/register/{id}
GET    /api/v1/sdk/instances    GET /api/v1/sdk/rules      GET /api/v1/sdk/init   GET /api/v1/sdk/events (SSE)
POST   /api/v1/cache/ingest     GET /api/v1/cache/entries  POST /api/v1/sdk/cachebox/drain

/api/v1/zeus/workflows[/{id}[/validate|/runs]]            proxied to zeus (query string forwarded since 7c626b3)
/api/v1/zeus/runs[/{run_id}[/events|/stats]]              proxied — run state is in-memory on zeus
/api/v1/zeus/datasets[/{id}[/upload|/sample]]             proxied
```

Wire facts the UI depends on (all verified against the Go structs):

- `PhaseStatus` = `pending | running | paused | completed | failed | skipped | draining`.
  `draining` is the cache-box flush at the end of a recording phase; still in
  flight from the operator's point of view.
- Phase read-outs carry **no metrics** and **no applied-rule details** — only
  `rule_ids[]`. Metrics live at `…/phases/{phaseId}/results`, written once at
  phase end by `internal/orchestrator/harvest.go`; there are no mid-run
  numbers (zeus reports a final summary). Progress is time-based.
- Go serialises nil slices as `null` (`workflows`, `frozen_services`,
  `fault_events`…); every list field is normalised to `[]` in
  `src/types/api.ts`.
- `GET /api/v1/experiments` returns bare `model.Experiment` rows. The list
  page hydrates phase pills from `GET /api/v1/phases` in one extra request.
- Zeus `RunStats` (`GET /zeus/runs/{id}/stats`) carries `duration` and
  `latency_p50/p95/p99` as **nanoseconds**; the UI converts at the boundary.
  While a run is in flight zeus answers 200 `{run_id, status:"no stats
  available yet"}`. After a zeus restart a run id 404s (state is in-memory).
- Admission control: one running experiment per service footprint
  (`frozen_services` ∪ services of attached rules) —
  `internal/orchestrator/admission.go`.
- Rules referenced by a plan should be created **disabled** and enabled only
  after `POST /experiments` returns (the push/poll path skips disabled rules;
  enabling early causes ghost activation). The wizard never enables rules.

---

## B. Consumption by screen

Each row: method · path · UI consumer · status.

### B.1 Dashboard (`/dashboard`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET | `/api/v1/status` | StatCards | ✔ |
| GET | `/api/v1/rules` | enabled-rules card | ✔ |
| GET | `/api/v1/sdk/instances` | services panel | ✔ |
| GET | `/api/v1/experiments` + `/api/v1/phases` | recent experiments (phase progress column) | ✔ |
| GET | Prometheus (via `VITE_PROMETHEUS_URL`) | observability cards | external |

### B.2 Services (`/services`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET | `/api/v1/sdk/instances` | list | ✔ |
| GET | `/api/v1/sdk/instances/{id}` → instance + `active_rule_ids[]`, `recent_run_ids[]` (phase ids) | detail panel | ✔ |
| POST | `/api/v1/sdk/instances/{id}/kill-switch` → `{disabled_rule_ids[], at}` | "Kill switch" | ✔ |
| PUT | `/api/v1/rules/{id}` (enabled:false) | per-rule "Disable" in the panel | ✔ |

Against an older build the panel says "not exposed by this manteion-go build"
for the detail and hides the kill switch. The per-instance **cache-box
action is gone**: cache-box is phase-driven in epoch 2
(`ActiveCacheBoxPhaseForService`); a manual per-instance rule would fight the
orchestrator's synthesised one. `last_error` / `last_rule_version_acked` are
not emitted (no columns) — the panel renders them only when present.

### B.3 Rules (`/rules`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET / POST | `/api/v1/rules` | list / create | ✔ |
| GET / PUT / DELETE | `/api/v1/rules/{id}` | editor | ✔ |
| GET | `/api/v1/faults/specs`, `/api/v1/faults/compositions` | fault picker | ✔ |
| POST | `/api/v1/rules/{id}/test-push`, `/api/v1/rules/compile-match`, `/api/v1/rules/validate-rego` | dry-run / rego tabs | ◻ (UI compiles the match AST locally; see `src/lib/rego`) |

### B.4 Faults (`/faults`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET / POST | `/api/v1/faults/specs` | library / create | ✔ |
| GET / PUT / DELETE | `/api/v1/faults/specs/{id}` | detail / edit | ✔ |
| GET / POST / DELETE | `/api/v1/faults/compositions[/{id}]` | compositions | ✔ |
| GET | `/api/v1/faults/catalog` | type catalog | ✔ |
| POST | `/api/v1/faults/configs[/{id}/fire|cancel]` | ad-hoc firing | ✔ (not surfaced in the UI yet) |

### B.5 Workflows (`/workflows`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET / POST | `/api/v1/workflows` | grid / create | ✔ |
| GET / PUT / DELETE | `/api/v1/workflows/{id}` | tree editor | ✔ |
| POST | `/api/v1/workflows/{id}/validate` | validate | ✔ |
| GET | `/api/v1/catalog/endpoints` | request-node picker | ✔ |

### B.6 Datasets (`/datasets`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET / POST / DELETE | `/api/v1/zeus/datasets[/{id}]` | list / create / delete | ✔ (proxy) |
| POST | `/api/v1/zeus/datasets/{id}/upload` (NDJSON) | upload | ✔ (proxy) |
| GET | `/api/v1/zeus/datasets/{id}/sample?pool=` | preview | ✔ (proxy) |

### B.7 Experiments (`/experiments`, `/experiments/new`, `/experiments/:id`)

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET | `/api/v1/experiments` (+ `/api/v1/phases` for pills) | list | ✔ |
| POST | `/api/v1/experiments` — nested plan: `{name, description?, hypothesis?, created_by?, phases[{name, position, persist_cache?, frozen_services[{service, mode, key_strategy?, mutation_policy, …}], workflows[{workflow_id, vus, duration_sec, rate_rps?, target_url?, dataset_id?}], rule_ids[]}]}` | wizard | ✔ |
| GET | `/api/v1/experiments/{id}` | detail (5 s poll while running) | ✔ |
| PUT | `/api/v1/experiments/{id}`, `/api/v1/experiments/{id}/phases/{phaseId}` | edit a planned experiment | ✔ served — no UI edit screen yet (delete + recreate from the wizard) |
| POST | `…/start` (202 + detail; 409 on footprint overlap) | Start | ✔ |
| POST | `…/pause` `…/resume` `…/cancel` `…/stop?status=` | actions | ✔ |
| DELETE | `/api/v1/experiments/{id}` | Delete | ✔ |
| GET | `/api/v1/experiments/{id}/results` | stat cards, Overview | ✔ |
| GET | `…/phases/{phaseId}/results` | timeline rows, hover card | ✔ |
| GET | `/api/v1/zeus/runs/{id}` · `…/stats` | live run status; fallback metrics for run-only phases | ✔ (proxy) |
| POST | `…/phases/{phaseId}/start` | "Start now" on a pending phase | ✔ |
| GET | Grafana `d-solo` (`VITE_GRAFANA_URL`) | Observability tab | external |

### B.8 Phases (`/phases`, `/phases/:id`) — replaces "Runs"

| Method | Path | Consumer | Status |
|---|---|---|---|
| GET | `/api/v1/phases` | list (client-side filters; 10 s poll while in flight) | ✔ |
| GET | `/api/v1/phases/{phaseId}` | detail (5 s poll while in flight) | ✔ |
| GET | `/api/v1/phases/{phaseId}/faults` | faults in effect + fault events | ✔ |
| POST | `/api/v1/phases/{phaseId}/pause|resume|stop?status=` | actions | ✔ |
| GET | `/api/v1/zeus/runs/{id}` · `…/stats` | per-workflow status, run.state timeline, fallback results | ✔ (proxy) |

`/runs` and `/runs/:id` redirect to `/phases` for one release.

### B.9 Attacks — removed

No screen. `/api/v1/zeus/attacks*` is intentionally not proxied; vegeta legs
appear as `zeus_attack_id` on phase workflows and their results are harvested
into `…/results`.

### B.10 Settings

`/settings/environments` still shows a placeholder: environment scoping is an
open product decision (one manteion per env vs. a tenant column).

---

## C. Drift between the repos (tracked in `manteion-go`)

| # | Item | Effect on the UI | Status |
|---|---|---|---|
| G1 | zeus proxy dropped query strings | `GET /zeus/runs?experiment_id=` returned every run | ✔ fixed on develop (`7c626b3`) — the UI still addresses runs by `zeus_run_id` only |
| G2 | no experiment/phase update; `position: 0` treated as "append" on `POST …/phases` | wizard sends explicit positions; no edit screen yet | ✔ develop (`PUT …/experiments/{id}`, `PUT …/phases/{phaseId}`, `*int` position) |
| G3 | k6 run stats never harvested (`harvest.go` skipped rows without `zeus_attack_id`) | run-only phases now harvest; since `7dcf804` `error_count` = HTTP failures (`requests_sent − requests_ok`). Rows harvested before that counted k6 dropped iterations — the UI reads `raw_metrics` and shows dropped iterations as a separate load-health line, never as errors | ✔ develop, deployed 2026-09-15 |
| G4 | dataset is a process-wide env var (`MANTEION_ZEUS_DATASET_ID`) | wizard picks a dataset per workflow row, shows the per-phase union and preflights presence/TTL; blank = env-var fallback | ✔ develop (migration 10 `phase_workflows.dataset_id`, derived `dataset_ids[]`, 422 `dataset_missing` / `dataset_expiring`, 502 `zeus_unreachable`) |
| G5 | SSE cannot traverse the proxy (30 s client timeout, unflushed `io.Copy`) | none — polling is the contract (5 s, as expctl) | deferred |
| G6 | every refusal was a 400 `{error}` | `{error, code, …}`: 409 `service_overlap` (+`running_experiment_id`, `services[]`), 409 `invalid_state`, 409 `conflict`, 422 `validation`, 404 `not_found`, 400 `bad_json`, 502 `zeus_unreachable`; the UI shows `error` and `code` | ✔ develop |
| G7 | no SDK instance detail / kill-switch routes | Services panel detail + kill switch | ✔ develop |
| G8 | attacks invisible between start and harvest | statuses come from the phase; acceptable | note only |
| B8 | phase / experiment `failure_reason` was only logged | every fail path writes a reason (preload gate, materialise, zeus rejections, run/attack failures, safety-net deadline, recovery, operator stop); shown on the experiment header, timeline rows and phase detail | ✔ develop (migration 11) |

### Semantics worth knowing

- **Freezing replays egress.** The cache box records the calls a service
  *makes* during a `persist_cache` phase and replays them when a later phase
  freezes that service; a leaf service records nothing and the phase fails at
  the preload gate. Freeze callers (frontend, checkoutservice,
  recommendationservice), never leaves.
- **Cache-box on rules.** A rule's `cachebox` action is per-request replay
  config; the *freeze* of a service during a phase is `frozen_services` on the
  phase (`model.CacheBoxConfig`: `service, mode, key_strategy, key_headers,
  mutation_policy, …`). INV-2: every phase freezing a service must agree on
  its key strategy (server 400; the wizard validates first).
- **Error envelope.** `{error: string, code: string, …}` on the experiment and
  phase handlers (see G6); other handlers still answer a bare `{error}`. The
  UI reads `error` and, when present, `code`.
- **Pagination.** `experiments`, `workflows`, `phases` use `{data, page:{offset,
  limit, total}}` with a server cap of 200; `rules` and `sdk/instances` are
  bare arrays.
- **Auth.** None. Local/VM-only deployment.
