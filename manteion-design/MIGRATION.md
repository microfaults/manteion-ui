# MIGRATION.md — Manteion Design System → manteion-ui

Report of the design-system integration into `manteion-ui`, written back into the
handoff bundle so the design system can be updated to match what shipped.

- **Date:** 2026-06-28
- **Branch:** `claude/wonderful-hawking-fe368c` (forked from `develop` @ `2720b80`); merges cleanly into `develop`.
- **Verification:** `tsr generate && tsc -b` ✓ · `biome check src` ✓ (103 files) · `vitest` ✓ (64/64) · `vite build` ✓ · visual check on Dashboard / Services / Workflows ✓ (no console errors).

---

## 1. Token changes

The bundle's `manteion-theme.css` replaced the color block in [`src/globals.css`](../src/globals.css);
new tokens were also exposed in [`tailwind.config.ts`](../tailwind.config.ts). Variable **names are unchanged**
from the previous single-mode `globals.css`, so this was a re-skin, not a refactor — no component
*had* to change for the theme swap.

### 1a. Theme default flipped (the big one)
- **Before:** `:root` *was* the light theme (single mode); there was **no dark theme** and no `.dark` block.
- **After:** `:root` is now **DARK** (`color-scheme: dark`); the legacy **light** palette moved under
  `[data-theme="light"]`. The repo's original light values are **preserved** there (re-stated verbatim
  where they existed, plus the new tokens below).

### 1b. New tokens added (did not exist before)
Dark + light values for all of these were added (the app previously had none of them):

| Group | Tokens |
|---|---|
| Primary/destructive tints | `--primary-muted`, `--destructive-muted` |
| Borders | `--border-strong` |
| Status | `--status-unknown`, `--status-healthy-muted`, `--status-degraded-muted`, `--status-down-muted` |
| Charts | `--chart-1 … --chart-6` |
| Latency | `--latency-good`, `--latency-warn`, `--latency-bad` |
| Surfaces | `--surface-app`, `--surface-card`, `--surface-raised`, `--surface-sunken` |
| Text | `--text-body`, `--text-muted`, `--text-mono` |
| Sidebar | `--sidebar-muted` |
| Radius/layout | `--radius-full`, `--sidebar-width`, `--topbar-height`, `--row-height` |
| Type | `--font-sans`, `--font-mono` |

`tailwind.config.ts` was extended to surface all of these as utilities (`bg-chart-1`, `border-border-strong`,
`bg-status-healthy-muted`, `text-mono`, `rounded-full`, etc.). No existing token names or Tailwind keys changed.

### 1c. Existing values that changed
Only the **dark** values are new (there was no dark theme). The handful of **light** values that the
bundle re-tuned vs. the old `:root` are cosmetic equivalents (e.g. ring/sidebar) — no semantic renames.
**No variable was renamed or removed.**

### 1d. Fonts
`index.html` already loads Inter (400–700) and JetBrains Mono (400–600); no change needed.
⚠️ `tokens.json` declares `font/weight/extrabold = 800`, but Inter 800 is **not** loaded — add it to the
Google Fonts link if an extrabold weight is ever used (currently unused).

---

## 2. Prop-contract mismatches found

All component changes were **additive / backward-compatible**; every existing export and every prop
current call sites pass was preserved (tests stay green). The notable contract-vs-repo tensions:

| # | Component | Mismatch | Resolution shipped | Recommended DS action |
|---|---|---|---|---|
| 1 | **Select** | Contract names a *native* `<select>` `Select`; repo already exports `Select` as the Radix **compound**. | Shipped the native primitive as **`NativeSelect`** (`src/components/ui/native-select.tsx`); Radix `Select` untouched. | Rename the contract primitive to **`NativeSelect`**, or note that `Select` = the Radix compound. |
| 2 | **Tooltip** | Contract `Tooltip({content,side,children,style})` collides with the existing Radix **Root** export `Tooltip`. | Renamed Root → **`TooltipRoot`**; `Tooltip` is now an **overload** — Root passthrough when `content` is omitted (used by `grafana-button`), contract wrapper when `content` is set. Surface moved off `primary` onto `popover`. | Accept the overload, or split into `Tooltip` (wrapper) + `TooltipRoot` explicitly in the contract. |
| 3 | **Dialog** | Contract is flat-props (`open/onClose/title/description/footer/width`); repo is compound Radix. | `Dialog` is an **overload**: flat-props modal when any of `title/description/footer/width/onClose/style` is present; Radix Root passthrough otherwise. All compound exports kept. | Acknowledge both forms, or expose the flat form as `Modal`. |
| 4 | **Tabs** | Contract is data-driven (`tabs: TabItem[]`, underline bar); repo is compound Radix (pill list). | `Tabs` is an **overload**: underline bar when `tabs` is passed; Radix Root (pill) passthrough otherwise. | Same overload pattern; the contract's underline style is the new data-driven default. |
| 5 | **RadioGroup** | Contract is declarative (`options`); repo is compound (`RadioGroupItem`). | **Superset** — accepts `options` *or* children; `RadioGroupItem` still exported. | Fine as-is. |
| 6 | **Card** | Contract: flat by default, shadow only when `elevated`. Repo shadowed **every** card. | Default is now **flat**; `elevated` opts into shadow. **Visual change** to ~11 existing cards (no API break). | Confirm flat-by-default is desired (it is, per contract). |
| 7 | **Table** | Contract: 48px rows + **sticky uppercase** header; repo header was `h-10`, lowercase, non-sticky. | Applied as the new defaults + added `selected/clickable` (row) and `align/mono/muted` (cell). **Visual change** to existing tables (no API break). | Confirm the denser/sticky header default. |
| 8 | **PhaseHoverCard** ⚠️ | **Diverges.** Contract is *pure-presentational* with **camelCase** `PhaseSummary` (`frozenServices`, `appliedRules:{name,target}`, `metrics:{p99,rps,errorRate,p99Delta}` as **pre-formatted strings**, `durationMs`). Repo component **fetches** (`useQuery` + `refetchInterval`) and consumes the **snake_case** Zod API shape (`frozen_services`, `applied_rules:{rule_id,target_summary}`, `p99_us`/`error_rate`/`duration_ms` as **numbers**), with extra props (`experimentId`, `phaseId`, `statusHint`, `fallbackSummary`). | **Left as-is** — it is functional, token-clean, and already Radix-HoverCard-based. Not refactored to avoid regressing the live experiments page. | To fully conform: lift the fetch to the parent and adapt API→contract `PhaseSummary` (camelCase + pre-formatted), or have the contract document a thin fetching wrapper around a presentational core. **This is the only component that does not match its contract.** |
| 9 | **Button** | Contract variants `primary…`/sizes `sm(28) md(36) lg(40) icon`; repo used shadcn `default` + `sm(32)`. | Added `primary` (alias of `default`) and `md` (alias of `default` 36px); `default` kept. `sm` set to 28px. Added `leadingIcon`/`trailingIcon`. | Consider standardizing the contract on `primary` and dropping `default`. |
| 10 | **ObservabilityCard** | Contract `trend: number[]` + `color: SeriesColor`; repo used `TimeSeriesPoint[]` + `trendClassName` (raw palette). | **Superset**: accepts `number[] \| TimeSeriesPoint[]`; added `color` (→ `chart-*`); kept `trendClassName` deprecated; exported `MiniBars`. Dashboard migrated to `color`. | Drop `trendClassName` from the contract once call sites are on `color`. |

### Naming note
The contract's `core/Select` is the only name that could not be honored verbatim (collision #1).
Everything else matches the contract prop names exactly.

---

## 3. Code-side token-violation cleanup

Beyond the theme swap, 6 files used raw Tailwind palette classes (and now-dead `dark:` variants, since
`:root` is dark and no `.dark` class is toggled). All were remapped to semantic tokens:

- Category/enumerated chips (HTTP verbs, workflow node/step types) → `bg-chart-N/15 text-chart-N`.
- Success/warn/error semantics → `status-healthy` / `status-degraded` / `status-down` (+ `-muted` backings).
- Selected-row light-blue tint → `bg-primary/10`; hardcoded `#2563eb` → `var(--ring)` / `var(--primary)`.
- 17 dead `dark:` overrides removed.

Files: `service-badges.tsx`, `service-detail-panel.tsx`, `services-page.styles.ts`, `status-dot.tsx`
(`bg-zinc-400` → `bg-status-unknown`), `workflow-tree.tsx`, `routes/dashboard.tsx`, `routes/workflows/index.tsx`.

---

## 4. Components implemented (against `component-contracts.md`)

**Created (11):** `ui/checkbox`, `ui/textarea`, `ui/native-select`, `ui/code-block`, `ui/toast`,
`experiments/cache-box-indicator` (+ exported `CacheBoxInfo`), `experiments/service-row`,
`observability/grafana-button`, `observability/grafana-panel`, `observability/metric-range-selector`,
`observability/prometheus-error-banner`, `layout/sidebar-item`.

**Upgraded (additive, 17):** `ui/button`, `ui/input`, `ui/label`, `ui/radio-group`, `ui/card`, `ui/table`,
`ui/badge`, `ui/tooltip`, `ui/dialog`, `ui/tabs`, `status-dot` (+ exported `StatusKind`), `stat-card`,
`phase-pill`, `observability-card` (+ exported `MiniBars`), `rules/target-badge`.

Radix used for all interaction (HoverCard/Tooltip/Dialog/Checkbox/Switch/RadioGroup/Tabs); focus-visible
rings on `--ring`; 44px mobile tap targets on new tap-target primitives; JetBrains Mono for every
identifier / latency / code token.

---

## 5. Figma file + node ids created

**File:** `Manteion Design System` — key **`Nc4vyHeDxNpUhFTLxk8ao7`**
→ https://www.figma.com/design/Nc4vyHeDxNpUhFTLxk8ao7

### Variable collections (87 variables, scoped, with `var()` WEB code syntax)
| Collection | Id | Modes | Vars |
|---|---|---|---|
| **Color** | `VariableCollectionId:1:2` | Dark (`1:0`), Light (`1:1`) | 51 (mirrors `tokens.json` `dark`/`light`) |
| **Size** | `VariableCollectionId:2:2` | Value (`2:0`) | 22 (`space/*`, `radius/*`, `layout/*`, `control/*`) |
| **Typography** | `VariableCollectionId:2:25` | Value (`2:1`) | 14 (`font/family/*`, `font/size/*`, `font/weight/*`) |

### Pages + variant components (bound to the variables above)
| Page | Id | Component sets (node id) |
|---|---|---|
| Components — Core | `3:2` | Button `3:39` · Input `4:10` · Switch `5:6` · Checkbox `5:11` · Select (`NativeSelect`) `5:24` |
| Components — Surfaces & Data | `6:2` | Badge `6:20` · Card `6:27` · Table `7:2` |
| Components — Navigation | `8:2` | Tabs `8:3` · Dialog `8:13` |

Notes: Color tokens carry `FRAME_FILL/SHAPE_FILL` (fills), `TEXT_FILL` (text), or `STROKE_COLOR` (borders)
scopes; Size/Typography carry `CORNER_RADIUS`/`GAP`/`WIDTH_HEIGHT`/`FONT_*`. WEB code syntax uses the
real CSS var (`var(--status-healthy)`), so Dev Mode round-trips to the repo.

### Optional follow-ups (not done)
- Cover + Foundations doc pages (color swatches / type specimen).
- Code Connect mappings (Figma component → `src/components/**`).
- Tokens Studio JSON round-trip (`tokens.json` is ready to import as the same `dark`/`light`/`size`/`font` sets).
