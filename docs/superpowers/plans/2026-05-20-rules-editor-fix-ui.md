# Rules Editor Fix — UI Implementation Plan (manteion-ui)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/rules` create / read / update / delete work end-to-end against the live manteion-go backend. Restructure the rule payload to the nested `action` envelope, ship Mode / Start-policy / Injection-point controls, replace the free-text Fault primitive with a Combobox, move the field catalog to JSON, relabel Priority, and refactor inline Tailwind into `cva` variants.

**Architecture:** Six phases in `manteion-ui` (this repo). Phases 1 and 2 depend on the backend plan being deployed; Phases 3–5 are independent of backend state. The v1.1 rich match builder (AST + Rego tabs) is kept — the backend now stores `match_expr` opaquely. No new CSS files; styling extraction uses `class-variance-authority` to match the existing shadcn convention.

**Tech Stack:** React 18 + TypeScript, TanStack Query, TanStack Router (file-based), Zod schemas, shadcn/ui + Tailwind, `class-variance-authority` (already in `tailwind.config.ts`), Vitest + Testing Library, Biome.

**Prerequisite:** [`2026-05-20-rules-editor-fix-backend.md`](./2026-05-20-rules-editor-fix-backend.md) shipped and deployed (verified `GET /faults/specs` returns `[]`; `POST /rules` accepts `action: { type, fault_spec_id }`).

**Spec:** [`docs/superpowers/specs/2026-05-20-rules-editor-fix-design.md`](../specs/2026-05-20-rules-editor-fix-design.md).

---

## File structure

| Phase | File | Action |
|---|---|---|
| 1 | `src/types/api.ts` | Modify: restructure `RuleSchema` — add `action` discriminated union, `start_policy`, `match_expr`. |
| 1 | `src/lib/api/rules.ts` | Modify: restructure `RuleInput`, rewrite `createRule`/`updateRule` body construction, update mock fixtures to new shape. |
| 1 | `src/components/rules/rule-editor-panel.tsx` | Modify: replace `fault_spec_id` text input with action sub-fields; add Mode / Start-policy / Injection-point selects. |
| 1 | `src/routes/rules/__tests__/rule-editor-panel.test.tsx` | Modify: update existing assertions to new schema; add tests for action-type switching. |
| 2 | `src/components/rules/fault-spec-picker.tsx` | Create: Combobox bound to `faultsApi.listFaultSpecs`, with fallback states. |
| 2 | `src/components/rules/rule-editor-panel.tsx` | Modify: use `<FaultSpecPicker>` instead of free-text input when `action.type === "fault_spec"`. |
| 2 | `src/components/rules/__tests__/fault-spec-picker.test.tsx` | Create: unit tests for the three states (loaded list, empty, error). |
| 3 | `src/config/match-fields.json` | Create: extracted catalog data. |
| 3 | `src/components/rule-builder/fields.ts` | Modify: import JSON instead of inline literal; keep types + helpers. |
| 4 | `src/components/rules/rule-editor-panel.tsx` | Modify: extend `Field` with optional `hint` prop; relabel Priority + add hint. |
| 4 | `src/components/rules/rules-page.tsx` | Modify: rename `Prio` table column to `Match priority`. |
| 5 | `src/components/rules/rule-editor.styles.ts` | Create: `cva` variants for panel/header/field-stack chrome. |
| 5 | `src/components/rules/rule-editor-panel.tsx` | Modify: replace inline Tailwind strings with variants. |
| 5 | `src/components/rules/rules-page.tsx` | Modify: extract table-row + search-bar variants. |
| 5 | `src/components/rule-builder/match-builder.tsx` | Modify: extract group/leaf chrome. |
| 6 | `src/lib/api/rules.ts` | Modify: extend mock fixtures with `fault_composition` and `cachebox` action examples. |
| 6 | `src/lib/api/faults.ts` | Modify: add mock-mode fixture FaultSpecs. |
| 6 | `docs/ops/testing-rules-end-to-end.md` | Create: manual end-to-end test plan against VM1. |

---

## Common commands

Run from `/Users/pronei/work/faults-lab/manteion-ui` (the repo root):

```sh
# Local typecheck (tsr generates routeTree first):
./node_modules/.bin/tsc -b
# Unit tests:
./node_modules/.bin/vitest run
# Watch tests during work:
./node_modules/.bin/vitest
# Lint:
./node_modules/.bin/biome check src
# Preview the UI (mock mode):
# preview_start "faults-review"  → http://localhost:5174 (VITE_USE_MOCK=true)
```

Commit pattern: one commit per phase (per user direction — single batched commit per prompt).

```sh
git add <files…> && git commit -m "<phase msg>" && git push origin develop
```

---

## Phase 1 · Action envelope + Mode/Start-policy/Injection-point + restructure schema

**Scope:** Schema (Zod), API client (createRule/updateRule + mock), editor form, tests. Single commit at the end.

**Backend wire format (after Phase 0a/0b ship — for reference):**

```jsonc
POST /api/v1/rules
{
  "name": "...", "service": "...", "enabled": true, "priority": 50,
  "mode": "inline" | "background",
  "start_policy": "deduplicate_by_rule" | "always_start",
  "match": { "injection_point": "ingress" | "egress" | "transient" | "custom" | "",
             "labels": { "k": "v" } },
  "action": {
    "type": "fault_spec" | "fault_composition" | "cachebox",
    "fault_spec_id": "spec-…",                                  // when type=fault_spec
    "fault_composition_id": "comp-…",                            // when type=fault_composition
    "cachebox": { "mode": "passthrough"|"replay"|"replay_with_delay",
                  "key_strategy": "exact"|"exact_with_host"|"exact_with_body" }   // when type=cachebox
  },
  "match_expr": "<opa-rego text>"                                // forward-compat; optional
}
```

### Task 1: Restructure `RuleSchema` in `src/types/api.ts`

**Files:** Modify `src/types/api.ts`

- [ ] **Step 1: Read the current `RuleSchema` block (around line 76–120)**

```sh
./node_modules/.bin/biome check src/types/api.ts
```

Note the existing `RuleSchema` fields so you can preserve unrelated ones.

- [ ] **Step 2: Add discriminated `RuleActionSchema` above `RuleSchema`**

After the existing `MatchNodeSchema` block and before `RuleSchema`, add:

```ts
// ─── Rule action (discriminated union per backend internal/model/rule.go) ───

export const CacheBoxConfigSchema = z.object({
  mode: z.enum(["passthrough", "replay", "replay_with_delay"]),
  key_strategy: z.enum(["exact", "exact_with_host", "exact_with_body"]),
});
export type CacheBoxConfig = z.infer<typeof CacheBoxConfigSchema>;

export const RuleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fault_spec"),        fault_spec_id:        z.string().min(1) }),
  z.object({ type: z.literal("fault_composition"), fault_composition_id: z.string().min(1) }),
  z.object({ type: z.literal("cachebox"),          cachebox:             CacheBoxConfigSchema }),
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const ModeSchema        = z.enum(["inline", "background"]);
export const StartPolicySchema = z.enum(["deduplicate_by_rule", "always_start"]);
export const InjectionPointSchema = z.enum(["", "ingress", "egress", "transient", "custom"]);
```

- [ ] **Step 3: Replace the existing flat fault/mode fields on `RuleSchema`**

Find `RuleSchema = z.object({ ... })` (line ~76) and replace its body with:

```ts
export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  service: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  mode: ModeSchema,
  start_policy: StartPolicySchema.optional(),
  match: z
    .object({
      injection_point: InjectionPointSchema.optional(),
      labels: z.record(z.string()).optional(),
    })
    .optional(),
  action: RuleActionSchema,
  /** NEW — forward-compat OPA-rego text (backend stores opaque; SDK ignores). */
  match_expr: z.string().optional(),
  /** Builder-only AST. Backend silently drops; useful for re-hydrating editor. */
  match_ast: MatchNodeSchema.optional(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
```

Remove the old top-level `fault_spec_id`, `fault_composition_id`, `cache_box`, etc. — they live under `action` now.

- [ ] **Step 4: Typecheck**

```sh
./node_modules/.bin/tsc -b
```

This will fail with many errors in `rule-editor-panel.tsx`, `rules.ts`, mock data, tests — that's expected. We fix them in the next tasks.

### Task 2: Update `RuleInput`, `createRule`, `updateRule`, mock fixtures

**Files:** Modify `src/lib/api/rules.ts`

- [ ] **Step 1: Replace `RuleInput` interface (line 134) with action-aware shape**

```ts
import type { RuleAction } from "@/types/api";  // add at top of file

export interface RuleInput {
  name: string;
  service: string;
  enabled: boolean;
  priority: number;
  mode: "inline" | "background";
  start_policy?: "deduplicate_by_rule" | "always_start";
  match?: {
    injection_point?: "" | "ingress" | "egress" | "transient" | "custom";
    labels?: Record<string, string>;
  };
  action: RuleAction;
  match_expr?: string;
  match_ast?: MatchNode;
}
```

Remove the flat `fault_spec_id?`, `fault_composition_id?` fields — they're inside `action` now.

- [ ] **Step 2: Update `createRule` mock branch (lines 147–165) to use the new shape**

```ts
export async function createRule(input: RuleInput): Promise<Rule> {
  if (USE_MOCK) {
    await mockDelay();
    const rule: Rule = {
      id: `rule-${Date.now()}`,
      name: input.name,
      service: input.service,
      enabled: input.enabled,
      priority: input.priority,
      mode: input.mode,
      start_policy: input.start_policy,
      match: input.match,
      action: input.action,
      match_expr: input.match_expr,
      match_ast: input.match_ast,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    _mockRules = [..._mockRules, rule];
    return rule;
  }
  return apiClient.post("/api/v1/rules", input, RuleSchema);
}
```

- [ ] **Step 3: Same restructure for `updateRule`**

Apply the equivalent change to the mock branch around line 170–190.

- [ ] **Step 4: Restructure all 8 fixture rules (lines 9–108)**

For each existing fixture, replace the flat `fault_spec_id: "..."` with a nested action. Example for `rule-001`:

```ts
{
  id: "rule-001",
  name: "freeze-productcatalog",
  service: "productcatalog",
  enabled: true,
  priority: 100,
  mode: "inline",
  start_policy: "deduplicate_by_rule",
  action: { type: "fault_spec", fault_spec_id: "spec-inline-hang-5s" },
  match: { labels: { "atropos.workflow": "browse", tenant: "demo" } },
  created_at: "2026-04-01T10:00:00Z",
  updated_at: "2026-04-20T14:30:00Z",
},
```

Replace each fault_spec_id with a `spec-…` ID; we'll seed matching FaultSpec fixtures in Phase 6. Remove the `_target` label (it was a UI projection of the action type and is now redundant).

- [ ] **Step 5: Typecheck again**

```sh
./node_modules/.bin/tsc -b
```

Remaining errors should now be only in `rule-editor-panel.tsx` and tests.

### Task 3: Rewrite the editor form

**Files:** Modify `src/components/rules/rule-editor-panel.tsx`

This is the biggest UI change. The new form layout (top to bottom):

```
[ panel header: name | Enabled switch ]
─ Name (text)
─ Service (select)
─ Action type (select: fault_spec | fault_composition | cachebox)
  ├── if fault_spec       → Fault spec (text — replaced by Picker in Phase 2)
  ├── if fault_composition → Fault composition (text — same Picker pattern in Phase 2)
  └── if cachebox          → Cachebox mode (select) + Key strategy (select)
─ Mode (select: inline | background)
─ Injection point (select: "" | ingress | egress | transient | custom)
─ ── separator ──
─ Match criteria (existing RuleBuilder)
─ Priority (relabeled in Phase 4)
─ Advanced disclosure
   └── Start policy (select: deduplicate_by_rule | always_start)
[ footer: Delete | Test push | Save ]
```

- [ ] **Step 1: Update state hooks**

In `RuleEditorForm` (around line 145), replace the existing state block with:

```ts
const [name, setName] = useState(existing?.name ?? "");
const [service, setService] = useState(existing?.service ?? "");
const [enabled, setEnabled] = useState(existing?.enabled ?? true);
const [priority, setPriority] = useState(existing?.priority ?? 50);
const [mode, setMode] = useState<"inline" | "background">(existing?.mode ?? "inline");
const [startPolicy, setStartPolicy] = useState<"deduplicate_by_rule" | "always_start">(
  existing?.start_policy ?? "deduplicate_by_rule",
);
const [injectionPoint, setInjectionPoint] = useState<"" | "ingress" | "egress" | "transient" | "custom">(
  existing?.match?.injection_point ?? "",
);
// Action state
const [actionType, setActionType] = useState<"fault_spec" | "fault_composition" | "cachebox">(
  existing?.action?.type ?? "fault_spec",
);
const [faultSpecId, setFaultSpecId] = useState(
  existing?.action?.type === "fault_spec" ? existing.action.fault_spec_id : "",
);
const [faultCompId, setFaultCompId] = useState(
  existing?.action?.type === "fault_composition" ? existing.action.fault_composition_id : "",
);
const [cacheboxMode, setCacheboxMode] = useState<"passthrough" | "replay" | "replay_with_delay">(
  existing?.action?.type === "cachebox" ? existing.action.cachebox.mode : "passthrough",
);
const [cacheboxKeyStrategy, setCacheboxKeyStrategy] = useState<"exact" | "exact_with_host" | "exact_with_body">(
  existing?.action?.type === "cachebox" ? existing.action.cachebox.key_strategy : "exact",
);
// Match builder state (unchanged):
const [ast, setAst] = useState<MatchNode | undefined>(initAst);
const [rego, setRego] = useState(existing?.match_expr ?? compile(initAst));
const [custom, setCustom] = useState(false);
```

- [ ] **Step 2: Replace the `save` mutation body (line 155–168)**

```ts
const save = useMutation({
  mutationFn: () => {
    const action: RuleAction =
      actionType === "fault_spec"
        ? { type: "fault_spec", fault_spec_id: faultSpecId }
        : actionType === "fault_composition"
          ? { type: "fault_composition", fault_composition_id: faultCompId }
          : { type: "cachebox", cachebox: { mode: cacheboxMode, key_strategy: cacheboxKeyStrategy } };

    const input: RuleInput = {
      name,
      service,
      enabled,
      priority,
      mode,
      start_policy: startPolicy,
      action,
      match: {
        injection_point: injectionPoint || undefined,
        labels: ast ? astToMatchCriteria(ast).labels : undefined,
      },
      match_expr: custom ? rego : rego,
      match_ast: custom ? undefined : ast,
    };
    return isNew ? rulesApi.createRule(input) : rulesApi.updateRule(ruleId as string, input);
  },
  // onSuccess unchanged
});
```

(`RuleAction` and `RuleInput` come from `@/types/api` and `@/lib/api/rules` respectively — add to the import block at the top.)

- [ ] **Step 3: Replace the form JSX between the existing Service Field and the Separator (lines ~220–230)**

Remove the old `<Field label="Fault primitive">…</Field>`. Replace with:

```tsx
<Field label="Action type">
  <Select value={actionType} onValueChange={(v) => setActionType(v as typeof actionType)}>
    <SelectTrigger className="font-mono text-sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="fault_spec" className="font-mono text-sm">fault_spec</SelectItem>
      <SelectItem value="fault_composition" className="font-mono text-sm">fault_composition</SelectItem>
      <SelectItem value="cachebox" className="font-mono text-sm">cachebox</SelectItem>
    </SelectContent>
  </Select>
</Field>

{actionType === "fault_spec" && (
  <Field label="Fault spec">
    <Input
      value={faultSpecId}
      onChange={(e) => setFaultSpecId(e.target.value)}
      placeholder="spec-…"
      className="font-mono text-sm"
    />
  </Field>
)}
{actionType === "fault_composition" && (
  <Field label="Fault composition">
    <Input
      value={faultCompId}
      onChange={(e) => setFaultCompId(e.target.value)}
      placeholder="comp-…"
      className="font-mono text-sm"
    />
  </Field>
)}
{actionType === "cachebox" && (
  <>
    <Field label="Cachebox mode">
      <Select value={cacheboxMode} onValueChange={(v) => setCacheboxMode(v as typeof cacheboxMode)}>
        <SelectTrigger className="font-mono text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="passthrough" className="font-mono text-sm">passthrough</SelectItem>
          <SelectItem value="replay" className="font-mono text-sm">replay</SelectItem>
          <SelectItem value="replay_with_delay" className="font-mono text-sm">replay_with_delay</SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <Field label="Key strategy">
      <Select value={cacheboxKeyStrategy} onValueChange={(v) => setCacheboxKeyStrategy(v as typeof cacheboxKeyStrategy)}>
        <SelectTrigger className="font-mono text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="exact" className="font-mono text-sm">exact</SelectItem>
          <SelectItem value="exact_with_host" className="font-mono text-sm">exact_with_host</SelectItem>
          <SelectItem value="exact_with_body" className="font-mono text-sm">exact_with_body</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </>
)}

<Field label="Mode">
  <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
    <SelectTrigger className="font-mono text-sm"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="inline" className="font-mono text-sm">inline</SelectItem>
      <SelectItem value="background" className="font-mono text-sm">background</SelectItem>
    </SelectContent>
  </Select>
</Field>

<Field label="Injection point">
  <Select value={injectionPoint} onValueChange={(v) => setInjectionPoint(v as typeof injectionPoint)}>
    <SelectTrigger className="font-mono text-sm"><SelectValue placeholder="(any)" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="" className="font-mono text-sm">(any)</SelectItem>
      <SelectItem value="ingress" className="font-mono text-sm">ingress</SelectItem>
      <SelectItem value="egress" className="font-mono text-sm">egress</SelectItem>
      <SelectItem value="transient" className="font-mono text-sm">transient</SelectItem>
      <SelectItem value="custom" className="font-mono text-sm">custom</SelectItem>
    </SelectContent>
  </Select>
</Field>
```

- [ ] **Step 4: Add the Advanced disclosure for `start_policy` after the Priority field (around line 256)**

Insert below the existing Priority Field:

```tsx
<details className="space-y-2">
  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Advanced</summary>
  <div className="space-y-4 pt-2">
    <Field label="Start policy">
      <Select value={startPolicy} onValueChange={(v) => setStartPolicy(v as typeof startPolicy)}>
        <SelectTrigger className="font-mono text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="deduplicate_by_rule" className="font-mono text-sm">deduplicate_by_rule</SelectItem>
          <SelectItem value="always_start" className="font-mono text-sm">always_start</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </div>
</details>
```

- [ ] **Step 5: Verify the editor compiles + smoke-test it**

```sh
./node_modules/.bin/tsc -b
```

Then start the preview (mock mode):

```sh
# Use the existing launch.json entry; preview will be on :5174
# (preview_start with name "faults-review")
```

Open `/rules`, click **New rule**, switch the Action-type select between values, confirm the right sub-fields render.

### Task 4: Update editor tests

**Files:** Modify `src/routes/rules/__tests__/rule-editor-panel.test.tsx`

- [ ] **Step 1: Update `EXISTING_RULE` fixture (line 23) to new schema**

```ts
const EXISTING_RULE: Rule = {
  id: "rule-001",
  name: "freeze-productcatalog",
  service: "productcatalog",
  enabled: true,
  priority: 100,
  mode: "inline",
  start_policy: "deduplicate_by_rule",
  action: { type: "fault_spec", fault_spec_id: "spec-inline-hang-5s" },
  match: { labels: { "atropos.workflow": "browse", tenant: "demo" } },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
```

- [ ] **Step 2: Update the existing "renders fault primitive field" test to match the new label**

Find the test (around line 60) and update assertions:

```ts
it("renders action type and fault-spec sub-field", () => {
  renderPanel({ isNew: true, ruleId: null });
  expect(screen.getByText("Action type")).toBeTruthy();
  expect(screen.getByText("Fault spec")).toBeTruthy();
  expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
});
```

- [ ] **Step 3: Add a test for action-type switching**

```ts
it("switches sub-field when action type changes to cachebox", async () => {
  const user = userEvent.setup();
  renderPanel({ isNew: true, ruleId: null });

  // Initial state: fault_spec, so fault-spec field is visible.
  expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();

  // Find and change the Action type select.
  const trigger = screen.getByRole("combobox", { name: /action type/i });
  await user.click(trigger);
  await user.click(screen.getByRole("option", { name: "cachebox" }));

  // Cachebox sub-fields appear; fault-spec is gone.
  expect(screen.getByText("Cachebox mode")).toBeTruthy();
  expect(screen.getByText("Key strategy")).toBeTruthy();
  expect(screen.queryByPlaceholderText("spec-…")).toBeNull();
});
```

- [ ] **Step 4: Run editor tests**

```sh
./node_modules/.bin/vitest run src/routes/rules/__tests__/rule-editor-panel.test.tsx
```

Expected: all tests pass (existing 14 + the new switching test). Iterate if assertions need adjusting.

### Task 5: Phase 1 verification + commit

- [ ] **Step 1: Full check**

```sh
./node_modules/.bin/tsc -b && \
./node_modules/.bin/vitest run && \
./node_modules/.bin/biome check src
```

Expected: all green.

- [ ] **Step 2: Smoke-test in browser (mock mode)**

Start the `faults-review` preview, open `/rules`, click **New rule**, fill a rule with each action type, click **Save**, confirm the new rule appears in the list. Reload to confirm it persists in the in-memory mock.

- [ ] **Step 3: Commit + push**

```sh
git add src/types/api.ts src/lib/api/rules.ts src/components/rules/rule-editor-panel.tsx \
        src/routes/rules/__tests__/rule-editor-panel.test.tsx && \
git commit -m "fix(rules): restructure to action envelope; add mode/start_policy/injection_point

Rule shape now matches manteion-go's model.Rule:
- action: discriminated union { fault_spec | fault_composition | cachebox }
- mode select (inline/background) replaces the hidden useState constant
- start_policy under an Advanced disclosure
- injection_point as a typed select
- match_expr forward-compat field (backend stores opaque after F1b)

Restructures RuleInput, all 8 mock fixtures, and the editor tests.
Verified manually against mock layer; live verification depends on
backend phases 0a/0b shipping (see plan doc).
" && \
git push origin develop
```

---

## Phase 2 · FaultSpecPicker

### Task 6: Build `<FaultSpecPicker>` component

**Files:** Create `src/components/rules/fault-spec-picker.tsx`

- [ ] **Step 1: Read an existing Select-using component for the project pattern**

```sh
# rule-editor-panel.tsx already shows the Select/SelectTrigger/SelectContent pattern.
```

- [ ] **Step 2: Write the component**

```tsx
import { faultsApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";

interface FaultSpecPickerProps {
  value: string;
  onChange: (id: string) => void;
}

/** Combobox bound to GET /api/v1/faults/specs. Falls back to free-text
 *  on empty list or fetch error, with a small helper note. */
export function FaultSpecPicker({ value, onChange }: FaultSpecPickerProps) {
  const q = useQuery({
    queryKey: ["fault-specs"],
    queryFn: faultsApi.listFaultSpecs,
    retry: 1,
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return <Input disabled placeholder="Loading fault specs…" className="font-mono text-sm" />;
  }

  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : "fetch failed";
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="spec-…"
          className="font-mono text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Couldn't load fault catalog ({msg}) — enter the spec ID manually.
        </p>
      </div>
    );
  }

  const specs = q.data ?? [];
  if (specs.length === 0) {
    return (
      <div className="space-y-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="spec-…"
          className="font-mono text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          No fault specs defined yet — create one via{" "}
          <code className="font-mono">POST /api/v1/faults/specs</code>, or type an ID manually.
        </p>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="font-mono text-sm"><SelectValue placeholder="Pick a fault spec…" /></SelectTrigger>
      <SelectContent>
        {specs.map((s) => (
          <SelectItem key={s.id} value={s.id} className="font-mono text-sm">
            {s.category}:{s.fault_type} · {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Task 7: Wire the picker into the editor

**Files:** Modify `src/components/rules/rule-editor-panel.tsx`

- [ ] **Step 1: Import the picker at the top**

```ts
import { FaultSpecPicker } from "@/components/rules/fault-spec-picker";
```

- [ ] **Step 2: Replace the `fault_spec` sub-field block (from Phase 1 Task 3 Step 3)**

Change:

```tsx
{actionType === "fault_spec" && (
  <Field label="Fault spec">
    <Input ... />
  </Field>
)}
```

To:

```tsx
{actionType === "fault_spec" && (
  <Field label="Fault spec">
    <FaultSpecPicker value={faultSpecId} onChange={setFaultSpecId} />
  </Field>
)}
```

### Task 8: Write picker tests

**Files:** Create `src/components/rules/__tests__/fault-spec-picker.test.tsx`

- [ ] **Step 1: Write the three-state test file**

```tsx
import { FaultSpecPicker } from "@/components/rules/fault-spec-picker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  faultsApi: { listFaultSpecs: vi.fn() },
}));
import { faultsApi } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("FaultSpecPicker", () => {
  it("renders a Select with options when the list is populated", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([
      {
        id: "spec-1", name: "p99-latency", category: "inline", fault_type: "latency",
        params: {}, created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText("Pick a fault spec…")).toBeTruthy());
  });

  it("falls back to free-text + helper when the list is empty", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockResolvedValue([]);
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/No fault specs defined yet/i)).toBeTruthy());
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
  });

  it("falls back to free-text + error helper when the fetch fails", async () => {
    vi.mocked(faultsApi.listFaultSpecs).mockRejectedValue(new Error("boom"));
    render(wrap(<FaultSpecPicker value="" onChange={() => {}} />));
    await waitFor(() => expect(screen.getByText(/Couldn't load fault catalog/i)).toBeTruthy());
    expect(screen.getByPlaceholderText("spec-…")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them**

```sh
./node_modules/.bin/vitest run src/components/rules/__tests__/fault-spec-picker.test.tsx
```

Expected: 3/3 pass.

### Task 9: Phase 2 verification + commit

- [ ] **Step 1: Full check**

```sh
./node_modules/.bin/tsc -b && ./node_modules/.bin/vitest run && ./node_modules/.bin/biome check src
```

- [ ] **Step 2: Commit + push**

```sh
git add src/components/rules/fault-spec-picker.tsx \
        src/components/rules/__tests__/fault-spec-picker.test.tsx \
        src/components/rules/rule-editor-panel.tsx && \
git commit -m "feat(rules): FaultSpecPicker — combobox from /faults/specs with fallback

Replaces the free-text fault_spec_id input with a Select bound to
faultsApi.listFaultSpecs. Three states:
  - populated list → combobox of '<category>:<fault_type> · <name>'
  - empty list     → text input + helper note (POST /faults/specs first)
  - fetch error    → text input + error message

Falls back gracefully so the editor remains usable while the backend
catalog is still being populated.
" && \
git push origin develop
```

---

## Phase 3 · `KNOWN_FIELDS` → JSON config

**Independent of Phases 1/2** — can be done in parallel.

### Task 10: Extract catalog to JSON

**Files:** Create `src/config/match-fields.json`; Modify `src/components/rule-builder/fields.ts`

- [ ] **Step 1: Create the JSON file**

```sh
mkdir -p src/config
```

Then write `src/config/match-fields.json`:

```json
[
  {
    "name": "service",
    "label": "Service",
    "kind": "string",
    "ops": ["eq", "neq", "in", "not_in", "matches", "starts_with", "ends_with"],
    "description": "Service name from the SDK registration."
  },
  {
    "name": "injection_point",
    "label": "Injection point",
    "kind": "enum",
    "ops": ["eq", "neq", "in", "not_in"],
    "values": ["ingress", "egress", "transient", "custom"],
    "description": "Where in the request lifecycle atropos applies the rule."
  },
  {
    "name": "atropos.workflow",
    "label": "atropos.workflow",
    "kind": "string",
    "ops": ["eq", "neq", "in", "not_in", "matches", "starts_with", "ends_with"],
    "description": "Workflow identifier (e.g. browse, checkout)."
  },
  {
    "name": "tenant",
    "label": "Tenant",
    "kind": "string",
    "ops": ["eq", "neq", "in", "not_in", "matches", "starts_with", "ends_with"]
  },
  {
    "name": "method",
    "label": "HTTP method",
    "kind": "enum",
    "ops": ["eq", "neq", "in", "not_in"],
    "values": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]
  },
  {
    "name": "path",
    "label": "HTTP path",
    "kind": "string",
    "ops": ["eq", "neq", "in", "not_in", "matches", "starts_with", "ends_with"]
  },
  {
    "name": "priority",
    "label": "Priority",
    "kind": "number",
    "ops": ["eq", "neq", "gt", "gte", "lt", "lte"]
  }
]
```

- [ ] **Step 2: Update `src/components/rule-builder/fields.ts` to import the JSON**

Replace the contents below the `FieldSpec` type definition with:

```ts
import type { MatchOperator } from "@/lib/rego/ast";
import catalog from "@/config/match-fields.json";

export interface FieldSpec {
  name: string;
  label: string;
  kind: "string" | "number" | "enum";
  ops: MatchOperator[];
  values?: string[];
  description?: string;
}

const stringOps: MatchOperator[] = [
  "eq", "neq", "in", "not_in", "matches", "starts_with", "ends_with",
];

export const KNOWN_FIELDS: FieldSpec[] = catalog as FieldSpec[];

export function fieldSpec(name: string): FieldSpec {
  const known = KNOWN_FIELDS.find((f) => f.name === name);
  if (known) return known;
  return { name, label: name, kind: "string", ops: stringOps };
}

export function operatorsForField(field: string): MatchOperator[] {
  return fieldSpec(field).ops;
}

export const OPERATOR_LABELS: Record<MatchOperator, string> = {
  eq: "=", neq: "≠", in: "in", not_in: "not in",
  matches: "matches", starts_with: "starts with", ends_with: "ends with",
  gt: ">", gte: "≥", lt: "<", lte: "≤",
};
```

The unused `numericOps` constant from the old file is removed because the JSON already encodes ops per field; the only constant we still need is `stringOps` for the unknown-field fallback.

- [ ] **Step 3: Confirm `tsconfig` allows JSON imports**

```sh
grep -E '"resolveJsonModule"|"esModuleInterop"' tsconfig*.json
```

Expected: `"resolveJsonModule": true` somewhere. If absent, add it to `tsconfig.app.json` under `compilerOptions`:

```json
"resolveJsonModule": true,
```

- [ ] **Step 4: Typecheck + tests**

```sh
./node_modules/.bin/tsc -b && ./node_modules/.bin/vitest run
```

Expected: all green. The existing `roundtrip.test.ts` exercises the field catalog indirectly.

### Task 11: Phase 3 commit

- [ ] **Step 1: Commit + push**

```sh
git add src/config/match-fields.json src/components/rule-builder/fields.ts tsconfig.app.json && \
git commit -m "refactor(rule-builder): move KNOWN_FIELDS catalog to JSON config

Extracts the match-field catalog to src/config/match-fields.json so it
can grow without code changes. fields.ts keeps the FieldSpec type and
the helpers (fieldSpec, operatorsForField, OPERATOR_LABELS).

Does not solve JSON body matching (still hardcoded set) — that's a
follow-up; this only removes the code-change barrier for catalog growth.
" && \
git push origin develop
```

---

## Phase 4 · Priority relabel + helper text

**Independent** — parallel-safe.

### Task 12: Add `hint` to the local `Field` component + relabel Priority

**Files:** Modify `src/components/rules/rule-editor-panel.tsx`

- [ ] **Step 1: Extend the `Field` function (bottom of file, line ~289) with an optional `hint` prop**

```tsx
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update the Priority Field usage (line ~249) with the new label + hint + bounds**

```tsx
<Field
  label="Match priority"
  hint="Higher numbers are evaluated first when multiple rules match the same request. Typical range 0–100."
>
  <Input
    type="number"
    min={0}
    max={1000}
    value={priority}
    onChange={(e) => setPriority(Number(e.target.value))}
    className="font-mono text-sm"
  />
</Field>
```

### Task 13: Rename the table column header

**Files:** Modify `src/components/rules/rules-page.tsx`

- [ ] **Step 1: Find the `<TableHead>` for Prio (around line 119–130)**

```sh
grep -n 'Prio' src/components/rules/rules-page.tsx
```

- [ ] **Step 2: Rename it**

Change `<TableHead className="...">Prio</TableHead>` → `<TableHead className="...">Match priority</TableHead>`.

If you want to indicate the sort direction, use `Match priority ↓`.

### Task 14: Update tests that hit the old labels

**Files:** Modify `src/routes/rules/__tests__/rule-editor-panel.test.tsx` and `src/routes/rules/__tests__/rule-list.test.tsx`

- [ ] **Step 1: Replace any `screen.getByText("Priority")` with `"Match priority"`**

```sh
grep -rn '"Priority"' src/routes/rules/__tests__/
```

- [ ] **Step 2: Run tests**

```sh
./node_modules/.bin/vitest run
```

Expected: green.

### Task 15: Phase 4 commit

```sh
git add src/components/rules/rule-editor-panel.tsx \
        src/components/rules/rules-page.tsx \
        src/routes/rules/__tests__/rule-editor-panel.test.tsx \
        src/routes/rules/__tests__/rule-list.test.tsx && \
git commit -m "fix(rules): relabel Priority → 'Match priority' with semantic hint

Priority is rule evaluation order (higher number wins when multiple
rules match), not a sampling rate. Per manteion-go's rule_repo.go
(ORDER BY priority DESC) and atropos-go's compiled_rule.go sort.

Field component gains an optional hint prop; priority gains min=0
max=1000 bounds. Table column renamed to match.
" && \
git push origin develop
```

---

## Phase 5 · Styling refactor (cva variants)

**Depends on Phase 1 + 2** because they touched the same files; do this after them to avoid merge churn.

### Task 16: Create `rule-editor.styles.ts`

**Files:** Create `src/components/rules/rule-editor.styles.ts`

- [ ] **Step 1: Confirm `class-variance-authority` is in dependencies**

```sh
grep '"class-variance-authority"' package.json
```

Expected: present. (`src/components/ui/badge.tsx` already uses it.)

- [ ] **Step 2: Write the variants module**

```ts
import { cva } from "class-variance-authority";

/** Outer chrome for the right-hand rule editor panel. */
export const panelChrome = cva("flex h-full flex-col overflow-hidden");

/** Top bar — title + Enabled switch. */
export const panelHeader = cva("flex items-center justify-between border-b px-4 py-3");
export const panelTitle  = cva("truncate text-sm font-semibold");

/** Scrolling field stack between header and footer. */
export const fieldStack = cva("flex-1 space-y-4 overflow-y-auto px-4 py-4");

/** Sticky footer with Delete / Save. */
export const panelFooter      = cva("space-y-2 border-t px-4 py-3");
export const panelFooterRow   = cva("flex items-center justify-between");
export const panelFooterRight = cva("flex items-center gap-2");
```

### Task 17: Apply variants to `rule-editor-panel.tsx`

**Files:** Modify `src/components/rules/rule-editor-panel.tsx`

- [ ] **Step 1: Import the variants**

```ts
import {
  panelChrome, panelHeader, panelTitle,
  fieldStack, panelFooter, panelFooterRow, panelFooterRight,
} from "@/components/rules/rule-editor.styles";
```

- [ ] **Step 2: Replace inline strings**

```diff
- <div className="flex h-full flex-col overflow-hidden">
+ <div className={panelChrome()}>
-   <div className="flex items-center justify-between border-b px-4 py-3">
+   <div className={panelHeader()}>
-     <h2 className="truncate text-sm font-semibold">…</h2>
+     <h2 className={panelTitle()}>…</h2>
…
-   <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
+   <div className={fieldStack()}>
…
-   <div className="space-y-2 border-t px-4 py-3">
+   <div className={panelFooter()}>
-     <div className="flex items-center justify-between">
+     <div className={panelFooterRow()}>
-       <div className="flex items-center gap-2">
+       <div className={panelFooterRight()}>
```

Leave the `Field`-level class strings (`space-y-1.5`, `text-xs font-medium`, `font-mono text-sm`) inline — they're already small enough not to repeat.

### Task 18: Apply the same pattern to `rules-page.tsx` and `match-builder.tsx`

**Files:** Create `src/components/rules/rules-page.styles.ts`; Modify `src/components/rules/rules-page.tsx`. Create `src/components/rule-builder/match-builder.styles.ts`; Modify `src/components/rule-builder/match-builder.tsx`.

- [ ] **Step 1: For each file, look for class strings that repeat ≥2 times**

```sh
grep -E 'className="[^"]{40,}"' src/components/rules/rules-page.tsx
grep -E 'className="[^"]{40,}"' src/components/rule-builder/match-builder.tsx
```

- [ ] **Step 2: Extract the top 3–5 repeated patterns per file into a sibling `.styles.ts` using the same `cva()` pattern**

Don't try to extract every class string — only the structural ones that repeat. Keep small/leaf strings inline.

- [ ] **Step 3: Verify no visual regression**

In the preview, open `/rules`, click various rules, switch tabs in the match builder, confirm everything looks identical to before. Use `preview_screenshot` on the editor panel and the match builder for a visual baseline check.

### Task 19: Phase 5 verification + commit

- [ ] **Step 1: Full check**

```sh
./node_modules/.bin/tsc -b && ./node_modules/.bin/vitest run && ./node_modules/.bin/biome check src
```

- [ ] **Step 2: Commit + push**

```sh
git add src/components/rules/rule-editor.styles.ts \
        src/components/rules/rules-page.styles.ts \
        src/components/rule-builder/match-builder.styles.ts \
        src/components/rules/rule-editor-panel.tsx \
        src/components/rules/rules-page.tsx \
        src/components/rule-builder/match-builder.tsx && \
git commit -m "refactor(rules): extract repeated Tailwind blocks into cva variants

Pulls the structural class strings (panel chrome, table-row layout,
group/leaf row chrome) into sibling .styles.ts modules using
class-variance-authority — same convention as src/components/ui/badge.tsx.
No new CSS files (would diverge from shadcn pattern); no visual change.

Leaf/utility class strings stay inline to avoid premature abstraction.
" && \
git push origin develop
```

---

## Phase 6 · Mock fixtures + end-to-end test plan

**Depends on Phases 1 + 2** for the new shapes.

### Task 20: Add cachebox + composition fixtures to mock rules

**Files:** Modify `src/lib/api/rules.ts`

- [ ] **Step 1: Append three new fixtures to `_mockRules` (after the 8 existing)**

```ts
  {
    id: "rule-009",
    name: "freeze-cart-replay",
    service: "cartservice",
    enabled: true,
    priority: 95,
    mode: "inline",
    start_policy: "deduplicate_by_rule",
    action: { type: "cachebox", cachebox: { mode: "replay", key_strategy: "exact_with_body" } },
    match: { injection_point: "egress", labels: { tenant: "demo" } },
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
  },
  {
    id: "rule-010",
    name: "ad-payment-combo",
    service: "paymentservice",
    enabled: false,
    priority: 55,
    mode: "background",
    start_policy: "always_start",
    action: { type: "fault_composition", fault_composition_id: "comp-cart-checkout" },
    match: { labels: { "atropos.workflow": "checkout" } },
    created_at: "2026-04-11T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
  },
  {
    id: "rule-011",
    name: "cachebox-passthrough-debug",
    service: "currencyservice",
    enabled: true,
    priority: 25,
    mode: "inline",
    action: { type: "cachebox", cachebox: { mode: "passthrough", key_strategy: "exact" } },
    match: {},
    created_at: "2026-04-12T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
  },
```

### Task 21: Add mock-mode FaultSpec fixtures

**Files:** Modify `src/lib/api/faults.ts`

- [ ] **Step 1: Read the current file**

```sh
cat src/lib/api/faults.ts
```

- [ ] **Step 2: Add a `USE_MOCK` branch to `listFaultSpecs` matching the rules pattern**

```ts
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const _mockSpecs: FaultSpec[] = [
  {
    id: "spec-inline-hang-5s",
    name: "hang 5s",
    category: "inline",
    fault_type: "hang",
    params: { duration_ms: 5000 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-inline-latency-100ms",
    name: "latency 100ms",
    category: "inline",
    fault_type: "latency",
    params: { delay_ms: 100 },
    created_at: "2026-04-01T10:00:00Z",
  },
  {
    id: "spec-network-blackhole",
    name: "blackhole",
    category: "network",
    fault_type: "blackhole",
    params: {},
    created_at: "2026-04-01T10:00:00Z",
  },
];

export async function listFaultSpecs(): Promise<FaultSpec[]> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 60));
    return [..._mockSpecs];
  }
  return apiClient.get("/api/v1/faults/specs", FaultSpecsList);
}
```

(Field names in the fixtures must match `FaultSpecSchema` in `src/types/api.ts` — if the schema requires extra fields like `description`, add them as empty strings.)

- [ ] **Step 3: Update the `rule-001`–`rule-008` fixtures (from Phase 1 Task 2 Step 4) to reference these spec IDs**

Look for `fault_spec_id: "spec-…"` in `_mockRules` and align with the IDs above.

### Task 22: Write the end-to-end test plan doc

**Files:** Create `docs/ops/testing-rules-end-to-end.md`

- [ ] **Step 1: Write the doc**

```markdown
# End-to-end testing the rules editor

Manual test plan for verifying `/rules` create/read/update/delete against the
live manteion-go backend on VM1.

## Prereqs

- Backend phases 0a + 0b deployed (see
  [`docs/superpowers/plans/2026-05-20-rules-editor-fix-backend.md`](../superpowers/plans/2026-05-20-rules-editor-fix-backend.md)).
- SSH tunnel open per [`docs/ops/connecting-to-vm1.md`](./connecting-to-vm1.md).
- A fault_spec exists. Seed one if none:

  ```sh
  curl -s -X POST http://localhost:9090/api/v1/faults/specs \
    -H 'Content-Type: application/json' \
    -d '{"id":"spec-e2e","name":"e2e-latency","category":"inline","fault_type":"latency","params":{"delay_ms":50}}'
  ```

## Create a fault_spec rule

1. Open `http://localhost:5173/rules` (live mode — no `VITE_USE_MOCK`).
2. Click **New rule**.
3. Fill: Name `e2e-fault_spec`, Service `productcatalog`, Action type `fault_spec`,
   Fault spec (from picker) `spec-e2e`, Mode `inline`, Injection point `ingress`,
   add label `{tenant: demo}` in the match builder, Match priority `50`.
4. Click **Save**.
5. Expect: rule appears in the list with priority 50, "fault_spec" target,
   "inline" mode.
6. Verify backend persistence:

   ```sh
   curl -s http://localhost:9090/api/v1/rules | jq '.[] | select(.name=="e2e-fault_spec")'
   ```

   Expect: full rule JSON with nested `action: { type: "fault_spec", fault_spec_id: "spec-e2e" }`.

## Create a cachebox rule

1. **New rule** → Name `e2e-cachebox`, Service `cartservice`, Action type `cachebox`.
2. Cachebox mode `replay`, Key strategy `exact_with_body`.
3. Mode `inline`, Match priority `40`, no injection point.
4. Save → expect "cachebox" target in the list.
5. Verify:

   ```sh
   curl -s http://localhost:9090/api/v1/rules | jq '.[] | select(.name=="e2e-cachebox") | .action'
   ```

   Expect: `{ "type": "cachebox", "cachebox": { "mode": "replay", "key_strategy": "exact_with_body" } }`.

## Match-expr round-trip

1. Open the cachebox rule from above.
2. Switch to the **Rego** tab in the match builder, paste:

   ```
   package atropos.rules
   default allow := true
   allow := false if { input.tenant == "blocked" }
   ```

3. Save. Reload the page.
4. Reopen the same rule. Confirm the rego text re-renders unchanged.
5. Verify backend has it:

   ```sh
   curl -s http://localhost:9090/api/v1/rules | jq '.[] | select(.name=="e2e-cachebox") | .match_expr'
   ```

## Update + delete

1. Open the fault_spec rule, change Match priority to 70, Save → table updates.
2. Delete the cachebox rule → it disappears from the list and GET /rules.

## Known limits

- The SDK still evaluates `match.labels{}` + `injection_point` only. `match_expr`
  is stored opaquely until SDK rego support ships.
- The action-type select includes `cachebox` per backend reality, even though
  Figma v1.1 deferred it to experiments.
```

### Task 23: Phase 6 commit

- [ ] **Step 1: Verify + commit**

```sh
./node_modules/.bin/tsc -b && ./node_modules/.bin/vitest run && \
git add src/lib/api/rules.ts src/lib/api/faults.ts \
        docs/ops/testing-rules-end-to-end.md && \
git commit -m "test(rules): extend mock fixtures; add e2e test plan doc

Adds cachebox and fault_composition examples to the mock rule list,
plus 3 mock FaultSpecs for the FaultSpecPicker to bind to in
VITE_USE_MOCK mode. Documents the manual end-to-end test plan
against the live VM1 backend in docs/ops/testing-rules-end-to-end.md.
" && \
git push origin develop
```

---

## Acceptance — full UI

After all phases ship:

- [ ] `pnpm test` (or `./node_modules/.bin/vitest run`) — green.
- [ ] `pnpm typecheck` — green.
- [ ] `biome check src` — clean.
- [ ] Mock mode (`VITE_USE_MOCK=true`): create/edit/delete rules of each action
      type; FaultSpecPicker shows the 3 mock specs.
- [ ] Live mode (backend phases 0a+0b deployed; SSH tunnel open): run the
      end-to-end plan in `docs/ops/testing-rules-end-to-end.md`.
- [ ] `docs/design/figma-changes.md` updated to retract the "cache-box removed
      from rules" claim per the team decision (one-paragraph edit; not a separate
      task in this plan but worth doing in the same branch).
