# Faults-lab UI — Design Doc

This is the design spec for the faults-lab control-plane UI. It is the visual and interaction layer on top of **manteion-go**: the single operator pane for configuring rules, driving experiments, inspecting runs, and reading latency decompositions. It does not replace `zeus-go`'s API or `atropos-go`'s SDK surface — it is the human control cockpit over them.

> **Scope of this document.** Information architecture, design language, token system, component inventory, per-screen specs, and a gap list. Component implementations live in code (`manteion-ui/` — not yet scaffolded). The Figma file `MicroService Fault Testing Kit (Copy)` is the visual source of truth for structure.

---

## 1. What the UI is for

The UI has exactly one user: the operator of a faults-lab environment running against `service-beds` (or a similar target). Their workflow is the **experiment loop** from `VISION.md`:

1. Observe live service behavior under load (Grafana panels, services health).
2. Hypothesize a bottleneck ("productcatalog contributes to checkout tail").
3. Configure rules — cache-box modes, fault injections — targeting specific services/workflows.
4. Launch an experiment with phases: baseline → isolation-1a/1b/2a/2b → combined.
5. Read live observability during phases (Grafana p99, RPS, error rate, cache-hit rate).
6. Refine and repeat.

Every screen serves one of those six steps. If it doesn't, it doesn't ship.

---

## 2. First-class objects

The UI's navigation and screens are shaped directly by manteion's and zeus's domain objects. **Faults** are a library of named primitives; **Rules** are the application layer that references them. This is a UI-layer split — the scaffolded `Rule.Fault: json.RawMessage` becomes `Rule.FaultId` or `Rule.CacheBoxMode` once Faults are promoted to first-class.

| Object | Owner | Endpoint root | UI surface |
|---|---|---|---|
| **Service / SDK instance** | manteion | `/api/v1/sdk/*` | Services list, health, rule-version lag |
| **Fault primitive** | manteion | `/api/v1/faults/*` (new) | Faults library — inline / network / resource specs |
| **Rule** | manteion | `/api/v1/rules/*` | Rule editor — pick Fault from library **or** cache-box mode, plus match criteria |
| **Workflow** | zeus (via proxy) | `/api/v1/zeus/workflows/*` | Workflow list, DSL v2 tree editor |
| **Dataset** | zeus | `/api/v1/zeus/datasets/*` | Dataset list, pool preview, upload |
| **Experiment** | manteion (planned) | `/api/v1/experiments/*` | Experiment list, phase plan, live Grafana pane |
| **Run** | zeus | `/api/v1/runs/*` | Run detail, live SSE tail, stats, Grafana pane |
| **Attack** | zeus | `/api/v1/attacks/*` | Precision attack launcher, stats |
| **Grafana panel** | external | Grafana `d-solo` iframe | Embedded live perf view (p99 / RPS / error rate) |

**Not in the UI (yet):** latency decomposition math, Δ-tables, interaction matrices. The decomposition formula (`Δ_service = baseline − frozen`; superadditivity checks) rests on assumptions that are still being validated; rendering numbers off that math implies confidence the platform does not yet have. Once the research is settled, the Decomposition tab returns to Experiment detail — until then, do not expose the math.

---

## 3. Information architecture

Two navigation layers: a persistent **black sidebar** (scope switch) and a **topbar** per screen (context + primary action).

```
Sidebar (black, 240px):

  Faults Lab                       ← product mark
  online-boutique ▾                ← environment switcher (kustomize overlay)

  ── Observe ──
  Dashboard
  Services                         ← SDK instances; rule-version lag

  ── Configure ──
  Rules                            ← wire Faults / cache-box to services
  Faults                           ← library of fault primitives
  Workflows
  Datasets

  ── Run ──
  Experiments
  Runs
  Attacks

  ── Settings ──
  Environments
  Tokens / access
```

The three groups map to the experiment loop: **Observe** is "what is the system doing right now," **Configure** is "what am I going to change," **Run** is "drive load and read results."

Routes (React Router):

```
/dashboard
/services                 /services/:id
/rules                    /rules/:id
/faults                   /faults/:id
/workflows                /workflows/:id
/datasets                 /datasets/:id
/experiments              /experiments/:id
/runs/:run_id
/attacks/:attack_id
/settings/environments
```

---

## 4. Design language

**Ethos.** Control-plane tool, not a marketing site. Zero visual flourish. High information density. Monospace for any identifier, code, or latency number. The reader is looking at a dashboard for long stretches — the UI should disappear.

**Palette:**

- **Black sidebar** (`#0A0A0A`) with off-white text. No brand color on the sidebar except the active nav item's left border accent.
- **White canvas** (`#FFFFFF`) for the main page. Zinc-scale borders and muted backgrounds only (`#E4E4E7` border, `#F4F4F5` muted).
- **Blue primary** (`#2563EB`, Tailwind `blue-600`). Used on buttons, the active sidebar item's accent bar, and in-focus ring. Never used for chrome or decoration — only actionable affordance.
- **Status ramp:** healthy `#16A34A` (green-600), degraded `#CA8A04` (amber-600), down `#DC2626` (red-600). Matches Tailwind's semantic colors — paired with a filled dot, never used on large regions.

**Typography.** Inter for UI, JetBrains Mono for identifiers/code/latency numbers. Tailwind type ramp (`text-xs` through `text-3xl`). Line-heights come from the ramp, never override manually.

**Shape.** Tailwind default radius (`0.5rem` / 8px) for buttons and cards. `0.375rem` / 6px for inputs. No shadows except `shadow-sm` on elevated dialogs.

**Density.** 8-pt grid. Card padding 24 (6×4). Row height in tables 48. Section gaps 24.

**Motion.** None except focus-ring transitions and the dialog enter (opacity + 4px translate, 150ms). Live-run counters update via SSE with no animation — they just change.

---

## 5. Token system

Variables are defined in Figma and mirror the shadcn CSS variable convention so the implementation is a direct lookup from `globals.css`.

### 5.1 Color (single mode; dark mode is Phase 2)

| Token | Value | Tailwind ref | Figma scope |
|---|---|---|---|
| `background` | `#FFFFFF` | `white` | FRAME_FILL, SHAPE_FILL |
| `foreground` | `#0A0A0A` | `zinc-950` | TEXT_FILL |
| `card` | `#FFFFFF` | `white` | FRAME_FILL |
| `card-foreground` | `#0A0A0A` | `zinc-950` | TEXT_FILL |
| `popover` | `#FFFFFF` | `white` | FRAME_FILL |
| `popover-foreground` | `#0A0A0A` | `zinc-950` | TEXT_FILL |
| `primary` | `#2563EB` | `blue-600` | FRAME_FILL, SHAPE_FILL |
| `primary-foreground` | `#FFFFFF` | `white` | TEXT_FILL |
| `secondary` | `#F4F4F5` | `zinc-100` | FRAME_FILL, SHAPE_FILL |
| `secondary-foreground` | `#18181B` | `zinc-900` | TEXT_FILL |
| `muted` | `#F4F4F5` | `zinc-100` | FRAME_FILL, SHAPE_FILL |
| `muted-foreground` | `#71717A` | `zinc-500` | TEXT_FILL |
| `accent` | `#F4F4F5` | `zinc-100` | FRAME_FILL |
| `accent-foreground` | `#18181B` | `zinc-900` | TEXT_FILL |
| `destructive` | `#DC2626` | `red-600` | FRAME_FILL, TEXT_FILL |
| `destructive-foreground` | `#FFFFFF` | `white` | TEXT_FILL |
| `border` | `#E4E4E7` | `zinc-200` | STROKE_COLOR |
| `input` | `#E4E4E7` | `zinc-200` | STROKE_COLOR |
| `ring` | `#3B82F6` | `blue-500` | STROKE_COLOR |
| `sidebar` | `#0A0A0A` | `zinc-950` | FRAME_FILL |
| `sidebar-foreground` | `#FAFAFA` | `zinc-50` | TEXT_FILL |
| `sidebar-primary` | `#2563EB` | `blue-600` | SHAPE_FILL |
| `sidebar-accent` | `#18181B` | `zinc-900` | FRAME_FILL |
| `sidebar-border` | `#27272A` | `zinc-800` | STROKE_COLOR |
| `status-healthy` | `#16A34A` | `green-600` | SHAPE_FILL |
| `status-degraded` | `#CA8A04` | `amber-600` | SHAPE_FILL |
| `status-down` | `#DC2626` | `red-600` | SHAPE_FILL |

### 5.2 Radius

`sm 4`, `md 6`, `lg 8`, `xl 12`, `full 9999`.

### 5.3 Spacing (8-pt grid)

`1=4`, `2=8`, `3=12`, `4=16`, `5=20`, `6=24`, `8=32`, `10=40`, `12=48`.

### 5.4 Typography (Inter, plus JetBrains Mono for `font-mono`)

| Token | Size / line-height | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Table meta, badge, timestamps |
| `text-sm` | 14 / 20 | Body default, labels |
| `text-base` | 16 / 24 | Form input, card body |
| `text-lg` | 18 / 28 | Card titles |
| `text-xl` | 20 / 28 | Section headings |
| `text-2xl` | 24 / 32 | Page title |
| `text-3xl` | 30 / 36 | Dashboard top-line stat |
| `font-mono-sm` | 13 / 20 JetBrains Mono | IDs, durations, percentiles |

---

## 6. Component inventory

These are shadcn primitives (names, variants) realized in Figma as `COMPONENT_SET` where variants exist. Implementation uses `shadcn/ui` verbatim unless called out.

| Component | Variants | Notes |
|---|---|---|
| **Button** | `primary` \| `secondary` \| `outline` \| `ghost` \| `destructive` × size `md` (default) / `sm` | Primary = blue-600. Destructive for `DELETE /runs`, `kill-switch`. |
| **Input** | default / error / disabled | 36 h, border `input`, radius 6. |
| **Textarea** | default / error | For rule JSON, DSL snippets. Mono font. |
| **Select** | default / open | shadcn select w/ chevron. |
| **Checkbox, Radio, Switch** | default | Switch used for `rule.enabled`, `mode: passthrough/replay`. |
| **Badge** | `default` \| `secondary` \| `outline` \| `destructive` \| `status-healthy` \| `status-degraded` \| `status-down` | Status variants pair with a filled dot. |
| **Card** | default | Padding 24, border `#E4E4E7`, radius 8. Slots: header / content / footer. |
| **StatCard** | default / delta-positive / delta-negative | Label + 30px number + optional delta pill. Used on Dashboard + experiment overview. |
| **Table** | default | Head row `h-12`, body row `h-12`. Left-align text, right-align numbers, mono for latencies. |
| **Sidebar item** | default / active / section-label | Active = blue 2px left border + `sidebar-accent` row. |
| **Tabs** | default | Underline tabs. Used on experiment detail (Overview / Phases / Decomposition / Logs). |
| **Dialog** | default | Used for create/edit flows and the workflow-graph viewer. |
| **Toast** | success / error / info | For async confirmations (run started, rule pushed, SDK registered). |
| **Code block** | inline / block | Mono, `secondary` bg, `foreground` text. |
| **Status dot** | healthy / degraded / down | 8px filled circle. Reused inside tables, cards, the services list. |
| **Phase pill** | baseline / isolation / combined / failed | Small colored pill used in the experiment phase timeline. |
| **Latency histogram sparkline** | default | 80×24 inline sparkline of latency p50/p95/p99. |

Everything else shadcn ships (accordion, popover, tooltip, command menu) is fair game but not called out until a screen asks for it.

---

## 7. Screen specs

### 7.1 App shell

- **Sidebar (black, 240×viewport).** Top-left product mark. Environment switcher. Three grouped sections per §3.
- **Topbar (white, 56h, 1px bottom border).** Breadcrumb on the left, primary action button on the right.
- **Main (white, fluid).** 24 padding all around. `max-w-7xl` center when wider than 1440.

### 7.2 Dashboard

Purpose: one glance at "is the platform healthy, is anything running, what's the most recent activity."

**Top row — 4 StatCards:**
- Failing services (`status = down` count)
- Active experiments (`status ∈ {running}` count, with experiment names)
- Experiments queued
- Active faults (count of enabled fault/cache-box rules, with breakdown by type: inline/network/cache-box)

**Middle row — Recent experiments table** (8 rows):
- columns: Experiment name (+ workflows subtitle) · Workflows · Phase · Started · Duration · p99 · Status badge
- Each row is an experiment, not an individual zeus run. The Workflows column shows all workflows associated with that experiment.

**Bottom row — Services panel** (reuse of Services list, 8 rows, link to `/services`):
- columns: Service · Status dot · CPU · Active faults · Rule version · Last tested

Remove from current mockup: "Failing Services 1" as a card-inside-a-card pattern. The red/green dots on the services table carry that signal.

### 7.3 Services (new — currently implicit)

- Left: services table (all registered SDK instances, one row per instance-id, grouped by service).
- Right, on row-select: **Service detail panel** — version, address, last poll, rule-version lag, active rules list, recent runs that touched this service.
- Primary action: "Kill switch" (`POST /api/v1/rules/disable-all?service=X`, when that endpoint ships).

### 7.4 Rules (replaces "Fault Inject")

The "Fault Inject" screen today conflates "create a rule" with "run an experiment." Split them: this screen is purely **CRUD over `Rule`**, and rules reference fault primitives from the Faults library.

- Header with "New rule" (primary blue).
- Left: rule table — Name · Service · Mode (Fault / Cache-box) · Target (fault primitive name or cache-box mode) · Enabled switch · Priority.
- Right, on select: **Rule editor panel**:
  - Name, Service (select), Enabled switch, Priority (int).
  - **Target** — radio: "Apply a fault" → Fault-primitive picker (from Faults library, with inline preview of params); or "Cache-box mode" → radio of passthrough / replay / replay-with-delay.
  - Match — InjectionPoint radio (any / ingress / egress / transient / custom), Labels key-value list.
  - Actions: Save · Test-push · Delete.

"Test-push" dry-runs a rule against a named SDK instance and returns the decision trace — useful for verifying label matching before enabling the rule in prod.

### 7.4a Faults (new)

Library of reusable fault primitives. A fault primitive is a named, parameterized spec (type + params) that one or more rules reference.

- Left: faults table — Name · Type pill (inline / network / resource) · Params summary (e.g. `latency 250ms ± 50ms`) · Used-by count · Updated.
- Right, on select: **Fault editor panel** — Name, Type tabs (Inline | Network | Resource), per-type fields:
  - **Inline:** latency (ms + jitter), http-error (status), hang (duration).
  - **Network:** toxic type (RST / blackhole / loss / throttle / drip), per-toxic params. Runs via the TCP proxy.
  - **Resource:** CPU stress %, I/O rate, memory MB. Uses cgroup-aware stress.
  - Ramp — linear up/down phase durations (applies to all types).
  - Description (textarea) — free-text rationale for anyone reading the library.
- "Used by" section lists rules that reference this fault primitive — editing the primitive propagates to all referencing rules on the next SDK poll.

### 7.5 Workflows

- Grid of workflow cards — Name · targets (chip list) · `estimated_rps_per_vu` · Updated.
- On click: **Workflow detail** — two-pane view. Left: tree view of the DSL v2 (sequence/parallel/delay/optional/request nodes, collapsible). Right: selected-node property inspector (path, method, body, variants, extracts, delay).
- Toolbar: "Validate against dataset" (picks a dataset, calls `POST /workflows/{id}/validate`).
- Existing "service dependency graph" popup stays, now as a **secondary** view under a tab labeled **Topology** — it's derived from `targets[]` + OTel trace discovery, not part of the editable DSL.
- "Add step" modal (the cURL-style editor in the current mockup) gets replaced by the tree editor's "insert request node" action — but the cURL import remains as a quick-path dialog: paste a cURL, get a populated request node.

### 7.6 Datasets (new)

- List view: Name · Pools (chip list with counts: `users: 10,000`, `products: 250`) · Size · TTL · Created.
- Detail: pool-level tab strip, sample rows table, "Upload NDJSON" button, "Use in run" inline launcher.

### 7.7 Experiments

**List view:** Name · Status (draft / running / complete / failed) · Phases (mini timeline of colored pills) · Started · Duration · Created by.

**Detail view (tabs):**
1. **Overview** — summary card (name, hypothesis, services targeted), `Run` primary action if status is draft.
2. **Phases** — phase timeline editor. Rows are phases (`baseline`, `isolation-1a`, `isolation-1b`, `isolation-2a`, `isolation-2b`, `combined`). Columns are: Rule state (what atropos rules apply), Workflow, Dataset, VUs, Duration, Status pill. Drag to reorder. "Add phase" inserts a configured row.
3. **Observability** — a 2×2 grid of Grafana panel embeds scoped to the experiment's time window and service targets: p99 per workflow, request rate per service, error-rate, cache-hit-rate (once cache-box is active). Each panel has an "Open in Grafana" link. Source panels live in the existing `faults-lab/experiments` Grafana dashboard; the UI embeds them via `d-solo` iframes with `from` and `to` query params derived from phase timestamps.
4. **Logs** — aggregated SSE tail across all runs in the experiment, filterable by phase.

**No Decomposition tab.** The latency-decomposition math (Δ_service, interaction matrix) is not exposed in the UI until the research assumptions are settled. See §8 for the parking-lot note.

**Add experiment dialog:** Name · Hypothesis (textarea) · Workflow (select; multi) · Targeted services (multi) · "Auto-plan phases" toggle (pre-populates baseline + one isolation per service + one combined).

### 7.8 Runs (new)

- Run detail page. Header: run ID, workflow, experiment link, phase pill, status, elapsed.
- Top row — StatCards: sent / dropped / iterations completed / p99.
- Middle: **per-step table** — step id · sent · ok · dropped · p50 · p95 · p99 · variant split.
- Bottom: **live event tail** — SSE `step.ok` / `step.drop` / `iteration.done` with filter chips. Auto-scrolling, pause on hover.
- Right panel: latency histogram per step (small charts, brushable).

### 7.9 Attacks (new)

- List: target · rate · duration · status · latency p99.
- Detail: config block, vegeta result summary, dedup-bypass stats.

### 7.10 Grafana embed pattern (cross-cutting)

Live perf views are Grafana panels embedded as iframes (panel's `/d-solo/...` URL with `theme=light`, `orgId=1`, `from`, `to`, and `var-service` query params). The UI owns:

- **Card chrome.** Each embed is wrapped in a `Card` with a title (panel name), a muted-foreground timestamp ("showing last 30 min"), and a top-right "Open in Grafana ↗" link. No heading chrome from Grafana itself — the iframe starts at the plot.
- **Time-window control.** A shared time-window selector at the top of the page (`5m / 15m / 30m / 1h / 3h / live`) rewrites the `from`/`to` on every embedded panel. On experiment/run pages the window is auto-pinned to the run/phase boundaries.
- **Scoping.** `var-service` and `var-workflow` are passed through from the URL so the panel filters itself.
- **Failure mode.** If Grafana returns 401/403 or the iframe fails to load, swap to a card with a "Grafana unavailable — check that `GRAFANA_URL` is reachable and the panel is world-readable or the user has the viewer role" message and the raw panel URL for debugging.

**Panels embedded by default:**

| Page | Panels |
|---|---|
| Dashboard | RPS (platform) · p99 by workflow · error rate (platform) · active-fault banner |
| Service detail | p99 for this service · RPS in/out · CPU/memory from cAdvisor · error rate |
| Run detail | p99 per step (for this run's time window) · throughput · drops |
| Experiment detail / Observability tab | p99 per workflow · RPS per target service · error rate · cache-hit rate |

**Not built yet** in Grafana — the `faults-lab/experiments` dashboard will need a few panel UIDs added before the embeds render real data. Ship the UI first with stubbed iframes and an empty-state "point this panel at a Grafana URL to begin" tile.

---

## 8. Gap list — what's missing and what to build next

Ranked by how much they block the experiment loop.

**Blocking (Phase 1 UI):**
1. **Experiment phase plan.** The current "Add experiment" is a flat form. Without a phase editor, the operator cannot express baseline → isolation-1a/1b/2a/2b → combined, which is the entire point of the platform.
2. ~~**Faults library + Rules picker.**~~ Done — Faults library screen and Rules editor with Fault picker / cache-box toggle are in Figma.
3. **Run detail with live SSE tail.** The API has it (`GET /runs/{id}/events`), the UI has nothing. Operators need this to know a run is actually making progress.
4. **Services / SDK instances detail.** Today's dashboard row has `last tested`; the UI has no way to inspect a specific SDK instance's rule-version lag or kill-switch it.
5. ~~**Cache-box mode in the rule editor.**~~ Done — Rule editor has "Apply a fault" / "Use cache-box" target selector.
6. ~~**Grafana panel embeds.**~~ Done — GrafanaPanel component built; embedded on Dashboard and Experiment detail Observability tab.

**Important (Phase 2 UI):**
6. **Datasets screen.** Without it, the operator uploads via `curl` or inline JSON. OK for debugging, not OK for the product.
7. **Workflow DSL tree editor.** The v2 DSL is tree-structured. A flat step list or a cURL-per-step modal cannot express `parallel { read-a, read-b } → sequence { compose }`.
8. **Attacks surface.** Vegeta precision attacks exist in zeus; no UI.
9. **Environment switcher.** The sidebar hardcodes "online boutique." Supporting Death Star Bench requires a switch.

**Nice-to-have (Phase 3 UI):**
10. **Topology view.** The current workflow popup's dependency graph is useful but should be derived from OTel traces, not hand-drawn.
11. **Dark mode.** Token set is ready; just needs the second mode on the Figma collection.
12. **Command palette.** `cmd-k` jump to run / rule / service. Later.

**Unresolved questions (need product decision):**
- Does a non-operator role ever view this UI? If yes, we need RBAC + a read-only mode. Assume no for Phase 1.
- How does the UI scope across multiple environments (online-boutique vs deathstarbench vs stage)? Dropdown in the sidebar, one selected at a time. Server-side, that maps to a manteion deployment per environment (simpler) or a tenant column in the stores (harder).
- Kill-switch granularity: per-service, per-rule, or both? The scaffolding doc says "disable-all-rules-for-service" — that's the safe default. Expose both once the endpoint ships.

**Parked (research not ready):**
- **Decomposition view.** The `Δ_service = baseline − frozen` math and the Σ Δ_isolated vs Δ_combined interaction check rest on assumptions (service independence under identical load, infrastructure-coupling randomization) that are still being validated. Rendering numbers off that math implies confidence the platform does not yet have. Revisit once the underlying methodology is stable and the team has a defensible story for how to present the result.

---

## 9. Implementation notes (code, not in scope for this doc)

- **Stack:** Next.js (app router) + Tailwind + shadcn/ui + TanStack Query.
- **API client:** generated from the manteion OpenAPI spec (once written). Until then, typed fetch wrappers in `lib/api/`.
- **Live data:** TanStack Query for polling; native `EventSource` for SSE run events.
- **State:** server state in TanStack Query, route state in the URL, almost no global client state. No Redux / Zustand.
- **Forms:** `react-hook-form` + `zod` resolvers. Rule schemas come from the manteion OpenAPI, not hand-written.
- **Charts:** `recharts` for latency histograms, sparklines; nothing heavier until the decomposition view needs it.
- **Theming:** single `globals.css` with the CSS variables named exactly as §5.1. Tailwind config maps them to utility classes (`bg-background`, `text-foreground`, etc.). Dark mode = duplicate block with `@media (prefers-color-scheme: dark)` once designed.

---

## 10. Figma source-of-truth map

Figma file: `MicroService Fault Testing Kit (Copy)` (fileKey `S7q0O6YXDJ3MbcRqQdLr03`).

| Doc section | Figma node |
|---|---|
| §4–5 tokens | `Tokens` page (to be added) — local variable collection `faults-lab/tokens` |
| §6 components | `Components` page — each component as a `COMPONENT_SET` or `COMPONENT` |
| §7 screens | `Screens` page — one 1440×900+ frame per screen (11 total: Dashboard, Rules, Experiment detail, Workflows detail, Services, Datasets, Run detail, Attacks, Faults, Experiments list, Workflows list) |
| §8 gaps | placeholder frames in `Screens` page with a blue annotation pointing at this doc |

The pre-redesign frames (`Dashboard`, `Fault Inject`, `Experiment`, `Work Flow Table`, `Experiment_details (pop-up)`, `Add experiment`, `Workflow pop up`, `Routing`, `Pop-up`) are kept under an `Archive (v0)` page until the v1 redesign is complete, then deleted.
