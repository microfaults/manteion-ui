# Rules Editor Fix — Backend Implementation Plan (manteion-go on VM1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the manteion-ui rules editor by (a) fixing `GET /api/v1/faults/specs` returning 500 due to a missing `config → params` column rename migration, and (b) adding a `match_expr` TEXT column to `rules` for forward-compatibility with the UI's OPA-rego match builder.

**Architecture:** Two independent backend changes on `/home/faults-lab/manteion-go` (VM1). Both ship as schema migrations + thin Go model/repo updates + a test. The `match_expr` column is opaque storage — the SDK continues to evaluate `match.labels{}` + `injection_point` only.

**Tech Stack:** Go 1.22+, `database/sql` + Postgres, custom migration framework (`internal/db/migrations.go`), `httptest`-based handler tests, `kubectl` + a Docker registry on VM1 (`localhost:5000`) for redeploy.

**Companion plan:** [`2026-05-20-rules-editor-fix-ui.md`](./2026-05-20-rules-editor-fix-ui.md) — the UI plan depends on these changes being deployed.

**Spec:** [`docs/superpowers/specs/2026-05-20-rules-editor-fix-design.md`](../specs/2026-05-20-rules-editor-fix-design.md) — §4 F1b + F2b.

---

## File structure

| Phase | File | Purpose |
|---|---|---|
| 0a | `internal/db/migrations.go` | Append migration #N: `ALTER TABLE fault_specs RENAME COLUMN config TO params`. |
| 0a | `internal/api/fault_handler_test.go` | Add regression test confirming `GET /faults/specs` returns `[]` (200) on empty. |
| 0b | `internal/db/migrations.go` | Append migration #N+1: `ALTER TABLE rules ADD COLUMN match_expr TEXT NOT NULL DEFAULT ''`. |
| 0b | `internal/model/rule.go` | Add `MatchExpr string \`json:"match_expr,omitempty"\`` to `Rule` struct. |
| 0b | `internal/store/rule_repo.go` | Add `match_expr` to INSERT, UPDATE, all SELECTs. |
| 0b | `internal/ruleconv/ruleconv.go` | Pass `MatchExpr` through to `CompiledRule` (new field). |
| 0b | `internal/store/rule_repo_test.go` | Roundtrip test: write a rule with `match_expr="x = 1"`, read it back. |

---

## How to work on VM1

All editing, building, testing, and committing happens on VM1 via SSH. Use the `mcp__ssh-manager__ssh_execute` tool (server: `vm1-server`). Each command is a separate `ssh_execute` call.

The repo is at `/home/faults-lab/manteion-go`, on branch `develop`, origin `git@git.ucsc.edu:microfaults/manteion-go.git`. Build/deploy pattern (verified during Phase 0a deployment 2026-05-21):

```sh
cd /home/faults-lab/manteion-go && /usr/local/go/bin/go test ./...   # full test suite

# Build with the PARENT directory as context (Dockerfile does `COPY atropos-go/`
# and `COPY manteion-go/` — needs the sibling tree). Tag both :dev and :latest.
cd /home/faults-lab && docker build -t localhost:5000/manteion:dev -f manteion-go/Dockerfile .
docker tag localhost:5000/manteion:dev localhost:5000/manteion:latest
docker push localhost:5000/manteion:dev
docker push localhost:5000/manteion:latest

# The deployment pins to :latest@sha256:<digest>. `kubectl rollout restart`
# alone re-pulls the SAME old digest and the migration won't run. You must
# explicitly point the deployment at the new digest:
NEW_DIGEST=$(docker inspect localhost:5000/manteion:latest --format='{{index .RepoDigests 0}}' | sed 's/.*@/@/')
kubectl set image deploy/manteion manteion=localhost:5000/manteion:latest${NEW_DIGEST}
kubectl rollout status deploy/manteion --timeout=120s
```

(Alternative: `skaffold run` if it's configured in the repo — check `skaffold.yaml`.)

Verify migrations actually ran:

```sh
kubectl exec deploy/manteion -- /manteion -version 2>/dev/null || true
kubectl exec $(kubectl get pod -l app=postgres -o name | head -1) -- \
  psql -U manteion -d manteion -c '\d fault_specs'
```

Commit pattern (per user direction: per-phase commits, no PRs):

```sh
cd /home/faults-lab/manteion-go
git add -A
git -c user.email=pmundra@ucsc.edu -c user.name='pmundra' commit -m "..."
git push origin develop
```

---

## Phase 0a · Fix `GET /api/v1/faults/specs` 500

**Root cause:** the live `fault_specs` table has column `config jsonb NOT NULL`, but `internal/store/fault_repo.go` references column `params` (in `INSERT`, `UPDATE`, and the SELECTs in `GetSpec` and `ListSpecs`). A previous commit changed the code to use `params` but the corresponding `RENAME COLUMN` migration was never added. Postgres returns `column "params" does not exist (SQLSTATE 42703)`; the handler turns that into HTTP 500.

**Confirm before starting:**

```sh
kubectl exec $(kubectl get pod -l app=postgres -o name | head -1) -- \
  psql -U manteion -d manteion -c '\d fault_specs' | grep -E 'config|params'
# Expected: only "config" appears, not "params"
```

### Task 1: Add the rename migration

**Files:** Modify `internal/db/migrations.go`

- [ ] **Step 1: Find the highest existing migration version**

```sh
grep -E '^\t\{[0-9]+,' /home/faults-lab/manteion-go/internal/db/migrations.go | tail -3
```

Note the highest `Version` integer — call it `N`. The new migration is `N+1`.

- [ ] **Step 2: Append the migration entry**

In `internal/db/migrations.go`, locate the closing `}` of the `migrations` slice and add as the LAST entry (before the closing brace):

```go
	{N+1, "rename fault_specs.config → params", `
ALTER TABLE fault_specs RENAME COLUMN config TO params;
`},
```

Replace `N+1` with the actual number (e.g. if the last was `{17, ...}`, this is `{18, ...}`). The migration framework is idempotent because each version runs once, but ALTER without `IF EXISTS` is fine here — failing loudly if the column is already named `params` would indicate state drift worth investigating.

- [ ] **Step 3: Run the repo tests to confirm nothing broke**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/db/... ./internal/store/...
```

Expected: PASS. Existing tests use an in-memory or test-DB harness that runs all migrations.

### Task 2: Add a handler regression test

**Files:** Modify `internal/api/fault_handler_test.go`

- [ ] **Step 1: Locate the existing `TestHandleListFaultSpecs` (line ~253) and add a sibling test below it**

```go
func TestHandleListFaultSpecs_EmptyReturnsArray(t *testing.T) {
	repo := newFakeFaultRepo()
	// No specs inserted.
	s := &Server{faultStore: repo, logger: discardLogger()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/faults/specs", s.handleListFaultSpecs)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/faults/specs", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	body := w.Body.String()
	if body != "[]\n" && body != "[]" {
		t.Errorf("body = %q, want %q", body, "[]")
	}
}
```

- [ ] **Step 2: Run the new test in isolation**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/api/ -run TestHandleListFaultSpecs_EmptyReturnsArray -v
```

Expected: PASS (the handler already has the nil→[] guard; this is a regression net for the future, not a fix for the bug).

### Task 3: Build, deploy, and verify against the live DB

- [ ] **Step 1: Build the image**

```sh
cd /home/faults-lab && docker build -t localhost:5000/manteion:dev -f manteion-go/Dockerfile manteion-go && docker push localhost:5000/manteion:dev
```

- [ ] **Step 2: Restart the deployment to pull the new image + run migrations**

```sh
kubectl rollout restart deploy/manteion
kubectl rollout status deploy/manteion --timeout=120s
```

- [ ] **Step 3: Verify the column was renamed**

```sh
kubectl exec $(kubectl get pod -l app=postgres -o name | head -1) -- \
  psql -U manteion -d manteion -c '\d fault_specs' | grep -E 'config|params'
```

Expected: only `params` appears. The `config` column is gone.

- [ ] **Step 4: Verify the endpoint now returns 200 + `[]`**

```sh
curl -s -w "\nHTTP %{http_code}\n" http://10.43.151.153:8080/api/v1/faults/specs
```

Expected: `[]` then `HTTP 200`.

### Task 4: Commit Phase 0a

- [ ] **Step 1: Stage + commit + push**

```sh
cd /home/faults-lab/manteion-go && git add internal/db/migrations.go internal/api/fault_handler_test.go && \
  git -c user.email=pmundra@ucsc.edu -c user.name='pmundra' commit -m "fix(faults): add missing config→params rename migration; test empty list

GET /api/v1/faults/specs was returning HTTP 500 because the live
fault_specs table still has 'config jsonb NOT NULL' but the repo
code (INSERT/UPDATE/SELECT) references 'params'. The column rename
was applied to code but not as a migration. Add migration N+1 to
RENAME COLUMN config TO params, plus a handler test confirming
empty-list returns 200 [].
" && \
  git push origin develop
```

---

## Phase 0b · Add `match_expr` column to `rules`

**Purpose:** Forward-compatibility for the UI's OPA-rego match builder (UI spec §4 F1b). Backend stores the raw rego text as opaque data; **no validation, no evaluation**. The SDK continues to evaluate `match.labels{}` + `injection_point`.

### Task 5: Add the migration

**Files:** Modify `internal/db/migrations.go`

- [ ] **Step 1: Find the highest version now (will be one above Phase 0a's)**

```sh
grep -E '^\t\{[0-9]+,' /home/faults-lab/manteion-go/internal/db/migrations.go | tail -3
```

- [ ] **Step 2: Append the migration**

```go
	{N+2, "add rules.match_expr for opa-rego forward compat", `
ALTER TABLE rules ADD COLUMN IF NOT EXISTS match_expr TEXT NOT NULL DEFAULT '';
`},
```

- [ ] **Step 3: Run migration unit tests**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/db/...
```

Expected: PASS.

### Task 6: Add `MatchExpr` to the `Rule` model

**Files:** Modify `internal/model/rule.go`

- [ ] **Step 1: Add the field**

Find the `type Rule struct` block (around line 18) and add `MatchExpr` after `Mode`:

```go
type Rule struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Service     string        `json:"service"`
	Enabled     bool          `json:"enabled"`
	Priority    int           `json:"priority"`
	Match       MatchCriteria `json:"match"`
	Action      RuleAction    `json:"action"`
	Mode        string        `json:"mode"`
	MatchExpr   string        `json:"match_expr,omitempty"`   // ← NEW. Opaque OPA-rego text. Not validated, not evaluated by SDK.
	StartPolicy string        `json:"start_policy,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
}
```

No validation rule needed — empty string is valid (default).

- [ ] **Step 2: Verify model tests still pass**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/model/...
```

Expected: PASS.

### Task 7: Update `rule_repo` to round-trip `match_expr`

**Files:** Modify `internal/store/rule_repo.go`

- [ ] **Step 1: Update the INSERT (around line 37)**

```go
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO rules (id, name, service, enabled, priority, injection_point,
			labels, action_type, fault_spec_id, fault_composition_id,
			cachebox_mode, cachebox_key_strategy, mode, start_policy, match_expr,
			created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
		rule.ID, rule.Name, rule.Service, rule.Enabled, rule.Priority,
		nullString(rule.Match.InjectionPoint), labels,
		rule.Action.Type, nullString(rule.Action.FaultSpecID), nullString(rule.Action.FaultCompID),
		cacheboxMode, cacheboxKeyStrategy,
		rule.Mode, rule.StartPolicy, rule.MatchExpr,
		rule.CreatedAt, rule.UpdatedAt,
	)
```

**Verify before editing** that the existing column list and `$N` count actually match — the snippet above is approximate; do not blindly overwrite. Read the file first, count the existing columns, add `match_expr` and one extra `$N`. The key change is: one new column at the end, one new placeholder, one new arg in the VALUES.

- [ ] **Step 2: Update the UPDATE (around line 94) — same pattern**

Append `, match_expr=$M` to the SET clause and append `rule.MatchExpr` to the args.

- [ ] **Step 3: Update all three SELECTs (List, Get, ForService — around lines 73, 132, 147)**

Append `, match_expr` to the column list. In `scanRule` (around line 198) or wherever rows are scanned, append `&rule.MatchExpr` to the `rows.Scan(...)` argument list.

- [ ] **Step 4: Run the repo tests**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/store/...
```

Expected: PASS. If a scan-count mismatch panic occurs, you missed a SELECT or a scan.

### Task 8: Pass `MatchExpr` through `ruleconv` to `CompiledRule`

**Files:** Modify `internal/ruleconv/ruleconv.go`

- [ ] **Step 1: Add `MatchExpr` to `CompiledRule`**

Find the `CompiledRule` struct (around line 26) and add:

```go
type CompiledRule struct {
	Name           string               `json:"name"`
	InjectionPoint string               `json:"injection_point,omitempty"`
	Labels         map[string]string    `json:"labels,omitempty"`
	Mode           string               `json:"mode"`
	Priority       int                  `json:"priority"`
	StartPolicy    string               `json:"start_policy,omitempty"`
	MatchExpr      string               `json:"match_expr,omitempty"`  // ← NEW. Forwarded to SDKs; currently ignored by atropos-go's evaluator.
	Fault          *CompiledFault       `json:"fault,omitempty"`
	Composition    *CompiledComposition `json:"composition,omitempty"`
	CacheBox       *CompiledCacheBox    `json:"cachebox,omitempty"`
}
```

- [ ] **Step 2: Wire `MatchExpr` from `Rule` into `CompiledRule`**

Find the conversion function (around line 100-126, builds `CompiledRule` from `*model.Rule`) and add the assignment:

```go
compiled := &CompiledRule{
	Name:           r.Name,
	InjectionPoint: r.Match.InjectionPoint,
	Labels:         r.Match.Labels,
	Mode:           r.Mode,
	Priority:       r.Priority,
	StartPolicy:    r.StartPolicy,
	MatchExpr:      r.MatchExpr,   // ← NEW
	// ... Fault/Composition/CacheBox switch unchanged
}
```

- [ ] **Step 3: Run ruleconv tests**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/ruleconv/...
```

Expected: PASS.

### Task 9: Add a round-trip test for `match_expr`

**Files:** Modify `internal/store/rule_repo_test.go`

- [ ] **Step 1: Find an existing CreateRule/GetRule test for shape**

```sh
grep -n 'func TestRuleRepo_\|func TestCreate.*Rule' /home/faults-lab/manteion-go/internal/store/rule_repo_test.go | head -5
```

Pick the closest matching test to copy the boilerplate (DB setup, repo construction).

- [ ] **Step 2: Add the test**

```go
func TestRuleRepo_MatchExprRoundTrip(t *testing.T) {
	repo := newTestRuleRepo(t)   // or whatever helper the existing tests use
	rule := &model.Rule{
		ID: "rule-mx", Name: "match-expr-rt", Service: "svc",
		Enabled: true, Priority: 50, Mode: "inline",
		Action:    model.RuleAction{Type: "fault_spec", FaultSpecID: "spec-1"},
		Match:     model.MatchCriteria{Labels: map[string]string{"k": "v"}},
		MatchExpr: `package atropos.rules
default allow := false`,
	}
	// Insert a fault_spec FK target first if the test harness requires it.
	if err := repo.Create(context.Background(), rule); err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := repo.Get(context.Background(), "rule-mx")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.MatchExpr != rule.MatchExpr {
		t.Errorf("MatchExpr roundtrip mismatch:\n got = %q\nwant = %q", got.MatchExpr, rule.MatchExpr)
	}
}
```

If the test harness needs a fault_spec to exist first, look at how the closest existing CreateRule test sets that up and copy.

- [ ] **Step 3: Run the new test**

```sh
cd /home/faults-lab/manteion-go && go test ./internal/store/ -run TestRuleRepo_MatchExprRoundTrip -v
```

Expected: PASS.

### Task 10: Build, deploy, verify

- [ ] **Step 1: Full build + redeploy**

```sh
cd /home/faults-lab && \
  docker build -t localhost:5000/manteion:dev -f manteion-go/Dockerfile manteion-go && \
  docker push localhost:5000/manteion:dev && \
  kubectl rollout restart deploy/manteion && \
  kubectl rollout status deploy/manteion --timeout=120s
```

- [ ] **Step 2: Verify the `match_expr` column exists**

```sh
kubectl exec $(kubectl get pod -l app=postgres -o name | head -1) -- \
  psql -U manteion -d manteion -c '\d rules' | grep match_expr
```

Expected: `match_expr | text | | not null | ''::text`

- [ ] **Step 3: End-to-end POST with `match_expr`**

```sh
# First create a fault_spec so the FK passes:
curl -s -X POST http://10.43.151.153:8080/api/v1/faults/specs \
  -H 'Content-Type: application/json' \
  -d '{"id":"spec-test","name":"test","category":"inline","fault_type":"latency","params":{"delay_ms":100}}' -w "\nHTTP %{http_code}\n"

# Then create a rule with a match_expr:
curl -s -X POST http://10.43.151.153:8080/api/v1/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"mx-test","service":"productcatalog","enabled":true,"priority":50,
    "mode":"inline",
    "match":{"injection_point":"ingress","labels":{"k":"v"}},
    "action":{"type":"fault_spec","fault_spec_id":"spec-test"},
    "match_expr":"package atropos.rules\nallow := true"
  }' -w "\nHTTP %{http_code}\n" | tee /tmp/rule.json

# Read it back; confirm match_expr round-trips:
curl -s http://10.43.151.153:8080/api/v1/rules | jq '.[] | select(.name=="mx-test") | .match_expr'
```

Expected: HTTP 201 on create, GET returns the rule with `match_expr` text intact.

### Task 11: Commit Phase 0b

- [ ] **Step 1: Commit + push**

```sh
cd /home/faults-lab/manteion-go && \
  git add internal/db/migrations.go internal/model/rule.go internal/store/rule_repo.go internal/store/rule_repo_test.go internal/ruleconv/ruleconv.go && \
  git -c user.email=pmundra@ucsc.edu -c user.name='pmundra' commit -m "feat(rules): add match_expr column for forward-compat OPA-rego storage

Adds match_expr TEXT (default '') to rules. Stored opaque — the SDK
continues to evaluate match.labels + injection_point only; match_expr
is forwarded through CompiledRule for future SDK rego support.

Companion to manteion-ui's OPA-rego match builder (see
manteion-ui/docs/superpowers/specs/2026-05-20-rules-editor-fix-design.md
§4 F1b). No semantic change to existing rule evaluation.
" && \
  git push origin develop
```

---

## Verification — full backend acceptance

After both phases are deployed:

- [ ] `curl -s http://10.43.151.153:8080/api/v1/faults/specs` returns HTTP 200 + `[]` (or a populated list).
- [ ] `POST /api/v1/rules` with the complete action envelope succeeds (HTTP 201), assuming a valid `fault_spec_id` FK.
- [ ] `match_expr` field round-trips through POST → GET unchanged.
- [ ] All Go tests pass: `cd /home/faults-lab/manteion-go && go test ./...`
- [ ] No regressions in the SDK rule-poll path: hit `GET /api/v1/sdk/rules` and verify the response still has `labels` and `injection_point`. New `match_expr` field is present but SDKs ignore unknown fields.

Once the backend is shipped and verified, switch to [`2026-05-20-rules-editor-fix-ui.md`](./2026-05-20-rules-editor-fix-ui.md).
