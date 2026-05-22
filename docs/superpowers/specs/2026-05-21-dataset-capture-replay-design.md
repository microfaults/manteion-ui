# Dataset capture-and-replay — design spec

**Date:** 2026-05-21
**Status:** Draft — awaiting user review
**Author:** Claude (Opus 4.7) + pronei
**Scope:** project-level, multi-repo (`manteion-ui`, `manteion-go`, `zeus-go`, `atropos-go`)

---

## 1. Problem & goal

The Datasets page is a `NotWiredYet` stub. More importantly, the operator has no
way to get *realistic* data into a workflow: today a workflow's `{{data.*}}`
template variables can only be filled by hand-uploaded NDJSON pools.

**Goal:** let an operator **capture a dev's manual browsing session** (real
requests against the frontend) and turn it into a **dataset** that a workflow
replays — so load tests exercise paths and payloads that actually occurred,
not synthetic guesses.

The user's words: *"attach the requests needed for each part of the workflow
since we can capture the same from a dev's manual browsing session and play it
back."*

---

## 2. Backend reality (what exists today)

Confirmed by reading zeus-go + manteion-go source (2026-05-21):

- **Datasets are zeus-owned** (`zeus-go/internal/dataset/types.go`), proxied
  through manteion at `/api/v1/zeus/datasets/*`:
  ```go
  Dataset { id, name, source, pools: map[string]Pool, ttl, size_bytes, created_at }
  Pool    { fields: []string, rows: []map[string]any, stats: {row_count, size_bytes} }
  Source  ∈ { "upload", "inline", "cache_box_dump" }
  ```
  Endpoints: `POST /datasets`, `GET /datasets`, `GET /datasets/{id}`,
  `POST /datasets/{id}/upload` (NDJSON), `GET /datasets/{id}/sample`,
  `DELETE /datasets/{id}`.

- **`source: "cache_box_dump"` is a reserved-but-unbuilt enum.**
  `zeus-go/internal/api/dataset_handler.go` literally comments it as *"(future)"*.
  The platform's data model anticipates cache-box capture → dataset; the
  ingestion path does not exist.

- **No capture mechanism exists** anywhere — no HAR import, no recording proxy,
  no session capture in zeus or atropos. (`grep` for capture/record/HAR/replay
  found only the dedup-bypass and trace-context modules, unrelated.)

- **Cache-box is a rule action** (`manteion-go/internal/model/rule.go`):
  `cachebox: { mode: passthrough|replay|replay_with_delay, key_strategy:
  exact|exact_with_host|exact_with_body }`. The modes describe **replay**
  behavior; there is **no explicit "record" mode** today. How the cache gets
  populated (and whether that populated cache is dumpable) is an atropos-go
  internal we have NOT yet inspected — see §8 Open questions.

- **Workflows consume datasets** via `data_schema.pools` + `{{data.pool.field}}`
  template vars; zeus hands the dataset to k6 at `setup()`. Run-create already
  accepts `dataset_id` — i.e. **replay already works** once a dataset exists.

- **manteion natively owns workflows** as of commit `8777543`, but **datasets
  remain zeus-proxied** (no manteion-native datasets endpoint). The UI stub
  references `/api/v1/datasets`; the working path today is
  `/api/v1/zeus/datasets` (reachable after the ZEUS_URL→nginx fix in `5a1e75f`).

---

## 3. Key design decisions

### D1 · Capture mechanism: atropos cache-box record mode, frontend-only

Capture happens in the **atropos SDK running in the frontend service**, recording
**inbound HTTP requests only**. Rationale:

- The atropos SDK is already in-process on every service and already has the
  cache-box machinery. Extending it to *record* is the path the platform was
  designed for (`cache_box_dump`).
- A workflow replays the **frontend's HTTP surface** (`base_url: http://frontend:8080`).
  The data it needs is exactly what the dev's browser sent to the frontend
  (`GET /product/{id}`, `POST /cart {product_id, quantity}`). Recording internal
  service-to-service calls (frontend→productcatalog gRPC, etc.) captures data no
  workflow replays — noise. **Frontend inbound HTTP is the right and sufficient
  scope.**
- Capture runs during a **baseline (no-fault) window** so the recorded traffic is
  clean.

### D2 · Capture → dataset projection

A capture is a flat log of requests:
`{ method, path, query, headers(filtered), body, ts }`. Projection groups them
into **pools** by request-path template and extracts the variable parts into
typed fields:

- `GET /product/OLJCESPC7Z` → pool `products`, row `{ id: "OLJCESPC7Z" }`
- `POST /cart {product_id: "OLJ…", quantity: 2}` → pool `cart_adds`, rows
  `{ product_id, quantity }`
- `GET /` → no variable data → contributes nothing to a pool

Path-template inference (which path segments are variables) is the hard part —
see §8. v1 can lean on the **workflow's existing `data_schema`** to know which
pools/fields to extract (projection is *guided by* the target workflow rather
than inferring templates blind).

### D3 · "Attach to workflow" = pool binding, not per-node request copies

The user's "attach the requests needed for each part of the workflow" maps to
**binding a dataset's pools to the workflow's `data_schema.pools`**. Each request
node already declares its data needs via `{{data.pool.field}}`; attaching a
dataset supplies the rows. We do **not** store a separate captured request blob
per node — that would duplicate what the template-var + pool mechanism already
expresses, and diverge from how zeus runs workflows.

### D4 · Datasets stay zeus-owned; UI talks to the proxy

No manteion-native datasets endpoint. The UI uses `/api/v1/zeus/datasets/*`
(consistent with how datasets are modeled). If manteion later absorbs datasets
the way it did workflows, the UI client swaps base paths — isolated to one file.

---

## 4. Architecture & data flow

```
                        ┌─ baseline window, record mode ON (frontend only) ─┐
   dev's browser ──HTTP──▶ frontend service ──▶ atropos SDK (cache-box record)
                                                      │ captures inbound req+resp
                                                      ▼
                                              capture buffer (atropos)
                                                      │ dump on stop
                                                      ▼
   operator clicks "Create dataset from capture"  ──▶ zeus POST /datasets
                                                      source = "cache_box_dump"
                                                      │ projection → pools
                                                      ▼
                                              Dataset { pools: {products, cart_adds, …} }
                                                      │ operator binds to workflow
                                                      ▼
   workflow.data_schema.pools  ◀── attach ──  Dataset pools
                                                      │ run-create(workflow_id, dataset_id)
                                                      ▼
                                              k6 setup() ← dataset ; replay
```

---

## 5. Sub-projects (decomposition)

| # | Sub-project | Repos | Backend change? | Shippable alone? |
|---|---|---|---|---|
| **1** | **Datasets CRUD UI** — wire the stubbed page to existing zeus dataset endpoints (list, detail, sample preview, NDJSON upload, delete). | manteion-ui | No | **Yes — now** |
| **2** | **Capture mechanism** — atropos cache-box record mode (frontend inbound HTTP) + a dump endpoint. | atropos-go, manteion-go (rule/record control), zeus-go (receive dump) | Yes | No |
| **3** | **Projection** — capture log → dataset pools, guided by the target workflow's `data_schema`. Implements the `cache_box_dump` source. | zeus-go | Yes | No (needs #2) |
| **4** | **Attach + replay UI** — bind dataset→workflow pools; "Validate against dataset"; "Use in run" launcher. | manteion-ui | No (uses existing run-create) | Partially (needs a dataset to exist) |

**Build order:** 1 → (2 ∥ 4-attach-UI) → 3 → 4-replay. Sub-project 1 delivers
operator value immediately and de-risks the dataset wire shapes the later phases
depend on.

---

## 6. Per-sub-project design

### Sub-project 1 — Datasets CRUD UI (local-only, shippable now)

- **`src/lib/api/datasets.ts`** (new): typed client over `/api/v1/zeus/datasets`.
  Zod schemas mirroring zeus's `Dataset`/`Pool` (`source`, `pools`, `ttl`,
  `size_bytes`, `created_at`). Functions: `listDatasets`, `getDataset`,
  `createDataset({name, ttl?})`, `uploadPool(id, ndjson)`, `sampleDataset(id, pool?)`,
  `deleteDataset(id)`. Mock branch (`VITE_USE_MOCK`) mirroring the rules.ts pattern.
- **`src/types/api.ts`**: add `DatasetSchema`, `PoolSchema`, `PoolStatsSchema`.
- **`src/routes/datasets/index.tsx`**: replace `NotWiredYet` with a list — Name ·
  Pools (chips with row counts) · Size · TTL · Source badge · Created. "New dataset"
  dialog (name + optional TTL). Per ui-design.md §7.6.
- **`src/routes/datasets/$datasetId.tsx`**: pool tab-strip, sample-rows table
  (`GET /sample`), "Upload NDJSON" (drag-drop → `POST /upload`), source badge,
  "Use in run" launcher (deep-links to run-create — stub until #4).
- Tests: api client parse + the list/detail render states (loaded/empty/error),
  following the FaultSpecPicker test pattern.

### Sub-project 2 — Capture mechanism (backend, needs investigation)

- **Investigate first** (atropos-go, not yet read): how does cache-box populate
  its cache? Is there a passthrough-and-store mode whose store is dumpable? Does
  it key by `exact_with_body`? This determines whether "record" is a new mode or
  a flag on existing modes.
- **Control surface:** operator starts/stops recording on the frontend service.
  Likely a manteion control endpoint (`POST /api/v1/capture/start {service:
  "frontend"}` / `stop`) that toggles a record rule on the frontend's atropos SDK
  via the existing rule-push channel. Frontend-only is enforced by scoping the
  record rule to `service == frontend`.
- **Dump:** on stop, atropos flushes the captured request log to zeus
  (`POST /api/v1/datasets` with `source: cache_box_dump` + raw capture payload),
  or stages it for projection (#3).
- **Privacy/size:** filter auth headers/cookies; cap capture size + TTL.

### Sub-project 3 — Projection (backend, zeus)

- Implement the `cache_box_dump` ingestion in zeus's dataset create path.
- **v1 = workflow-guided:** projection takes a `target_workflow_id`; for each
  pool in the workflow's `data_schema`, extract matching fields from captured
  requests (match by path template + body keys). Produces exactly the pools the
  workflow needs. Avoids blind path-template inference.
- **v2 (future):** unguided template inference (cluster paths, detect variable
  segments). Out of scope here.

### Sub-project 4 — Attach + replay UI (local-only mostly)

- On the workflow detail page (`$workflowId.tsx`): a "Data" panel listing the
  workflow's `data_schema.pools` and which dataset (if any) is bound, with a
  dataset picker. Binding is metadata the run-create call passes as `dataset_id`.
- "Validate against dataset" → `POST /api/v1/zeus/workflows/{id}/validate`
  (endpoint exists per zeus api-contract; returns missing pools / size warnings).
- "Use in run" / run-create with `dataset_id` — replay. (Run-create already
  exists; the Experiments/Runs UI is a separate effort.)

---

## 7. Phased plan (for the eventual implementation plan)

- **Phase 1 (manteion-ui, no VM):** Sub-project 1 — Datasets CRUD UI + client +
  types + tests + mock fixtures. Ships value immediately.
- **Phase 2 (atropos-go + manteion-go):** Sub-project 2 — record mode + capture
  control + dump. Gated on the atropos cache-box investigation.
- **Phase 3 (zeus-go):** Sub-project 3 — workflow-guided projection implementing
  `cache_box_dump`.
- **Phase 4 (manteion-ui):** Sub-project 4 — attach/validate/replay UI + capture
  controls surfaced in the UI.

Each phase gets its own spec→plan→implement cycle. **This spec covers the whole
arc; the first implementation plan should scope Phase 1 only.**

---

## 8. Open questions & risks

- **Atropos cache-box internals (blocking for Phase 2).** We have not read
  atropos-go. Need to confirm: does cache-box already store request→response in a
  dumpable form, or is "record" net-new? Does it see full request bodies? This is
  the single biggest unknown and should be the first investigation in Phase 2.
- **Path-template inference.** v1 sidesteps it by being workflow-guided
  (projection knows the target pools). Unguided inference is a real research
  problem deferred to v2.
- **Frontend-only completeness.** Recording only the frontend's inbound HTTP
  assumes workflows only ever hit the frontend. True for online-boutique; revisit
  if workflows ever target backend services directly.
- **Capture volume & PII.** A browsing session can be large and contain
  cookies/tokens. Need header/cookie filtering, size caps, and TTL on captures.
- **Datasets ownership drift.** If manteion later absorbs datasets (as it did
  workflows), the UI client base path changes. Isolated to `datasets.ts`.
- **Replay fidelity.** Pools give *values*, not exact request ordering. A workflow
  replays its own tree shape with captured values filled in — it does **not**
  replay the exact request sequence/timing the dev performed. If exact-sequence
  replay is desired, that's a different feature (closer to a recorded "session
  workflow") and should be called out now.

---

## 9. Non-goals

- Exact request-sequence/timing replay (see §8 last bullet) — pools fill a
  workflow's existing shape, they don't reconstruct the literal session.
- Capturing internal service-to-service calls (frontend-only by decision D1).
- Unguided path-template inference (v2).
- Building the Experiments/Runs UI — replay uses existing run-create; the run
  observability UI is a separate effort.
- manteion-native datasets endpoint — datasets stay zeus-proxied (D4).
