# Services page — design-draft implementation

## Context

`/services` currently renders a flat list of SDK instances with no detail view; clicking a row navigates to a placeholder route (`src/routes/services/$instanceId.tsx` → `NotWiredYet`). The new design draft (`docs/design-drafts/services-design-draft.html`) calls for a **two-pane layout**: a left-side table grouped by service (collapsible) and a right-side detail panel showing instance metadata, active rules, recent runs, and primary actions (kill switch, cache-box mode). The list endpoint is shipped (`GET /api/v1/sdk/instances`); the detail (`GET /api/v1/sdk/instances/{id}`) and kill-switch (`POST .../kill-switch`) endpoints are new and need wiring. This change replaces the placeholder detail route with an in-page panel that matches the Rules-page pattern.

The existing app shell (sidebar, topbar, routing) is unchanged. Only the page contents at `/services` are reworked.

## Approach

Mirror the Rules-page architecture: a thin route file delegates to a `ServicesPage` component under `src/components/services/`. The component holds `selectedInstanceId` state, drives the left table and right panel from React Query, and reuses existing UI primitives. The detail panel queries the detail endpoint when an instance is selected; rule names and run summaries are joined client-side from existing list queries (`rulesApi.listRules`, runs list). Rule toggling uses `rulesApi.updateRule` exactly as the Rules page does.

## Files to change

**New**
- `src/components/services/services-page.tsx` — page component (grouped table + right panel + selection state). Pattern: `src/components/rules/rules-page.tsx`.
- `src/components/services/service-detail-panel.tsx` — right pane: header (service name, instance id, status badge), metadata grid, active-rules list, recent-runs list, footer with kill-switch + cache-box buttons. Pattern: `src/components/rules/rule-editor-panel.tsx`.
- `src/components/services/services-page.styles.ts` — small style helpers if needed (mirrors `rules-page.styles.ts`).

**Modify**
- `src/routes/services/index.tsx` — replace inline implementation with `<ServicesPage />` delegation (mirrors `src/routes/rules/index.tsx`).
- `src/lib/api/services.ts` — add `getSDKInstance(id)` calling `GET /api/v1/sdk/instances/{id}`; change `killSwitch` to return the response envelope `{disabled_rule_ids: string[], at: timestamp}` instead of `void`.
- `src/types/api.ts` — extend with `SDKInstanceDetailSchema` (extends `SDKInstanceSchema` with `last_error?`, `last_rule_version_acked?`, `active_rule_ids: string[]`, `recent_run_ids: string[]`) and a `KillSwitchResultSchema`.

**Remove / repurpose**
- `src/routes/services/$instanceId.tsx` — delete (panel replaces it). If deep-linkable detail URLs are wanted later, can be reintroduced as a redirect. Out of scope here.

## Implementation notes

- **Grouping**: build `Record<serviceName, SDKInstance[]>` with `useMemo`. Render a `<TableRow>` group header per service with a chevron and instance count; collapsed state in a `Record<string, boolean>` via `useState`. Use existing `Table*` components from `src/components/ui/table.tsx` — no new table primitive.
- **Status cell**: reuse `StatusDot` from `src/components/status-dot.tsx` (already used by current page) with the alive/stale/dead → healthy/degraded/down mapping.
- **Detail fetch**: `useQuery({ queryKey: ["sdk-instance", id], queryFn: () => servicesApi.getSDKInstance(id), enabled: !!id })`.
- **Rule resolution**: query `["rules"]` via `rulesApi.listRules` (shared cache with Rules page). Filter by `active_rule_ids`. Type badges derive from `rule.action.type` (`fault_spec` / `fault_composition` / `cachebox`) and `rule.mode`.
- **Run resolution**: use the existing runs list endpoint if available — if absent, render IDs only and leave a TODO; the design-draft spec lists `recent_run_ids` so this is acceptable for v1.
- **Kill switch**: `useMutation` calling `servicesApi.killSwitch(id)`, on success invalidate `["rules"]` and `["sdk-instance", id]`. Confirm dialog before firing.
- **Cache-box button**: design draft references `POST /api/v1/rules/enable-cachebox` which doesn't appear in `api-needed.md`. Render the button but wire to a TODO/disabled state with a tooltip — don't invent an endpoint.
- **Lag badge**: derive `lag = currentRuleVersion - last_rule_version_acked` if both are available; otherwise omit. The current SDK list endpoint doesn't expose current rule version — render lag only inside the detail panel.
- **Refetch**: keep the 10s `refetchInterval` from the existing list. Detail panel uses the same interval when an instance is selected.
- **Styling**: Tailwind + shadcn primitives only. No new CSS files; use existing tokens (`bg-muted`, `text-muted-foreground`, `border-border`, status-* vars in `globals.css`).

## Verification

1. Run the dev server, open `/services`.
2. Confirm rows group by service with collapsible headers; status dots render alive/stale/dead.
3. Click a row → right panel populates with instance metadata, active rules, recent runs.
4. Toggle a rule's enabled state → confirm it also updates on the Rules page (shared query key).
5. Click Kill switch → confirm dialog, then verify all that instance's rules become disabled and the panel refreshes.
6. Type-check: `pnpm tsc --noEmit` (or repo equivalent).
7. If tests exist for the services page, add a render test that mocks the queries (mirror `src/components/rules/__tests__/`).