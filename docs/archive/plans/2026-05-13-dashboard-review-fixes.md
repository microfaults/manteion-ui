# Dashboard Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all agreed review items from the `feat/manteion-ui-dashboard-prometheus-services` branch before merging to main.

**Architecture:** Pure refactoring — no new features. Extract helpers from dashboard.tsx into focused modules, fix a broken useMemo, unify port config, restore .env.example, and add missing docs/aria.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, Biome

---

### Task 1: Fix broken `useMemo` dependency on `enabledRulesList`

**Files:**
- Modify: `src/routes/dashboard.tsx:77-79`

- [ ] **Step 1: Fix the useMemo**

Replace lines 77-79 in `src/routes/dashboard.tsx`:

```tsx
// BEFORE (broken — .filter() returns a new array each render, memo never caches)
const enabledRulesList = rules.data?.filter((r) => r.enabled) ?? [];
const activeFaults = enabledRulesList.length;
const faultBuckets = useMemo(() => bucketFaultRules(enabledRulesList), [enabledRulesList]);
```

```tsx
// AFTER
const enabledRulesList = useMemo(
  () => rules.data?.filter((r) => r.enabled) ?? [],
  [rules.data],
);
const activeFaults = enabledRulesList.length;
const faultBuckets = useMemo(() => bucketFaultRules(enabledRulesList), [enabledRulesList]);
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/dashboard.tsx
git commit -m "fix: wrap enabledRulesList in useMemo keyed on rules.data"
```

---

### Task 2: Fix timeout error detection in `prometheusErrorMessage`

**Files:**
- Modify: `src/routes/dashboard.tsx:587-591`

- [ ] **Step 1: Add TimeoutError branch**

Replace the `prometheusErrorMessage` function:

```tsx
// BEFORE
function prometheusErrorMessage(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError")
    return "request timed out or was cancelled";
  if (err instanceof Error) return err.message;
  return String(err);
}
```

```tsx
// AFTER
function prometheusErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "TimeoutError")
    return "request timed out";
  if (err instanceof Error && err.name === "AbortError")
    return "query was cancelled";
  if (err instanceof Error) return err.message;
  return String(err);
}
```

- [ ] **Step 2: Drop the redundant null check on line 72**

Replace:
```tsx
instances.data?.filter((i) => i.status == null || i.status === undefined).length ?? 0;
```
With:
```tsx
instances.data?.filter((i) => i.status == null).length ?? 0;
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/dashboard.tsx
git commit -m "fix: detect TimeoutError from AbortSignal.timeout(), drop redundant null check"
```

---

### Task 3: Extract `ObservabilityCard` and `MiniBars` to their own file

**Files:**
- Create: `src/components/observability-card.tsx`
- Modify: `src/routes/dashboard.tsx` (remove lines 398-465, update imports)

- [ ] **Step 1: Create `src/components/observability-card.tsx`**

```tsx
import type { TimeSeriesPoint } from "@/lib/prometheus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ObservabilityCard({
  title,
  subtitle,
  value,
  valueHint,
  trend,
  trendClassName,
  grafanaUrl,
}: {
  title: string;
  subtitle: string;
  value: string;
  valueHint?: string;
  trend: TimeSeriesPoint[] | undefined;
  trendClassName: string;
  grafanaUrl?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          {grafanaUrl ? (
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noreferrer"
              title="Grafana is opened at VITE_GRAFANA_URL from your browser. If the connection fails, run kubectl port-forward svc/grafana 3001:3000 (or match your .env.local port)."
              className="text-xs font-normal text-primary hover:underline"
            >
              Open in Grafana ↗
            </a>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="text-3xl font-semibold tabular-nums">{value}</div>
          {valueHint ? <span className="text-sm text-muted-foreground">{valueHint}</span> : null}
        </div>
        <MiniBars trend={trend} trendClassName={trendClassName} />
      </CardContent>
    </Card>
  );
}

function MiniBars({
  trend,
  trendClassName,
}: { trend: TimeSeriesPoint[] | undefined; trendClassName: string }) {
  if (!trend?.length) {
    return <div className="mt-3 h-20 rounded bg-muted/40" />;
  }
  const points = trend.slice(-24);
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="mt-3 flex h-20 items-end gap-1">
      {points.map((p, idx) => (
        <div
          key={`${p.ts}-${idx}`}
          className={`w-2 rounded-sm ${trendClassName}`}
          style={{ height: `${Math.max((p.value / max) * 100, 5)}%` }}
        />
      ))}
    </div>
  );
}
```

Note: MiniBars key changed from `p.ts` to `${p.ts}-${idx}` to avoid potential duplicate key collisions from Prometheus range queries.

- [ ] **Step 2: Remove from dashboard.tsx and add import**

In `src/routes/dashboard.tsx`:
- Remove the `ObservabilityCard` function (lines 398-443) and the `MiniBars` function (lines 445-465).
- Add to imports: `import { ObservabilityCard } from "@/components/observability-card";`
- Remove `TimeSeriesPoint` from the `@/lib/prometheus` import (if no other usage remains — check first; `trendQualifier` still uses it, so keep the import).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/observability-card.tsx src/routes/dashboard.tsx
git commit -m "refactor: extract ObservabilityCard + MiniBars to own file"
```

---

### Task 4: Extract service-panel helpers to `src/lib/service-panel.ts`

**Files:**
- Create: `src/lib/service-panel.ts`
- Modify: `src/routes/dashboard.tsx` (remove lines 559-735, update imports)

- [ ] **Step 1: Create `src/lib/service-panel.ts`**

Move these items from `dashboard.tsx` into the new file verbatim:
- `ServicePanelRow` type (lines 559-567)
- `sdkInstanceToDotStatus` function (lines 594-599)
- `worseDotStatus` function (lines 601-607)
- `buildServicesPanelRows` function (lines 609-666)
- `compactServiceId` function (lines 668-673)
- `stripTrailingServiceToken` function (lines 675-680)
- `promServiceNameMatchesSdk` function (lines 686-699)
- `lookupCallRate` function (lines 701-716)
- `formatServiceRateHint` function (lines 718-731)
- `displayServiceName` function (lines 733-736)

Add the needed import at the top:

```tsx
import type { SDKInstance } from "@/types/api";
```

Export `ServicePanelRow`, `buildServicesPanelRows`, and `displayServiceName` (the three things dashboard.tsx actually references). The rest are internal.

- [ ] **Step 2: Update dashboard.tsx imports**

Remove the moved functions/types from `dashboard.tsx`. Add:

```tsx
import { buildServicesPanelRows, displayServiceName } from "@/lib/service-panel";
```

Remove the `SDKInstance` import from `@/types/api` in dashboard.tsx if it's no longer used directly (check — `sdkInstancesFooter` still takes `SDKInstance[] | undefined`, so keep it).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/service-panel.ts src/routes/dashboard.tsx
git commit -m "refactor: extract service-panel helpers from dashboard"
```

---

### Task 5: Extract fault categorization to `src/lib/fault-categorize.ts`

**Files:**
- Create: `src/lib/fault-categorize.ts`
- Modify: `src/routes/dashboard.tsx` (remove lines 528-557, update imports)

- [ ] **Step 1: Create `src/lib/fault-categorize.ts`**

Move these from `dashboard.tsx`:
- `bucketFaultRules` function (lines 528-543)
- `categorizeFaultRule` function (lines 545-557)

```tsx
import type { Rule } from "@/types/api";

export function bucketFaultRules(rules: Rule[]): {
  inline: number;
  network: number;
  cacheBox: number;
} {
  let inline = 0;
  let network = 0;
  let cacheBox = 0;
  for (const r of rules) {
    const cat = categorizeFaultRule(r);
    if (cat === "cache-box") cacheBox++;
    else if (cat === "network") network++;
    else inline++;
  }
  return { inline, network, cacheBox };
}

function categorizeFaultRule(r: Rule): "inline" | "network" | "cache-box" {
  const ip = (r.match?.injection_point ?? "").toLowerCase();
  const blob =
    ip +
    JSON.stringify(r.match?.labels ?? {}).toLowerCase() +
    r.name.toLowerCase() +
    (r.service ?? "").toLowerCase();
  if (blob.includes("cache") || blob.includes("replay") || blob.includes("freeze"))
    return "cache-box";
  if (blob.includes("network") || blob.includes("egress") || blob.includes("timeout"))
    return "network";
  return "inline";
}
```

Export only `bucketFaultRules`.

- [ ] **Step 2: Update dashboard.tsx**

Remove the two functions. Add:

```tsx
import { bucketFaultRules } from "@/lib/fault-categorize";
```

Remove the `Rule` import from `@/types/api` in dashboard.tsx if no longer used directly (check — it's still used by `enabledRulesList` type inference, but TypeScript infers it, so the explicit import can go if not referenced).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/fault-categorize.ts src/routes/dashboard.tsx
git commit -m "refactor: extract fault categorization helpers from dashboard"
```

---

### Task 6: Add aria-labels to range-selector buttons

**Files:**
- Modify: `src/routes/dashboard.tsx:162-189`

- [ ] **Step 1: Add aria-label to range buttons**

In the range button `.map()` (around line 163), add an `aria-label`:

```tsx
<button
  key={m}
  type="button"
  aria-label={`Show last ${m === 60 ? "1 hour" : `${m} minutes`}`}
  onClick={() => {
```

For the "live" button (around line 179), add:

```tsx
<button
  type="button"
  aria-label="Enable live auto-refresh (8s interval)"
  onClick={() => setChartsLive(true)}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/dashboard.tsx
git commit -m "a11y: add aria-labels to metric range selector buttons"
```

---

### Task 7: Unify manteion-go port to 9090

**Files:**
- Modify: `vite.config.ts:69`

- [ ] **Step 1: Change Vite proxy target**

In `vite.config.ts`, change the `/api` proxy target from `8080` to `9090`:

```tsx
// BEFORE
"/api": {
  target: "http://localhost:8080",
```

```tsx
// AFTER
"/api": {
  target: "http://localhost:9090",
```

Port inventory (no conflicts):
- `5173` — Vite dev server
- `9090` — manteion-go (kubectl port-forward)
- `9091` — Prometheus (kubectl port-forward from container 9090)
- `3001` — Grafana (kubectl port-forward from container 3000)

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "fix: unify manteion-go proxy target to port 9090"
```

---

### Task 8: Restore `.env.example` and update README quickstart

**Files:**
- Create: `.env.example`
- Modify: `README.md:14-17,33-34,41-46`

- [ ] **Step 1: Create `.env.example`**

```sh
# manteion-ui environment — copy to .env.local and adjust for your setup.
# All VITE_ vars are baked into the client bundle at build time — no secrets.

# manteion-go API (kubectl port-forward svc/manteion-go 9090:9090)
VITE_MANTEION_URL=http://localhost:9090

# Active kustomize overlay shown in sidebar
VITE_DEFAULT_ENV=online-boutique

# Grafana dashboard links (kubectl port-forward svc/grafana 3001:3000)
# Leave blank to hide Grafana links.
#VITE_GRAFANA_URL=http://localhost:3001

# Prometheus API for live observability cards (kubectl port-forward svc/prometheus 9091:9090)
# In dev, set to http://localhost:5173/prometheus to use the Vite proxy.
VITE_PROMETHEUS_URL=http://localhost:5173/prometheus
```

- [ ] **Step 2: Update README quickstart**

Replace lines 14-17:

```
# from the repo root
cd manteion-ui
corepack enable pnpm       # one-time, on systems without pnpm
pnpm install
cp .env.example .env.local # edit VITE_MANTEION_URL to your manteion-go
pnpm dev                   # http://localhost:5173
```

With:

```
# from the repo root
cd manteion-ui
corepack enable pnpm       # one-time, on systems without pnpm
pnpm install
cp .env.example .env.local # then adjust URLs to match your port-forwards
source .env.local           # optional — makes vars available to other tools in this shell
pnpm dev                   # http://localhost:5173
```

Replace lines 33-34 (the second `cp .env.example` block):

```
cp .env.example .env.local
```

With:

```
cp .env.example .env.local  # then adjust URLs
```

- [ ] **Step 3: Add `VITE_PROMETHEUS_URL` to the README env vars table**

After the `VITE_GRAFANA_URL` row (line 45), add:

```
| `VITE_PROMETHEUS_URL` | no | `http://localhost:9091` | Prometheus HTTP API base URL. Dashboard observability cards query this for live RPS, p99, error rate, and cache-hit metrics. In dev, set to `http://localhost:5173/prometheus` to use the Vite proxy (avoids CORS). |
```

- [ ] **Step 4: Verify file exists and README parses**

Run: `cat .env.example && head -50 README.md`

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md
git commit -m "docs: restore .env.example with VITE_PROMETHEUS_URL, fix README quickstart"
```

---

### Task 9: Final verification

- [ ] **Step 1: Type check**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 2: Lint**

Run: `pnpm biome check src/`
Expected: no errors (or only pre-existing ones)

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: all passing

- [ ] **Step 4: Verify dashboard.tsx line count**

Run: `wc -l src/routes/dashboard.tsx`
Expected: ~420 lines (down from ~750)

- [ ] **Step 5: Dev smoke test**

Run: `pnpm dev`
Open `http://localhost:5173/dashboard` — verify:
- StatCards render
- ObservabilityCards render (or show error banner if no Prometheus)
- Services list renders
- Range selector buttons are clickable
- No console errors
