# manteion-ui

Operator console for the **faults-lab** platform. A React admin that talks only
to `manteion-go` (which in turn proxies a narrow slice of `zeus-go`). Every
screen corresponds to a step in the experiment loop defined in
[`docs/design/ui-design.md`](./docs/design/ui-design.md) — configure rules,
launch experiments, inspect phase-by-phase latency, read the verdict.

## Quickstart

```sh
# from the repo root
cd manteion-ui
corepack enable pnpm       # one-time, on systems without pnpm
pnpm install
cp .env.example .env.local # defaults are correct for the VM1 SSH tunnel
pnpm dev                   # http://localhost:5173
```

In another terminal, open the SSH tunnel to manteion-go on VM1
(see [`docs/ops/connecting-to-vm1.md`](./docs/ops/connecting-to-vm1.md)):

```sh
ssh -L 9090:localhost:9090 pmundra@2262-cse115b-01.be.ucsc.edu \
    'kubectl port-forward svc/manteion 9090:8080'
```

Run the full build + tests:

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Environment variables

Configuration lives in a `.env.local` file (gitignored). Copy the example
and adjust values to match your local setup:

```sh
cp .env.example .env.local  # then adjust URLs
```

All variables are prefixed `VITE_` so Vite exposes them to the browser at
build time via `import.meta.env`. **Do not put secrets here** — everything
is baked into the client bundle.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_MANTEION_URL` | yes | `http://localhost:5173` | Base URL the client sends API calls to. The default routes through the Vite dev proxy (`/api/*` → `http://localhost:9090`), which the VM1 SSH tunnel terminates. Override only if you're hitting manteion directly (e.g. a deployed environment). |
| `VITE_DEFAULT_ENV` | no | `online-boutique` | Active kustomize overlay / environment name. Sent as the `X-Faults-Lab-Environment` header on every request and shown in the sidebar. Change this when targeting a different demo app deployment. |
| `VITE_GRAFANA_URL` | no | — | Base URL of Grafana (no trailing slash). Dashboard cards link to `/d/atropos-overview?...`. Grafana runs in-cluster on VM1: `ssh -L 3001:localhost:3001 pmundra@2262-cse115b-01.be.ucsc.edu 'kubectl port-forward svc/grafana 3001:3000'`, then set `VITE_GRAFANA_URL=http://localhost:3001`. Leave unset to hide the Grafana links. |
| `VITE_PROMETHEUS_URL` | no | `http://localhost:5173/prometheus` | Prometheus HTTP API base URL. Dashboard observability cards query this for live RPS, p99, error rate, and cache-hit metrics. The default routes through the Vite proxy at `/prometheus/api/v1/*` → `127.0.0.1:9091` (avoids CORS). Open `ssh -L 9091:localhost:9091 pmundra@2262-cse115b-01.be.ucsc.edu 'kubectl port-forward svc/prometheus 9091:9090'` alongside the manteion tunnel. |

### Per-environment overrides

Vite loads env files in order of specificity
(`.env` → `.env.local` → `.env.development` → `.env.development.local`).
For a staging build, create `.env.staging.local` and run:

```sh
pnpm vite build --mode staging
```

### Connecting to manteion-go on VM1

manteion-go runs in k3s on VM1 (`2262-cse115b-01.be.ucsc.edu`) as the
ClusterIP service `svc/manteion:8080`. Bridge it to your laptop with one
SSH local-forward:

```sh
ssh -L 9090:localhost:9090 pmundra@2262-cse115b-01.be.ucsc.edu \
    'kubectl port-forward svc/manteion 9090:8080'
```

This opens an SSH tunnel and starts `kubectl port-forward` on the VM in one
command — Ctrl-C tears both down. Then in another terminal:

```sh
pnpm dev   # http://localhost:5173 — defaults proxy /api/* to localhost:9090
```

If manteion-go is unreachable, the dashboard shows
"Could not reach manteion — is VITE_MANTEION_URL correct?". See
[`docs/ops/connecting-to-vm1.md`](./docs/ops/connecting-to-vm1.md) for the
traffic-flow diagram and troubleshooting.

## Stack

| Concern | Pick |
|---|---|
| Build | Vite 5 + `@vitejs/plugin-react-swc` |
| Framework | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS + CSS variables (tokens from `docs/design/ui-design.md §5`) |
| Components | shadcn/ui (copy-in under `src/components/ui/`) |
| Routing | TanStack Router (file-based, type-safe) |
| Server state | TanStack Query |
| Forms | `react-hook-form` + `zod` |
| Rules builder | Custom AND/OR/NOT tree + OPA-rego compile/parse under `src/lib/rego/` |
| Lint / format | Biome |
| Test | Vitest + jsdom + Testing Library |

The Figma source of truth is `MicroService Fault Testing Kit (Copy)`
(`fileKey=S7q0O6YXDJ3MbcRqQdLr03`). Tokens and shadcn primitives map 1:1
between code and design.

## Directory layout

```
manteion-ui/
├── docs/
│   ├── README.md            ← index for the rest of this tree
│   ├── design/              ← ui-design.md, figma-changes.md
│   ├── api/                 ← api-needed.md (endpoints the UI expects)
│   ├── ops/                 ← connecting-to-vm1.md (SSH tunnel setup)
│   └── archive/             ← shipped review/fix plans, kept for history
├── src/
│   ├── main.tsx · router.tsx · globals.css
│   ├── routes/              ← TanStack Router file routes
│   ├── components/
│   │   ├── ui/              ← shadcn primitives
│   │   ├── layout/          ← sidebar, topbar, shell
│   │   ├── rule-builder/    ← Match criteria builder (AND/OR/NOT) + Rego tab
│   │   ├── phase-pill.tsx · phase-hover-card.tsx · stat-card.tsx · …
│   │   └── not-wired-yet.tsx
│   ├── lib/
│   │   ├── api/             ← typed fetch wrappers (Zod-validated)
│   │   ├── rego/            ← AST · compile · parse (+ vitest round-trip)
│   │   └── utils.ts
│   └── types/api.ts         ← Zod schemas (hand-written until OpenAPI ships)
└── tailwind.config.ts · vite.config.ts · tsconfig*.json · biome.json · components.json
```

## What's wired vs. what's not

The UI is route-complete — every screen in `docs/design/ui-design.md §7` has
a route and a shell. Many pages are intentionally stubbed with `<NotWiredYet/>`
because their backend endpoints don't exist yet. See
[`docs/api/api-needed.md`](./docs/api/api-needed.md) for the full backlog.

Wired today:
- `/dashboard` — reads `/api/v1/status`, `/api/v1/rules`, `/api/v1/sdk/instances`
- `/services` · `/services/:id` (detail is stubbed pending new endpoints)
- `/rules` · `/rules/:id` — full CRUD against `/api/v1/rules`, with the new
  OPA-rego match-criteria builder
- `/experiments` — renders the list shape with hoverable phase pills; the
  backing endpoints (`/api/v1/experiments`, `/api/v1/experiments/{id}/phase/…`)
  are missing, so the list is empty until manteion-go ships them

Not wired yet:
- `/faults`, `/workflows`, `/datasets`, `/runs/:id`, `/attacks`, `/settings/*`

## The OPA-rego rules builder

`src/components/rule-builder/` holds the two-tab editor:
- **Builder**: nested AND / OR / NOT groups of leaf conditions
  (`field op value`). Field catalog in `fields.ts`, operators per field.
- **Rego**: raw rego editor. Pasted rego re-parses into the builder grammar
  where possible; anything beyond the supported subset is marked "custom"
  and the builder view goes read-only.

`src/lib/rego/` implements AST ↔ rego round-tripping with a narrow but
well-tested subset. Run the tests with `pnpm test` — 8 round-trip cases cover
eq / in / matches / starts_with / numeric / NOT / dotted-key fields.

## Figma ⇄ code parity

- Tokens: `src/globals.css` mirrors the `faults-lab/tokens` variable
  collection in Figma. Same names, same values.
- Components: shadcn primitives under `src/components/ui/` correspond to the
  `Components` page in Figma (Button/\*, Badge/\*, Card, Input, Sidebar item,
  StatCard, GrafanaPanel). Two project-specific additions — `PhaseHoverCard`
  (3-variant component set) and `MatchBuilder` — live on the same Components
  page; the React counterparts are under `src/components/phase-hover-card.tsx`
  and `src/components/rule-builder/`.
- The `Rules — v1.1 (opa)` frame in Figma is the authoritative mockup for the
  redesigned rule editor — a copy of the original `Rules` frame plus three
  annotation callouts and a live instance of `MatchBuilder`.

## Conventions

- No Redux. Server state in TanStack Query, route state in the URL.
- Every API call goes through `src/lib/api/client.ts` (a Zod-validated
  fetch wrapper). Add new endpoints in `src/lib/api/<resource>.ts` and
  list them in `docs/api/api-needed.md`.
- Mono font (`JetBrains Mono`) for every identifier, latency, and rule name;
  `Inter` for everything else.
- 8-pt grid, 48-px rows, 24-px card padding. Default shadcn radius (8/6).

## Related reading

- [`docs/README.md`](./docs/README.md) — index for the knowledge base.
- [`docs/design/ui-design.md`](./docs/design/ui-design.md) — design spec,
  token values, per-screen behaviour.
- [`docs/api/api-needed.md`](./docs/api/api-needed.md) — endpoint contract
  for manteion-go.
- [`docs/design/figma-changes.md`](./docs/design/figma-changes.md) — what
  shipped to the Figma file this round.
- [`docs/ops/connecting-to-vm1.md`](./docs/ops/connecting-to-vm1.md) — SSH
  tunnel from your laptop to manteion-go on the VM1 cluster.
- `../VISION.md` — product north star; what "the experiment loop" means.
