# Figma changes — Rules v1.1 (OPA) + Experiments hover card

Handoff notes for two redesigns on the `MicroService Fault Testing Kit (Copy)`
file (`fileKey=S7q0O6YXDJ3MbcRqQdLr03`), `Screens` page. Both reuse the
existing `faults-lab/tokens` collection (43 vars, single "Default" mode) and
primitives on the `Components` page — no new tokens introduced.

Executed via `use_figma` MCP. Each section lists the node IDs created, the
script steps (inspect → create component(s) → compose in frame → verify),
and a screenshot caption from `get_screenshot`.

---

## 1. Rules — v1.1 (OPA rego builder)

### Why

The current Rules frame (node `2012:2`) exposes a single-row `Match labels`
chip list (`atropos.workflow=browse ×`, `tenant=demo ×`, `+ add`) with the
caption "Labels are AND-matched on incoming requests." Two problems:

1. The backend's `match.labels map[string]string` is AND-only, string-equality.
   This UI cannot express OR, regex, numeric comparisons, or `in` — all of
   which real operators need.
2. The Target radio includes `Use cache-box`, but the `Rule` data model has
   no cache-box field. Cache-box lives on `ExperimentRun.frozen_services`.
   The UI is promising something the backend doesn't back.

### What changed

A new frame `Rules — v1.1 (opa)` is placed to the right of the existing frame
at `x = frame.x + 1500`. The frame keeps the same layout language and the
same right-panel rule editor, with these changes:

1. **Cache-box Target removed.** The `Apply a fault | Use cache-box` segmented
   control collapses to a single Fault-primitive picker. Cache-box lives in
   the Experiment phase editor from now on (see
   `docs/API-NEEDED.md §C.1 resolution (b)`).
2. **Injection point removed as a standalone field.** It folds into the Match
   criteria builder as just another condition on `injection_point`.
3. **Match labels → Match criteria builder.** A nested AND/OR/NOT tree of
   conditions. Operators expand per field (string ops on `service`, numeric
   ops on `priority`, `matches`/regex on `header.*`, enum values on
   `injection_point`).
4. **View toggle `Builder | Rego`** above the tree. Rego tab is a
   monospace editor that round-trips into the builder where possible;
   grammar escapes to "custom rego" and disable the builder view.

### Components created on the `Components` page

- `MatchBuilder` (`COMPONENT`, ~660×300).
  - Header: view toggle (`Builder | Rego`), small helper text.
  - Body: nested group rows, each with:
    - Combinator pill `AND | OR | NOT` (segmented).
    - Row actions: `+ condition`, `+ group`, trash.
    - Leaf row: field select (mono), operator select, value input
      (or comma-separated for `in`).
- `RuleEditor — v1.1` (`COMPONENT`, ~440×720).
  - Name, Service, Fault primitive picker, Priority, Enabled switch.
  - `MatchBuilder` instance.
  - Delete · Test push · Save actions.

### Frame composition on the `Screens` page

- Duplicate `Rules` (`2012:2`) → `Rules — v1.1 (opa)` at `x = 2940` (+1500).
- Replace the right-panel editor content with a `RuleEditor — v1.1` instance.
- Add a Figma annotation (blue arrow) from the `MatchBuilder` in the
  instance to a note at the top of the frame: *"Builder compiles to OPA
  rego (`POST /api/v1/rules/compile-match`). Paste tab for dev convenience.
  See `docs/API-NEEDED.md §C.2`."*
- Keep the left-panel rule list unchanged.

### Script (`use_figma`) — rough outline

1. **Inspect** — find the `Components` and `Screens` pages, the `Rules` frame
   id, and the existing primitive component ids (`Card`, `Input/default`,
   `Button/primary`, `Button/ghost`, `Badge/default`).
2. **Create** `MatchBuilder` on the Components page. Compose with auto-layout:
   header, root group container, two leaf rows indented, one nested OR group
   for demo content.
3. **Create** `RuleEditor — v1.1` on the Components page. Compose from the
   existing `Card` + `Input/default` + `Label` + a `MatchBuilder` instance.
4. **Duplicate** the `Rules` frame (`2012:2`) and rename to `Rules — v1.1 (opa)`,
   positioned `x += 1500`.
5. **Replace** the right-panel editor content with an instance of
   `RuleEditor — v1.1`.
6. **Annotate** with a blue arrow + note frame pointing at the `MatchBuilder`.
7. **Verify** `get_screenshot` shows the new tree shape.

---

## 2. Experiments list — hoverable phase pills

### Why

The current `Experiments` frame (`2085:2`) shows a `PHASES` column of coloured
pills per row but no hover affordance. An operator can't tell what any pill
means without opening the experiment detail — even though all the data the
tooltip wants (frozen services, rules applied, live p99, error rate) already
exists on the backend as a denormalised phase summary.

### What changed

- Add a shadcn-style `HoverCard` primitive to the `Components` page (not
  currently there).
- Add a `PhaseHoverCard` component with 3 variants via `combineAsVariants`:
  - `state=ongoing` (live metrics strip, polling tick)
  - `state=completed` (delta vs baseline)
  - `state=pending` ("Not run yet.")
- On the `Experiments` frame: attach a single demo hover card instance at the
  right of the frame (offset `x += 1500`) with a blue callout arrow from a
  phase pill in the first row. This makes the relationship visible in static
  mockups.

### Components created on the `Components` page

- `HoverCard/default` (`COMPONENT`, ~380×auto). Reuses `Card` as base with a
  tight 12px padding and a 6px radius.
- `PhaseHoverCard` (`COMPONENT_SET`, ~380×260, three variants).
  - Header row: phase name (mono) · status badge (reuse `Badge/status-*`).
  - Sub-section: "Services frozen" (list, mono).
  - Sub-section: "Rules applied" (list).
  - Metrics strip: 3-column mono metrics (p99 · RPS · errors). Present on
    `ongoing` + `completed`, hidden on `pending`.
  - Footer: `Open experiment →` link.

### Script (`use_figma`) — rough outline

1. **Inspect** — find the `Experiments` frame id and the primitive component
   ids used by the hover card (`Card`, `Badge/status-healthy`,
   `Badge/status-down`, `Badge/default`).
2. **Create** `HoverCard/default` on the Components page.
3. **Create** `PhaseHoverCard` with 3 variants via `combineAsVariants`.
4. **Compose** a demo instance next to the existing `Experiments` frame with
   a blue callout arrow from a first-row phase pill.
5. **Verify** `get_screenshot` covers both the list frame and the hover card
   instance.

### Optional bonus

Also add a hover card on the `STATUS` column pill (experiment-level
summary — hypothesis, started, runs count). Reuse `PhaseHoverCard` in the
`completed` variant but swap the sub-section content. Ship only if time.

---

## 3. What was not touched

- The `faults-lab/tokens` variable collection — still 43 variables, single
  "Default" mode. No new tokens added.
- Primitives on the `Components` page — Buttons, Input/default, StatCard,
  Card, SidebarItem, GrafanaPanel, etc. — unchanged.
- The `Archive (v0)` page — kept as-is per UI-DESIGN.md §10; deletion deferred
  until the v1 redesign is fully adopted.
- Dark mode — still deferred to Phase 2 (UI-DESIGN.md §5).
