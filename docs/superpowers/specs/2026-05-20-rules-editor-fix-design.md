# Rules editor fix — design spec

**Date:** 2026-05-20
**Status:** Draft — awaiting user review
**Author:** Claude (Opus 4.7) + pronei
**Touches:** `manteion-ui` (this repo) + `manteion-go` (sibling, on VM1)

---

## 1. Problem

The `/rules` page in `manteion-ui` cannot create a rule against the live
manteion-go backend. Reproduction:

```sh
$ curl -X POST http://10.43.151.153:8080/api/v1/rules -d '{...what the UI sends}'
HTTP 400 { "error": "rule action: invalid type \"\"" }
```

Root cause: the UI was built against the v1.1 Figma redesign
([`docs/design/figma-changes.md §1`](../../design/figma-changes.md)) which
assumed an OPA-rego match builder and a flat rule shape. The actual backend
contract is different.

User-reported findings (in their own words):

1. No action type input → rule creation fails.
2. "Fault primitive" is just a text box (no catalog).
3. Should add mock rules and test the end-to-end flow.
4. Styling lives inline with JSX — refactor it out, keep it consistent.
5. `KNOWN_FIELDS` is hardcoded — redesign to allow matching arbitrary JSON
   body fields, accepting the validation tradeoff.
6. `Priority` is opaque — is it a percentage of traffic?

This spec addresses all six.

---

## 2. Backend contract (ground truth)

Read from `/home/faults-lab/manteion-go/internal/model/rule.go` on VM1.

```jsonc
// POST /api/v1/rules body shape
{
  "name": "...",
  "service": "...",                       // must exist as registered SDK service
  "enabled": true,
  "priority": 50,                         // int; ORDER BY priority DESC at eval
  "mode": "inline" | "background",
  "start_policy": "deduplicate_by_rule"   // optional; default "deduplicate_by_rule"
                | "always_start",
  "match": {
    "injection_point": ""                 // optional; "" = any
                     | "ingress" | "egress" | "transient" | "custom",
    "labels": { "k": "v" }                // AND-only, string EQUALITY only
  },
  "action": {                             // exactly one of the three id/cachebox fields
    "type": "fault_spec" | "fault_composition" | "cachebox",
    "fault_spec_id": "...",               // when type=fault_spec; FK → fault_specs
    "fault_composition_id": "...",        // when type=fault_composition
    "cachebox": { "mode": "...",
                  "key_strategy": "..." } // when type=cachebox
  }
}
```

**Anything outside this shape is silently dropped.** I verified empirically:
`match_ast` and `match_expr` POST without error but are not persisted, returned
on GET, or evaluated by the SDK.

The `priority` field is rule **evaluation order**, not a sampling rate:
`SELECT … FROM rules ORDER BY priority DESC` in
`/home/faults-lab/manteion-go/internal/store/rule_repo.go:135`, and
`sorted[i].Priority > sorted[j].Priority` in `atropos-go/compiled_rule.go:135`.

---

## 3. Goals & non-goals

### Goals

- Make `/rules` create / read / update / delete work end-to-end against
  manteion-go on VM1.
- Keep the v1.1 Figma match builder (AST + Rego tabs) — the user chose
  **option C** (backend coordination over UI simplification).
- Surface backend semantics honestly: action type, mode, start_policy,
  injection_point, priority meaning — all must be visible/editable.
- Fix `GET /api/v1/faults/specs` returning 500 on empty.
- Move the field catalog out of code into a JSON config so non-devs can
  extend it.
- Relabel `Priority` and add helper text — no semantic change.
- Extract repeated Tailwind blocks into `cva` variants / `styles.ts` modules
  following the existing shadcn convention. **No new CSS files.**
- Keep the mock layer (`VITE_USE_MOCK=true`) in sync with the corrected
  schema.

### Non-goals

- Per-service JSON body schema introspection (deferred; #5 settles for a
  JSON-file catalog).
- Adding a sample-rate / probability field to rules (would require new
  backend column; not in this branch).
- Implementing SDK-side rego evaluation. Backend will store
  `match_expr` as opaque text; the SDK continues to evaluate
  `match.labels` + `match.injection_point` only.
- Touching the Experiments page or any other route.

---

## 4. Design — per finding

### F1 · Action type input + correct wire format

**Editor adds three new fields above the current Service field:**

1. **Action type** — Select. Options: `fault_spec` (default), `fault_composition`,
   `cachebox`. Drives which sub-fields render below.
2. **Mode** — Select. Options: `inline` (default), `background`.
3. **Start policy** — Select. Options: `deduplicate_by_rule` (default),
   `always_start`. Collapsed under an "Advanced" disclosure by default.

**Action-type-conditional sub-field:**

- `type=fault_spec` → "Fault spec" picker (see F2).
- `type=fault_composition` → "Fault composition" picker (later sibling of F2;
  same Select-with-fallback pattern, hits `GET /api/v1/faults/compositions`).
- `type=cachebox` → two Selects: `mode` (`passthrough` | `replay` |
  `replay_with_delay`) and `key_strategy` (`exact` | `exact_with_host` |
  `exact_with_body`).

**The `RuleInput` TS shape is restructured** in `src/lib/api/rules.ts`:

```ts
// before
interface RuleInput {
  fault_spec_id?: string;
  fault_composition_id?: string;
  mode: "inline" | "background";
  // ...
}
// after
type Action =
  | { type: "fault_spec";        fault_spec_id: string }
  | { type: "fault_composition"; fault_composition_id: string }
  | { type: "cachebox";          cachebox: { mode: string; key_strategy: string } };

interface RuleInput {
  name: string;
  service: string;
  enabled: boolean;
  priority: number;
  mode: "inline" | "background";
  start_policy?: "deduplicate_by_rule" | "always_start";
  match: {
    injection_point?: "" | "ingress" | "egress" | "transient" | "custom";
    labels?: Record<string, string>;
  };
  action: Action;
  // NEW — backend will store after F1b lands; sent today as a no-op for the
  // SDK eval path. Kept in sync with `match` projection.
  match_expr?: string;
  match_ast?: MatchNode;
}
```

`createRule` / `updateRule` serialize the discriminated `action` envelope.
Backend ignores `match_expr` / `match_ast` until F1b ships in manteion-go.

#### F1b · `match_expr` column in manteion-go (backend coordination)

Backend changes on `/home/faults-lab/manteion-go`:

1. Migration: `ALTER TABLE rules ADD COLUMN match_expr TEXT NOT NULL DEFAULT ''`.
2. `model.Rule`: add `MatchExpr string \`json:"match_expr,omitempty"\``.
3. `store/rule_repo.go` INSERT / UPDATE / SELECT: include `match_expr` column.
4. `ruleconv`: pass `MatchExpr` into `CompiledRule` (opaque to SDK for now).
5. **No validation** — accept any text; this is a forward-compatibility column.

**SDK-side evaluation of rego is out of scope** for this spec — backend just
stores and returns the text. Rich match builder UI remains a preview surface
for `match` (labels{}) until SDK rego support lands.

### F2 · Fault primitive picker

`src/components/rules/rule-editor-panel.tsx` replaces the free-text Input with
a `<FaultSpecPicker>`:

- Issues `useQuery(['fault-specs'], faultsApi.listFaultSpecs)`.
- **Success** with non-empty list → Combobox of `{label: "<category>:<fault_type> · <name>", value: spec.id}`. Filter as you type.
- **Success** empty list → text input with helper "no fault specs defined yet — `POST /api/v1/faults/specs` first".
- **Error** (5xx) → text input with helper "couldn't load fault catalog
  (`<error>`); enter ID manually". Retry button.

Same component pattern for the Composition picker.

#### F2b · Faults endpoint 500 fix

Backend handler `/home/faults-lab/manteion-go/internal/api/fault_handler.go`
returns 500 on empty list. Patch to return `[]` (matches `handleListRules`
pattern). Add a regression test in `fault_handler_test.go`.

### F3 · Mock rules + end-to-end test

Existing mock layer (`VITE_USE_MOCK=true`) already returns 8 fixtures and
supports CRUD. Two changes:

- Update mock fixtures to match new schema (nested `action`, explicit
  `start_policy`). Existing fixtures already have `fault_spec_id` and `mode`
  flat — restructure them.
- Add 3 fixture rules covering each action type
  (`fault_spec`, `fault_composition`, `cachebox`).
- Add 3 fixture FaultSpecs in `src/lib/api/faults.ts` for the picker to bind
  to when in mock mode.

**End-to-end test plan** (manual, gated on F1+F1b+F2+F2b shipping):

1. Mock mode: create / edit / delete rules in the UI; verify list updates.
2. Live mode: open VM1 SSH tunnel; create a fault_spec via API
   (`POST /api/v1/faults/specs`); create a rule via UI; verify it appears in
   `GET /api/v1/rules`.
3. Verify `match_expr` round-trips through the backend (write rego in UI,
   reload page, confirm it re-parses).

### F4 · Styling refactor

Apply the existing shadcn convention: `cva` for variants, `cn()` for
conditional merges, extracted constants for repeated structural blocks. **No
new `.css` files** (would diverge from `src/components/ui/*`).

Per-file plan:

- `rule-editor-panel.tsx` (currently 297 LOC): extract the field-row layout
  (`Field` component already exists) and the panel-chrome class strings into
  named `cva` recipes in a sibling `rule-editor.styles.ts`.
- `rules-page.tsx`: extract table-row and search-bar class strings.
- `match-builder.tsx`: extract the group/leaf row chrome.
- `target-badge.tsx`: already uses a class map — leave alone.

Pattern (matches `src/components/ui/badge.tsx`):

```ts
// rule-editor.styles.ts
import { cva } from "class-variance-authority";

export const panelChrome = cva("flex h-full flex-col overflow-hidden");
export const panelHeader = cva("flex items-center justify-between border-b px-4 py-3");
export const fieldStack  = cva("flex-1 space-y-4 overflow-y-auto px-4 py-4");
```

### F5 · KNOWN_FIELDS → JSON config

Move `src/components/rule-builder/fields.ts` → split into:

- `src/config/match-fields.json` — the catalog data (FieldSpec[]).
- `src/components/rule-builder/fields.ts` — keeps the `FieldSpec` type,
  `fieldSpec()`, `operatorsForField()`, and `OPERATOR_LABELS`. Imports the
  JSON.

JSON shape mirrors the current TS literal:

```json
[
  { "name": "service", "label": "Service", "kind": "string",
    "ops": ["eq","neq","in","not_in","matches","starts_with","ends_with"],
    "description": "Service name from the SDK registration." },
  { "name": "injection_point", "label": "Injection point", "kind": "enum",
    "ops": ["eq","neq","in","not_in"],
    "values": ["ingress","egress","transient","custom"],
    "description": "Where in the request lifecycle atropos applies the rule." }
]
```

**JSON body matching is not solved by this change** (explicit non-goal). Users
who want to match `body.user.id` etc. still cannot — moving to JSON only
removes the code-change barrier when we later ship body-field specs in the
catalog. The "Custom field" escape hatch is deferred.

### F6 · Priority relabel + helper text

`src/components/rules/rule-editor-panel.tsx`:

```tsx
// before
<Field label="Priority">
  <Input type="number" value={priority} ... />
</Field>

// after
<Field
  label="Match priority"
  hint="Higher numbers are evaluated first when multiple rules match the same request. Range typically 0–100."
>
  <Input type="number" min={0} max={1000} value={priority} ... />
</Field>
```

Update the `Field` component to accept an optional `hint` prop and render it
as a `<p>` below the input. No schema change. No backend change.

Also: rename the Rules-page table column `Prio` → `Match priority` (or short
form `Pri ↓` to indicate sort direction).

---

## 5. Cross-repo data flow

```
laptop UI                    SSH tunnel              VM1 k3s
─────────                    ──────────              ───────
RuleEditorPanel
  ├ Action-type Select ────► {action: {type, fault_spec_id, ...}}
  ├ Mode / start_policy ───► {mode, start_policy}
  ├ FaultSpecPicker ──fetch──►/api/v1/faults/specs (F2b: empty→[], not 500)
  ├ MatchBuilder ──────────► {match_expr (rego), match_ast (forward-compat),
  │                            match: {injection_point, labels{}}}
  └ Priority (relabeled)──► {priority}
                       ↓ POST /api/v1/rules
                   manteion-go validates Action.Type, stores:
                       rules (id, name, service, enabled, priority,
                              injection_point, labels, action_*,
                              mode, start_policy, match_expr  ← F1b)
                       ↓ broadcastRulesChanged SSE
                   SDK pollers consume CompiledRule
                       (still evaluating on labels + injection_point
                        only; match_expr is preview)
```

---

## 6. Phased implementation

Spec lays out *what* gets built; the writing-plans skill will derive the
step-by-step plan from this section.

| Phase | Repo | Scope | Depends on |
|---|---|---|---|
| **0a** | manteion-go | F2b: fix `GET /api/v1/faults/specs` 500 → `[]`. | — |
| **0b** | manteion-go | F1b: migration + model + repo + ruleconv pass-through for `match_expr`. | — |
| **1** | manteion-ui | F1: action-type Select + nested payload + mode + start_policy + injection_point. Restructure `RuleInput` and mock fixtures. | 0b (deploy) |
| **2** | manteion-ui | F2: FaultSpecPicker (Select + fallback). | 0a (deploy) |
| **3** | manteion-ui | F5: KNOWN_FIELDS → JSON config. Independent of others. | — |
| **4** | manteion-ui | F6: Priority relabel + helper text. Add `hint` prop to `Field`. Independent. | — |
| **5** | manteion-ui | F4: styling refactor (cva variants per file). | 1, 2 (touches same files) |
| **6** | manteion-ui | F3: extended mock fixtures + end-to-end test plan. | 1, 2, 4 |

Phases 0a, 0b, 3, 4 can ship in parallel; 1/2/5 are serial in the same files;
6 closes verification.

---

## 7. Risks & open questions

- **`match_expr` semantic drift.** Storing rego without evaluating it means
  the rule UI claims more than the SDK enforces. We mitigate by displaying
  a banner in the rule editor: "Rich match is stored but not yet evaluated;
  the SDK matches on labels{} + injection_point only." Removed when SDK
  rego eval ships.
- **Cachebox action.** Figma v1.1 said cache-box was removed from rules.
  Backend still has it. We're keeping it in the UI as a third action-type
  option per the backend reality; if you want it hidden, that's a one-line
  filter in the Action-type Select.
- **`fault_composition` picker.** Same shape as FaultSpecPicker, hits
  `GET /api/v1/faults/compositions` (verified: route registered in
  `internal/api/server.go:146`, returns `[]` on empty correctly — no 500
  bug there).
- **Mock-vs-live divergence.** The mock layer is fixture-driven; after this
  spec it will mirror the live shape. Keep them aligned in every PR that
  changes `RuleInput`.
- **Backend deploy on VM1.** Per user direction, manteion-go edits happen on
  VM1's `/home/faults-lab/manteion-go` checkout and are committed/pushed (no
  PRs). UI assumes the backend changes are deployed before phases 1/2 ship.

---

## 8. Out of scope

- Per-service body field schemas (#5 deeper ask).
- Sample-rate / probability field on rules (#6 alternative).
- SDK-side rego evaluation (downstream of F1b).
- Any redesign of Experiments, Faults, Workflows, Dashboard.
- Authentication / authorization on `/api/v1/rules` (already absent today).
