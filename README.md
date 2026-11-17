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
cp .env.example .env.local # defaults expect manteion-go on localhost:9090
pnpm dev                   # http://localhost:5173
```

In another terminal, with kubectl pointed at the cluster that runs
manteion-go, forward its service to `localhost:9090`:

```sh
kubectl port-forward svc/manteion 9090:8080
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
| `VITE_MANTEION_URL` | yes | `http://localhost:5173` | Base URL the client sends API calls to. The default routes through the Vite dev proxy (`/api/*` → `http://localhost:9090`), where the manteion port-forward listens. Override only if you're hitting manteion directly (e.g. a deployed environment). |
| `VITE_DEFAULT_ENV` | no | `online-boutique` | Active kustomize overlay / environment name. Sent as the `X-Faults-Lab-Environment` header on every request and shown in the sidebar. Change this when targeting a different demo app deployment. |
| `VITE_GRAFANA_URL` | no | — | Base URL of Grafana (no trailing slash). Dashboard cards link to `/d/atropos-overview?...`. For an in-cluster Grafana, run `kubectl port-forward svc/grafana 3001:3000`, then set `VITE_GRAFANA_URL=http://localhost:3001`. Leave unset to hide the Grafana links. |
| `VITE_PROMETHEUS_URL` | no | `http://localhost:5173/prometheus` | Prometheus HTTP API base URL. Dashboard observability cards query this for live RPS, p99, error rate, and cache-hit metrics. The default routes through the Vite proxy at `/prometheus/api/v1/*` → `127.0.0.1:9091` (avoids CORS). Run `kubectl port-forward svc/prometheus 9091:9090` alongside the manteion port-forward. |

### Per-environment overrides

Vite loads env files in order of specificity
(`.env` → `.env.local` → `.env.development` → `.env.development.local`).
For a staging build, create `.env.staging.local` and run:

```sh
pnpm vite build --mode staging
```

### Connecting to manteion-go

manteion-go runs in Kubernetes as the ClusterIP service
`svc/manteion:8080`. With kubectl pointed at that cluster, forward it to
your laptop:

```sh
kubectl port-forward svc/manteion 9090:8080
```

Ctrl-C stops the forward. Then in another terminal:

```sh
pnpm dev   # http://localhost:5173 — defaults proxy /api/* to localhost:9090
```

If manteion-go is unreachable, the dashboard shows
"Could not reach manteion — is VITE_MANTEION_URL correct?".

## Stack

| Concern | Pick |
|---|---|
| Build | Vite 5 + `@vitejs/plugin-react-swc` |
| Framework | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS + CSS variables (tokens from `docs/design/ui-design.md §5`) |
| Components | shadcn/ui (copy-in under `src/components/ui/`) |
| Routing | TanStack Router (file-based, type-safe) |
| Server state | TanStack Query |
| Forms | Controlled React state, validated before submit |
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
│   ├── ops/                 ← runbooks for the retired VM environment, kept as history
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

## Mock demo

The public demo is the console built in mock mode: every API call and the
dashboard's Prometheus queries are served from in-browser fixtures, so it
needs no backend and the data it shows is simulated. `.env.demo` (committed,
no secrets) sets `VITE_USE_MOCK=true` and `VITE_DEFAULT_ENV=online-boutique`.

```sh
pnpm dev --mode demo   # run the demo locally on http://localhost:5173
pnpm build:demo        # static build of the demo into dist/
```

`pnpm build` is unchanged and still produces the operator build.

Deploys run from GitHub Actions (`.github/workflows/ci.yml`). Every push to
`mock-mode`, `develop` or `main`, and every pull request, runs lint,
typecheck, tests and `pnpm build:demo`. A push to `mock-mode` then deploys
`dist/` to the Cloudflare Pages project `manteion`
(`wrangler pages deploy dist --project-name=manteion --branch=mock-mode`).
`public/_headers` sets caching and security headers on Pages, and since the
build has no `404.html`, Pages serves `index.html` for deep links.

The deploy job stays off until the owner, once:

1. creates the Pages project:
   `wrangler pages project create manteion --production-branch mock-mode`;
2. adds the repository secrets `CLOUDFLARE_API_TOKEN` (a token with
   Cloudflare Pages edit permission) and `CLOUDFLARE_ACCOUNT_ID`;
3. sets the repository variable `DEPLOY_ENABLED` to `true`.

The job runs in the GitHub environment `demo`, which can hold the secrets
instead of the repository.

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
- [`docs/ops/connecting-to-vm1.md`](./docs/ops/connecting-to-vm1.md) — the
  runbooks under `docs/ops/` describe the retired VM environment and are kept
  as history.
- `../VISION.md` — product north star; what "the experiment loop" means.
