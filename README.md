# manteion-ui

Operator console for the **faults-lab** platform. A React admin that talks only
to `manteion-go` (which in turn proxies a narrow slice of `zeus-go`). Every
screen corresponds to a step in the experiment loop defined in
`UI-DESIGN.md` — configure rules, launch experiments, inspect phase-by-phase
latency, read the verdict.

## Quickstart

```sh
# from the repo root
cd manteion-ui
corepack enable pnpm       # one-time, on systems without pnpm
pnpm install
cp .env.example .env.local # edit VITE_MANTEION_URL to your manteion-go
pnpm dev                   # http://localhost:5173
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
cp .env.example .env.local
```

All variables are prefixed `VITE_` so Vite exposes them to the browser at
build time via `import.meta.env`. **Do not put secrets here** — everything
is baked into the client bundle.

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_MANTEION_URL` | yes | `http://localhost:9090` | Base URL of the manteion-go API (no trailing slash). Every API call from `src/lib/api/client.ts` hits this host. Set to your cluster's gateway or port-forward address. |
| `VITE_DEFAULT_ENV` | no | `online-boutique` | Active kustomize overlay / environment name. Sent as the `X-Faults-Lab-Environment` header on every request and shown in the sidebar. Change this when targeting a different demo app deployment. |
| `VITE_GRAFANA_URL` | no | — | Base URL for embedded Grafana `d-solo` panels (latency / throughput dashboards). Not wired in code yet — will be used once the dashboard pages embed live panels. |

### Per-environment overrides

Vite loads env files in order of specificity
(`.env` → `.env.local` → `.env.development` → `.env.development.local`).
For a staging build, create `.env.staging.local` and run:

```sh
pnpm vite build --mode staging
```

### Connecting to manteion-go

The UI expects manteion-go on `VITE_MANTEION_URL`. The fastest local setup:

```sh
# terminal 1 — port-forward from a cluster
kubectl port-forward svc/manteion-go 9090:9090

# terminal 2 — start the UI (defaults point at localhost:9090)
pnpm dev
```

If manteion-go is unreachable, the dashboard shows
"Could not reach manteion — is VITE_MANTEION_URL correct?".

## Stack

| Concern | Pick |
|---|---|
| Build | Vite 5 + `@vitejs/plugin-react-swc` |
| Framework | React 18 + TypeScript (strict) |
| Styling | Tailwind CSS + CSS variables (tokens from `UI-DESIGN.md §5`) |
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
│   ├── API-NEEDED.md        ← endpoints the UI expects from manteion-go
│   └── figma-changes.md     ← handoff notes for the Rules v1.1 + hover-card work
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

The UI is route-complete — every screen in `UI-DESIGN.md §7` has a route and
a shell. Many pages are intentionally stubbed with `<NotWiredYet/>` because
their backend endpoints don't exist yet. See `docs/API-NEEDED.md` for the full
backlog.

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
  list them in `docs/API-NEEDED.md`.
- Mono font (`JetBrains Mono`) for every identifier, latency, and rule name;
  `Inter` for everything else.
- 8-pt grid, 48-px rows, 24-px card padding. Default shadcn radius (8/6).

## Related reading

- `../UI-DESIGN.md` — design spec, token values, per-screen behaviour.
- `../VISION.md` — product north star; what "the experiment loop" means.
- `./docs/API-NEEDED.md` — endpoint contract for manteion-go.
- `./docs/figma-changes.md` — what shipped to the Figma file this round.
