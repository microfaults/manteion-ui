# End-to-end testing the rules editor

Manual test plan for verifying `/rules` create/read/update/delete against the
live manteion-go backend on VM1.

## Prereqs

- Backend phases 0a + 0b deployed (see
  [`docs/superpowers/plans/2026-05-20-rules-editor-fix-backend.md`](../superpowers/plans/2026-05-20-rules-editor-fix-backend.md)).
  Verify: `curl -s http://localhost:9090/api/v1/faults/specs` returns `200 []` (or a list).
- SSH tunnel open per [`docs/ops/connecting-to-vm1.md`](./connecting-to-vm1.md).
- At least one fault_spec exists. Seed one if none:

  ```sh
  curl -s -X POST http://localhost:9090/api/v1/faults/specs \
    -H 'Content-Type: application/json' \
    -d '{"id":"spec-e2e","name":"e2e-latency","category":"inline","fault_type":"latency","config":{"latency_ms":50,"jitter_ms":0}}'
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
2. Delete the cachebox rule → it disappears from the list and `GET /rules`.

## Known limits

- The SDK still evaluates `match.labels{}` + `injection_point` only. `match_expr`
  is stored opaquely until SDK rego support ships.
- The action-type select includes `cachebox` per backend reality, even though
  Figma v1.1 had deferred it to experiments.
