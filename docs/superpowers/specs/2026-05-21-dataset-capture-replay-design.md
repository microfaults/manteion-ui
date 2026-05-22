# Dataset capture-and-replay — design spec

**Date:** 2026-05-21 (rev. 2 — reframed around existing cache-box recording)
**Status:** Draft — awaiting user review
**Author:** Claude (Opus 4.7) + pronei
**Scope:** project-level, multi-repo (`manteion-ui`, `manteion-go`, `zeus-go`, `atropos-go`)

---

## 1. Problem & goal

The Datasets page is a `NotWiredYet` stub. More importantly, the operator has no
way to get *realistic* data into a workflow: today a workflow's `{{data.*}}`
template variables can only be filled by hand-uploaded NDJSON pools.

**Goal:** generate a workflow dataset from **real traffic captured at the
frontend during a baseline run**, so load tests exercise paths and payloads that
actually occurred — not synthetic guesses. Capture reuses the **existing
cache-box recording pipeline** (atropos already records request→response during
passthrough and pushes to manteion); we repurpose that captured traffic for
dataset generation instead of cache replay.

There is **no dev-in-the-loop manual browsing step.** The traffic source is a
normal baseline run driving load against the frontend; capture is a passive
side-effect of the frontend's atropos SDK, exactly as cache-box recording works
today.

---

## 2. Backend reality (verified by reading source, 2026-05-21)

### Datasets (zeus)
- Zeus-owned (`zeus-go/internal/dataset/types.go`), proxied via manteion at
  `/api/v1/zeus/datasets/*`:
  ```go
  Dataset { id, name, source, pools: map[string]Pool, ttl, size_bytes, created_at }
  Pool    { fields: []string, rows: []map[string]any, stats }
  Source  ∈ { "upload", "inline", "cache_box_dump" }   // cache_box_dump = "(future)", unbuilt
  ```
  Endpoints: create / list / get / `upload` (NDJSON) / `sample` / delete.
- Workflows consume datasets via `data_schema.pools` + `{{data.pool.field}}`;
  zeus hands the dataset to k6 at `setup()`. **Run-create already accepts
  `dataset_id` — replay works once a dataset exists.**

### Cache-box recording pipeline (atropos → manteion) — ALREADY EXISTS
This is the key finding. The capture machinery the goal needs is largely built,
it just feeds cache-replay today:

- **Recording is a side-effect of `passthrough` mode**
  (`atropos-go/internal/interceptor/cachebox.go`): forward to the real
  downstream, buffer the response, enqueue `cb.Record(CacheRecord{...})` on a
  drain goroutine (off the hot path). `CacheRecord`
  (`internal/cachebox/recorder.go`) holds the **full exchange**:
  `Request, RequestBody, StatusCode, ResponseHeader, ResponseBody,
  ObservedLatency, Timestamp`.
- **`CachePushClient` (`atropos-go/cache_push.go`)** batches entries and POSTs
  them to **manteion `POST /api/v1/cache/ingest`**, scoped to `RunID` + `Service`.
- **manteion persists** (`internal/api/cache_handler.go` →
  `cacheStore.Write(runID, service, entries)`), gated by a per-run
  `run.PersistCache` flag. Code comment notes capture is **not baseline-only**
  ("a chaos run that wants to capture cache state"). SDKs later seed their cache
  from `handleCacheEntries` (the replay path).

### Two findings that shape the design
1. **The wire format drops the request.** `WireEntry`
   (`atropos-go/internal/cachebox/wire.go`) =
   `{ key, status_code, header, body, observed_latency_us, recorded_at }` —
   response only. The structured request lives in `CacheRecord` but is discarded
   at the wire boundary.
2. **Key reversibility is partial** (`internal/cachebox/key.go`):
   - `exact` / `exact_with_host` keys embed `method|path|query` as **plaintext**
     → recoverable (e.g. `GET /product/OLJCESPC7Z` survives).
   - `exact_with_body` appends an **FNV-1a hash** of the body → **not
     recoverable** (`POST /cart {product_id, quantity}` values are lost).

**Implication:** GET path/query values are already recoverable from today's wire.
**POST/PUT body values are not.** Dataset generation that needs body fields
requires carrying the raw structured request through recorder → wire → ingest.
`CacheRecord` already has the data, so the delta is on the wire + ingest, not the
capture itself.

### Ownership
manteion natively owns workflows (commit `8777543`) but **datasets remain
zeus-proxied**. The UI stub references `/api/v1/datasets`; the working path today
is `/api/v1/zeus/datasets` (reachable after the ZEUS_URL→nginx fix `5a1e75f`).

---

## 3. Key design decisions

### D1 · Capture = existing cache-box recording, repurposed (no new capture path)
Capture happens via the **atropos cache-box passthrough recorder already running
in the frontend service**, during a **baseline run** that drives load against the
frontend. No manual browsing, no new recorder. We add a *purpose* (D2) and carry
the request (D3); we do not build a parallel capture mechanism.

**Frontend-only**, because a workflow replays the frontend's HTTP surface
(`base_url: http://frontend:8080`, paths like `/product/{id}`, `POST /cart`).
Recording internal service-to-service calls captures data no workflow replays.
Scope is enforced by enabling the capture purpose only on the frontend service's
rule.

### D2 · Capture purpose enum (the "better name")
Today the run carries a bool `PersistCache` and the dataset carries
`Source = "cache_box_dump"` — both frame the captured data as *cache*. That's the
wrong mental model for dataset generation. Introduce an explicit **capture
purpose** so the same recording pipeline can serve two ends:

```
CapturePurpose:
  "off"               — no capture
  "cache_seed"        — capture to seed cache-box replay (today's PersistCache=true)
  "workflow_dataset"  — capture to generate a workflow dataset (NEW)
```

- Replaces the boolean `run.PersistCache` with `run.capture_purpose`
  (back-compat: `true` ⇒ `cache_seed`, `false` ⇒ `off`).
- Rename zeus's `Dataset.Source` value `"cache_box_dump"` → **`"traffic_capture"`**
  (clearer; drops the misleading "cache" framing).
- **Recommended new value: `workflow_dataset`.** Alternatives considered:
  `dataset_capture`, `traffic_sample`. `workflow_dataset` reads best at the call
  site (`capture_purpose: workflow_dataset`) and ties to the consuming concept.

### D3 · Carry the structured request when purpose = `workflow_dataset`
When `capture_purpose == workflow_dataset`, extend the recorder→wire→ingest path
to include the request the dataset projector needs:
`{ method, path, query, body, headers(filtered) }`. `CacheRecord` already holds
all of it; the change is a `WireEntry` variant (or a sibling `RequestEnvelope`)
populated only for this purpose, so the cache-seed path stays byte-for-byte
unchanged. This is the one genuinely new piece of backend wiring — and it's
small because nothing new needs to be *captured*, only *forwarded*.

### D4 · Projection is workflow-guided
Manteion (or zeus) projects the captured requests for a run into dataset pools,
**guided by a target workflow's `data_schema`**: for each declared pool/field,
extract matching values from captured requests (path-segment match + body-key
match). Produces exactly the pools the workflow needs and sidesteps blind
path-template inference (deferred to a v2; see §8).

### D5 · "Attach to workflow" = pool binding, not per-node request copies
The result is a normal zeus dataset (`source: traffic_capture`). Binding it to a
workflow means supplying rows for the workflow's existing `data_schema.pools`
(consumed via `{{data.pool.field}}`). We do **not** store a captured request blob
per node — that would duplicate the template-var mechanism and diverge from how
zeus runs workflows.

### D6 · Datasets stay zeus-owned; UI talks to the proxy
No manteion-native datasets endpoint. UI uses `/api/v1/zeus/datasets/*`. If
manteion later absorbs datasets (as it did workflows), the UI client swaps base
paths — isolated to one file.

---

## 4. Architecture & data flow

```
   baseline run (zeus drives load) ──HTTP──▶ frontend service
                                                  │  atropos cache-box passthrough
                                                  │  records req+resp (CacheRecord)
                                                  │  capture_purpose = workflow_dataset
                                                  ▼
                              CachePushClient ──POST /api/v1/cache/ingest──▶ manteion
                                  (batches; RunID + Service)                  │ cacheStore.Write
                                                                              │ (+ request payload, D3)
                                                                              ▼
   operator: "Generate dataset from run R, guided by workflow W"  ──▶  projection (D4)
                                                                              │ pools = W.data_schema ∩ captured values
                                                                              ▼
                                              zeus dataset { source: traffic_capture, pools: {...} }
                                                                              │ bind to workflow W
                                                                              ▼
                              run-create(workflow_id=W, dataset_id=D)  ──▶  k6 setup() ← dataset ; replay
```

---

## 5. Sub-projects (decomposition)

| # | Sub-project | Repos | Backend change? | Shippable alone? |
|---|---|---|---|---|
| **1** | **Datasets CRUD UI** — wire the stubbed page to existing zeus dataset endpoints (list, detail, sample, NDJSON upload, delete). | manteion-ui | No | **Yes — now** |
| **2** | **Capture purpose plumbing** — `CapturePurpose` enum on the run (replaces `PersistCache`); `workflow_dataset` value; rename `Source` → `traffic_capture`. Wire it through atropos record-config + manteion ingest. | atropos-go, manteion-go | Yes (small) | No |
| **3** | **Request-carrying wire (D3)** — extend recorder→`WireEntry`→`/cache/ingest` to forward `{method,path,query,body,headers}` when purpose=`workflow_dataset`. | atropos-go, manteion-go | Yes | No (needs #2) |
| **4** | **Projection** — captured requests for a run → dataset pools, workflow-guided; creates a zeus dataset `source: traffic_capture`. | manteion-go and/or zeus-go | Yes | No (needs #3) |
| **5** | **Attach + replay UI** — bind dataset→workflow; "Generate dataset from run"; "Validate against dataset"; "Use in run". | manteion-ui | No (uses existing run-create) | Partially |

**Build order:** 1 → 2 → 3 → 4 → 5. Sub-project 1 ships operator value now and
de-risks the dataset wire shapes the later phases depend on.

---

## 6. Per-sub-project design

### Sub-project 1 — Datasets CRUD UI (local-only, shippable now)
- **`src/lib/api/datasets.ts`** (new): typed client over `/api/v1/zeus/datasets`.
  Zod schemas mirroring zeus's `Dataset`/`Pool`. Functions: `listDatasets`,
  `getDataset`, `createDataset({name, ttl?})`, `uploadPool(id, ndjson)`,
  `sampleDataset(id, pool?)`, `deleteDataset(id)`. `VITE_USE_MOCK` branch like
  `rules.ts`.
- **`src/types/api.ts`**: `DatasetSchema`, `PoolSchema`, `PoolStatsSchema`; the
  `source` enum includes `traffic_capture`.
- **`src/routes/datasets/index.tsx`**: list — Name · Pools (chips w/ row counts) ·
  Size · TTL · Source badge · Created; "New dataset" dialog. Per ui-design §7.6.
- **`src/routes/datasets/$datasetId.tsx`**: pool tab-strip, sample-rows table,
  "Upload NDJSON" (drag-drop), source badge, "Use in run" launcher (stub → #5).
- Tests: client parse + list/detail render states, FaultSpecPicker pattern.

### Sub-project 2 — Capture purpose plumbing (backend, small)
- manteion: replace `run.PersistCache bool` with `run.capture_purpose` enum
  (migration + back-compat mapping). Ingest gate keys off purpose. Rename the
  dataset source value (zeus + any manteion mirror).
- atropos: the record config gains the purpose so the SDK knows whether to carry
  the request payload (#3). Pushed through the existing rule channel; enable only
  for `service == frontend`.

### Sub-project 3 — Request-carrying wire (backend)
- atropos: add a `WireEntry` variant / sibling that includes
  `{ method, path, query, body, headers(filtered) }`, populated only when
  purpose=`workflow_dataset`. Filter auth headers/cookies; cap body size.
- manteion: `/cache/ingest` + `cacheStore` accept and persist the request side
  for `workflow_dataset` captures (separate column/table from cache entries so the
  cache-seed path is untouched).

### Sub-project 4 — Projection (backend)
- Endpoint: `POST /api/v1/datasets/from-run { run_id, workflow_id }` (manteion,
  or zeus with manteion proxy). For each pool/field in `workflow.data_schema`,
  extract values from the run's captured requests (path-segment + body-key match),
  dedupe, build pools, create a zeus dataset `source: traffic_capture`.
- v1 is workflow-guided only; unguided template inference deferred (§8).

### Sub-project 5 — Attach + replay UI (local-only mostly)
- Workflow detail (`$workflowId.tsx`): "Data" panel listing `data_schema.pools`
  and the bound dataset, with a dataset picker + "Generate from run" action
  (calls #4). Binding feeds `dataset_id` to run-create.
- "Validate against dataset" → `POST /api/v1/zeus/workflows/{id}/validate`.
- "Use in run" → run-create with `dataset_id` (replay; Experiments/Runs UI is a
  separate effort).

---

## 7. Phased plan (for the eventual implementation plan)

- **Phase 1 (manteion-ui, no VM):** Sub-project 1 — Datasets CRUD UI. Ships now.
- **Phase 2 (manteion-go + atropos-go):** Sub-projects 2 + 3 — capture purpose
  enum + request-carrying wire.
- **Phase 3 (manteion-go / zeus-go):** Sub-project 4 — workflow-guided projection,
  `datasets/from-run`.
- **Phase 4 (manteion-ui):** Sub-project 5 — attach / generate-from-run / replay UI.

Each phase gets its own spec→plan→implement cycle. **This spec covers the whole
arc; the first implementation plan should scope Phase 1 only.**

---

## 8. Open questions & risks

- **~~Atropos cache-box internals~~ — RESOLVED (rev. 2).** The recorder, push
  client, and manteion ingest all exist; recording is a passthrough side-effect.
  The real delta is D3 (carry the request on the wire), not a new recorder.
- **POST/PUT body recoverability.** Today's wire hashes bodies (`exact_with_body`)
  and drops them otherwise — so body-derived pool fields require D3. GET
  path/query fields could be recovered from the existing key, but D3 carries the
  request uniformly so projection has one input shape.
- **Path-template inference.** v1 sidesteps it (workflow-guided). Unguided
  inference (cluster paths, detect variable segments) is a v2 research item.
- **Frontend-only completeness.** Assumes workflows only hit the frontend. True
  for online-boutique; revisit if workflows ever target backend services.
- **Capture volume & PII.** Baseline runs can produce large captures with
  cookies/tokens. Need header/cookie filtering, body-size caps, TTL.
- **Where projection lives.** manteion (owns runs + cache store) vs zeus (owns
  datasets). Leaning manteion-side projection that writes a zeus dataset via the
  existing proxy — confirm during Phase 3 planning.
- **Replay fidelity.** Pools give *values*, not exact ordering/timing. A workflow
  replays its own tree shape with captured values filled in — it does **not**
  reproduce the literal captured request sequence. If exact-sequence replay is
  ever wanted, that's a different feature (a recorded "session workflow").

---

## 9. Non-goals

- A dev-in-the-loop manual browsing capture step (removed in rev. 2 — capture is a
  passive side-effect of a baseline run).
- Exact request-sequence/timing replay (§8 last bullet).
- Capturing internal service-to-service calls (frontend-only, D1).
- Unguided path-template inference (v2).
- Building the Experiments/Runs UI — replay uses existing run-create.
- manteion-native datasets endpoint — datasets stay zeus-proxied (D6).
