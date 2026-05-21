# Code review — `rule-creation` branch (pre-merge into `main`)

**Verdict:** Request changes. Two blockers and two strongly-recommended fixes; rest are follow-ups.

**Scope:** Reviewed `origin/rule-creation` vs `origin/main` — 10 commits by Liam Manley (2026-04-25 → 2026-05-13), ~1300 LOC added across `src/components/rules/`, `src/components/rule-builder/`, `src/lib/api/rules.ts`, `src/routes/rules/`, plus 4 new test files and vite proxy config.

**Lens:** (1) Figma adherence per `docs/figma-changes.md` §1 (Rules v1.1 — OPA builder) + §3 (v1.0 panel, reverse-aligned 2026-05-12); (2) Code quality & correctness.

---

## Context

The branch implements the Rules page from two Figma references that the docs explicitly distinguish:

- **§1 — Rules v1.1 (OPA rego builder):** the *target* design — adds a nested AND/OR/NOT match builder with Builder/Rego view toggle, removes cache-box from the target, folds injection-point into match criteria.
- **§3 — Reverse-alignment from code (2026-05-12):** components retroactively created in Figma to match what the code had already shipped at that point, i.e. the v1.0 *panel* layout (`Rules — v1.0 (panel)`, screen node `2613:110`).

The branch's final commit `a12c057 add rule builder. remove cache box mode from editor` landed 2026-05-13, **after** the reverse-alignment doc was written, and pushes the editor toward v1.1 (Builder/Rego toggle, no cache-box, injection_point folded). Net result: the branch ships a **hybrid** — v1.0 two-panel list/editor screen layout + v1.1 MatchBuilder editor internals — and that hybrid is internally coherent.

---

## Merge blockers

### B1 · Orphaned full-page editor at `src/routes/rules/$ruleId.tsx` (~264 LOC duplicating the panel)

Two parallel implementations of the rule editor exist:

- [src/components/rules/rule-editor-panel.tsx](src/components/rules/rule-editor-panel.tsx) — used as the right-hand panel inside `RulesPage`.
- [src/routes/rules/$ruleId.tsx](src/routes/rules/$ruleId.tsx) — a full-page route component (`RuleEditorPage`).

Grep across the branch (excluding tests/docs/generated) confirms **no caller navigates to `/rules/$ruleId`**:
- Sidebar links to `/rules` only ([src/components/layout/sidebar.tsx:40](src/components/layout/sidebar.tsx:40)).
- `RulesPage` row click goes through local state (`openRule(id)` → `setSelectedId`), not router navigation.
- `$ruleId.tsx` itself only navigates *away* (`navigate({ to: "/rules" })` on save/delete, lines 136 & 144).
- No `<Link to="/rules/$ruleId">` or `navigate({ to: "/rules/$ruleId" })` anywhere outside the file itself.

The full-page route is reachable only by typing the URL directly. It's not in Figma — §3 only spec'd the panel screen `2613:110`. Worse, the two implementations have **subtly divergent logic**:

| Behavior | Panel | $ruleId page |
|---|---|---|
| Service field | `Select` with 9 hardcoded services | free-text `Input` |
| `matchCriteriaToAst` filters `_*` system labels | yes (e.g. `_target` is hidden) | **no** — `_target` leaks into the builder as a regular leaf |
| `astToMatchCriteria` | identical | identical |
| `RuleEditorForm`, `Field` helpers | own copies | own copies |
| Test push button | `disabled` | `alert(…not implemented…)` |
| Save behavior | calls `onSaved` (parent updates local state) | navigates to `/rules` |

**Risk:** as the editor evolves, fixes will land in one copy and not the other. The `_target` filter divergence is already a real behavior gap.

**Resolution is yours** — either delete `$ruleId.tsx` (matches Figma, deletes ~264 LOC + ~50 LOC of duplicated helpers) or delete the panel and have the list navigate to `/rules/$id`. Whichever you pick, the duplication itself is the blocker — both shouldn't ship together.

### B2 · Unsafe `match_ast as MatchNode` casts bypass schema validation

`Rule.match_ast` is typed as `z.unknown().optional()` in `src/types/api.ts` (that's the cast bridging api.ts and ast.ts flagged in the project memory). Three places cast it without runtime checks:

- [src/components/rules/rule-editor-panel.tsx:77](src/components/rules/rule-editor-panel.tsx:77) — `return rule.match_ast as MatchNode;`
- [src/routes/rules/$ruleId.tsx](src/routes/rules/$ruleId.tsx) — same pattern in the `initialAst` useMemo (line ~104).
- [src/lib/api/rules.ts](src/lib/api/rules.ts) line ~248 — `validateRego`'s response Zod parses `ast` as `z.unknown().optional()` then casts the entire return type via `as Promise<{ … ast?: MatchNode }>`.

If the backend (or a malformed cached value) returns an AST without a valid `kind`, `combinator`, or `op`, `RuleBuilder` will receive garbage, `compile()`/`parse()` in `src/lib/rego/` will crash or produce broken rego, and the user sees opaque save errors.

**Fix sketch:** export a Zod `MatchNodeSchema` (it already exists in `src/types/api.ts` per the conventions reference) and `safeParse` `rule.match_ast` in `initialAstFromRule` before returning it; fall back to `emptyRoot()` on failure. Apply the same to `validateRego`'s `ast` field. This eliminates the long-standing "MatchNode dual types" hazard at the same time.

---

## Strongly recommended before merge

### R1 · Form state stays stuck on the previous rule during cache-hot panel navigation

*Inferred from a read of [rule-editor-panel.tsx:88–98](src/components/rules/rule-editor-panel.tsx:88) — not empirically reproduced.*

`RuleEditorPanel` doesn't pass `key={ruleId}` to the inner `RuleEditorForm`. The form initializes all its fields with `useState(existing?.name ?? "")` etc., which only fires on mount. The outer panel gates the inner form on `!isNew && isLoading`:

```tsx
if (!isNew && isLoading) { return <div>Loading…</div>; }
return <RuleEditorForm … existing={existing} … />;
```

On a cold cache, `isLoading` flips true → form unmounts → fresh state. **On a warm react-query cache (e.g. you opened rule A, clicked rule B in a freshly-fetched list, both `useQuery` results resolve immediately from cache), `isLoading` never flips true for rule B → form doesn't unmount → state stays on rule A.** The standard remedy is `key={ruleId ?? "new"}` on the `RuleEditorForm` mount; the cost is one extra remount on navigation, which is what you want here anyway. Worth a quick manual test to confirm before/after.

### R2 · `TargetBadge` uses default Tailwind palette instead of design tokens

[src/components/rules/target-badge.tsx:7–9](src/components/rules/target-badge.tsx:7):

```tsx
inline:   "bg-secondary text-secondary-foreground",
network:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
resource: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
```

Confirmed against [tailwind.config.ts](tailwind.config.ts): the project's color extension only defines token-aliased names (`background`, `primary`, `secondary`, `status.healthy/degraded/down`, `phase-baseline/isolation/combined/failed/pending`, `sidebar.*`). `amber-100` and `purple-100` resolve to Tailwind's built-in palette, **not** the `faults-lab/tokens` collection (43 vars, single Default mode per `docs/figma-changes.md`). Cross-checked with `git grep` — `target-badge.tsx` is the **only** file in the branch using default-palette colors; every other component uses tokens.

Either add tokens for `target-network` / `target-resource` (and add the corresponding CSS vars in globals.css) or accept the divergence and document it. Severity is moderate, not critical — the design system genuinely doesn't have these tokens yet, so this is "deferred token work" not "broken contract." But it's the kind of thing that quietly spreads if not flagged at merge.

---

## Follow-ups (post-merge OK)

### F1 · `KNOWN_SERVICES` hardcoded in panel
[rule-editor-panel.tsx:22–32](src/components/rules/rule-editor-panel.tsx:22) — nine demo services baked in. The dashboard branch fetches SDK instances from the backend; this should follow suit so new services can be targeted without a code change. The other editor (`$ruleId.tsx`) uses a free-text input instead, which is the other extreme. Pick one approach when B1 is resolved.

### F2 · Dead API surface
[src/lib/api/rules.ts](src/lib/api/rules.ts):
- `testPushRule` — defined and tested, but no UI calls it. Panel's button is `disabled`; `$ruleId`'s button is an `alert()` placeholder (line ~249).
- `compileMatch` — defined, never called. UI compiles client-side via `src/lib/rego/compile.ts`. The function's own JSDoc says "server compile is authoritative," but nothing enforces this.
- `validateRego` — defined, never called.

Either wire these into the UI or delete them; carrying them as ghost API increases the surface for the unsafe-cast issue in B2.

### F3 · `Number(e.target.value)` for priority
[rule-editor-panel.tsx:228](src/components/rules/rule-editor-panel.tsx:228) and `$ruleId.tsx:177`. Clearing the input to retype briefly drops `priority` to `0` (Number("") === 0). Either store as string and parse on submit, or guard `Number.isNaN`.

### F4 · `LabelTagInput` is unused
[src/components/rules/label-tag-input.tsx](src/components/rules/label-tag-input.tsx) survives in the branch (and has a test) but no longer renders anywhere — superseded by `RuleBuilder`. The reverse-alignment manifest explicitly marks it `deprecated: true`. Delete it (and its test) unless there's a planned use.

### F5 · Lossy AST → MatchCriteria conversion is silent
`astToMatchCriteria` drops anything that isn't an `eq` leaf inside an `and` group ([rule-editor-panel.tsx:43–66](src/components/rules/rule-editor-panel.tsx:43)). If a user builds an `OR` or `not_eq` rule, then saves, the `match.labels` field will silently exclude those conditions. The `match_expr` rego still captures everything, but consumers of the older `match` API see only a partial view. Worth a UI warning when the AST contains nodes that don't round-trip — at minimum a code comment is there ("lossy") but nothing surfaces to the user.

### F6 · Search filters name + service only
[rules-page.tsx:48–52](src/components/rules/rules-page.tsx:48) — doesn't search labels, target, fault primitive, or rego content. Minor.

### F7 · `mode` hardcoded to `"inline"` in the panel
[rule-editor-panel.tsx:148](src/components/rules/rule-editor-panel.tsx:148) — panel always sets `mode: "inline" as const`. `$ruleId.tsx` preserves `initial?.mode`. So saving an existing `background`-mode rule via the panel would silently convert it to inline. Real bug if anyone hits it, but mock data shows only `rule-005` is `background` and the panel is brand-new — likely never exercised. Promote to blocker if the panel is the one that survives B1.

---

## Figma adherence summary

| Area | Figma reference | Branch state | Verdict |
|---|---|---|---|
| Two-panel list/editor screen | §3 `Rules — v1.0 (panel)` (2613:110) | Implemented in `rules-page.tsx` w/ 55%/45% split, table columns Rule·Service·Target·Prio·Status, empty state, search input | ✅ Matches |
| Cache-box target removed | §1 v1.1 | Removed — `RuleTarget = "inline" \| "network" \| "resource"`; no cache-box strings anywhere | ✅ Matches v1.1 (ahead of §3 doc) |
| Injection point folded into match | §1 v1.1 | Folded — `matchCriteriaToAst` emits it as a leaf with `field: "injection_point"` | ✅ Matches v1.1 |
| MatchBuilder (nested AND/OR/NOT tree) | §1 v1.1 | Implemented in `src/components/rule-builder/match-builder.tsx` | ✅ Matches v1.1 |
| Builder / Rego view toggle with round-trip | §1 v1.1 | Implemented in `src/components/rule-builder/index.tsx` — compile on every builder edit, parse on rego paste, custom-rego lockout banner when grammar escapes | ✅ Matches v1.1, well done |
| `LabelTagInput` retired | §3 manifest marks deprecated | Component still in tree, unused; should be deleted (F4) | ⚠️ Partial |
| `TargetBadge` (4 Figma variants) | §3 manifest lists cache-box·inline·network·resource | 3 variants; cache-box correctly dropped per v1.1 intent | ✅ Matches (cleaner than §3) |
| Full-page editor route `/rules/$ruleId` | **Not in Figma** | Exists, ~264 LOC, orphaned (B1) | ❌ Divergent |
| Field set & order in editor | §1: Name, Service, Fault, Priority, Enabled, MatchBuilder, Delete · Test push · Save | Both editors match the field set; minor order tweak (Enabled in header, Priority after MatchBuilder) | ✅ Matches |
| Design tokens | `faults-lab/tokens` (43 vars) | All except `TargetBadge.network/resource` (R2) | ⚠️ One file diverges |

**Bottom line:** the editor internals are squarely v1.1; the screen-level layout is v1.0 panel; the full-page route is unspec'd extra. Either drop the extra route or treat it as a deliberate addition and add it to Figma.

---

## What's done well

- **RuleBuilder round-trip is solid.** `handleAstChange` clears custom rego and re-emits; `handleRegoChange` re-parses, falls back to "custom" mode on grammar failure, surfaces the parse error to the user, and the builder view degrades cleanly with a "Clear custom rego" escape hatch. The state machine is tight.
- **react-query mutations invalidate correctly** — both `["rules"]` and `["rule", id]` keys on save, `["rules"]` on delete/toggle.
- **Cache-box cleanup is complete** — no lingering references in any code path (grep'd).
- **Tests are present and meaningful** — `__tests__/rule-editor-panel.test.tsx` covers happy-path save, error display, field rendering, button disabled states, with proper QueryClientProvider wrapping. Establishes a new component-test baseline (main only had `lib/rego/__tests__/roundtrip.test.ts`).
- **Vite dev proxy is clean** — `/api → http://localhost:8080` with `changeOrigin`, and `client.ts` was correctly updated from `DEFAULT_BASE = "http://localhost:9090"` to `""` to ride the proxy.
- **Routing config tweak is right** — `routeFileIgnorePattern: "(\\.test\\.(ts|tsx)$|-page\\.tsx$)"` keeps `*-page.tsx` components from becoming routes, which is the convention this branch establishes.
- **`_target` label hack is contained** — encoded in `match.labels._target`, filtered out of user-visible label rendering by the `_`-prefix convention; `deriveTarget` is the single source of truth for old rules without a typed fault_spec_id.

---

## Verification (for the author, after fixes)

1. **B1 + B2 + R1 land:** `pnpm test` should still pass; existing tests don't cover the navigation-stuck-state bug — manual repro: list at least 2 rules, click rule A, edit Name to "X", click rule B without saving, confirm form shows rule B's name (not "X"). After `key={ruleId}` fix, this should hold.
2. **B2 fix:** with `VITE_USE_MOCK=true`, edit one of the mock rules in `src/lib/api/rules.ts` to set `match_ast: { kind: "bogus" } as any` and confirm the editor falls back to `emptyRoot()` instead of crashing.
3. **R2 fix or accept:** if adding tokens, `inline`, `network`, `resource` should render with consistent intensity in both light and dark themes; verify against the existing `phase-*` and `status-*` token families.
4. **F2 wire-up:** if you keep `testPushRule`, the button should enable for existing rules, prompt for an SDK instance, and surface the trace; if not, delete it from `rules.ts` and the test.
5. **Final smoke:** `pnpm dev`, log into `/rules`, create one rule with a label condition, save, reload — confirm it survives. Toggle enable in the list. Edit it, switch to Rego tab, paste `count(input.foo) > 0` (intentionally outside builder grammar), confirm custom-rego lockout, clear it, confirm builder re-enables.

---

## Files I read while reviewing

- `git show origin/rule-creation:src/components/rules/{rule-editor-panel,rules-page,target-badge,label-tag-input}.tsx`
- `git show origin/rule-creation:src/components/rule-builder/index.tsx`
- `git show origin/rule-creation:src/routes/rules/{index,$ruleId}.tsx`
- `git show origin/rule-creation:src/lib/api/{rules,client,index}.ts`
- `git show origin/rule-creation:src/routes/rules/__tests__/rule-editor-panel.test.tsx`
- `git show origin/rule-creation:{vite.config.ts,tailwind.config.ts,pnpm-workspace.yaml}`
- `docs/figma-changes.md`, `docs/.figma-reverse-alignment-manifest.json`
- `git diff origin/main...origin/rule-creation --stat`, `git diff origin/main...origin/rule-creation -- src/lib/api/{client,index}.ts`
- `git grep` for `/rules/`, `bg-(amber|purple|…)-[0-9]+`, route-tree references
