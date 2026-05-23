/**
 * API types — hand-written Zod schemas until manteion-go ships an OpenAPI spec.
 * Keep these in sync with `manteion-go/internal/model/*.go`.
 *
 * Current backend reality (see docs/api/api-needed.md for the full list):
 *  - /api/v1/rules          CRUD (RuleRepo)
 *  - /api/v1/sdk/instances  read-only list (SDKRepo)
 *  - /api/v1/sdk/rules      version-based poll for atropos SDKs
 *  - /api/v1/zeus/*         blind passthrough to zeus-go
 *
 * Many screens below reference endpoints that DO NOT yet exist. Those are
 * documented in docs/api/api-needed.md and scoped under "NEW" comments here.
 */
import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────

export const Timestamp = z.string(); // RFC 3339
export type Timestamp = z.infer<typeof Timestamp>;

// ─── Rule ─────────────────────────────────────────────────────────────

/** Match-criteria AST used by the in-UI rule builder.
 *  Compiles to rego via `src/lib/rego/compile.ts`. See docs/api/api-needed.md §B.3#2.
 */
export const MatchOperatorSchema = z.enum([
  "eq",
  "neq",
  "in",
  "not_in",
  "matches",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
]);
export type MatchOperator = z.infer<typeof MatchOperatorSchema>;

export interface MatchLeaf {
  kind: "leaf";
  field: string;
  op: MatchOperator;
  value: string | number | boolean | string[] | number[];
}

export interface MatchGroup {
  kind: "group";
  combinator: "and" | "or" | "not";
  children: MatchNode[];
}

export type MatchNode = MatchLeaf | MatchGroup;

// zod counterpart — recursive via lazy
export const MatchLeafSchema: z.ZodType<MatchLeaf> = z.object({
  kind: z.literal("leaf"),
  field: z.string(),
  op: MatchOperatorSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
});

export const MatchGroupSchema: z.ZodType<MatchGroup> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    combinator: z.enum(["and", "or", "not"]),
    children: z.array(MatchNodeSchema),
  }),
);

export const MatchNodeSchema: z.ZodType<MatchNode> = z.lazy(() =>
  z.union([MatchLeafSchema, MatchGroupSchema]),
);

// ─── Rule action (discriminated union per backend internal/model/rule.go) ───

export const CacheBoxConfigSchema = z.object({
  mode: z.enum(["passthrough", "replay", "replay_with_delay"]),
  key_strategy: z.enum(["exact", "exact_with_host", "exact_with_body"]),
});
export type CacheBoxConfig = z.infer<typeof CacheBoxConfigSchema>;

export const RuleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fault_spec"), fault_spec_id: z.string().min(1) }),
  z.object({ type: z.literal("fault_composition"), fault_composition_id: z.string().min(1) }),
  z.object({ type: z.literal("cachebox"), cachebox: CacheBoxConfigSchema }),
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;

export const ModeSchema = z.enum(["inline", "background"]);
export const StartPolicySchema = z.enum(["deduplicate_by_rule", "always_start"]);
export const InjectionPointSchema = z.enum(["", "ingress", "egress", "transient", "custom"]);

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
  match_expr: z.string().optional(),
  match_ast: MatchNodeSchema.optional(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Rule = z.infer<typeof RuleSchema>;

// ─── SDKInstance ──────────────────────────────────────────────────────

export const SDKInstanceSchema = z.object({
  id: z.string(),
  service: z.string(),
  version: z.string().optional(),
  address: z.string().optional(),
  registered_at: Timestamp,
  last_poll_at: Timestamp.optional(),
  /** Computed server-side from last_poll_at. */
  status: z.enum(["alive", "stale", "dead"]).optional(),
});
export type SDKInstance = z.infer<typeof SDKInstanceSchema>;

// ─── Fault ────────────────────────────────────────────────────────────

export const FaultCategorySchema = z.enum(["inline", "network", "resource"]);
export type FaultCategory = z.infer<typeof FaultCategorySchema>;

// Config sub-schemas per category/type — kept loose (passthrough) for API
// validation; the UI uses typed helpers in the fault-editor component.

// Inline
export interface InlineLatencyConfig {
  latency_ms: number;
  jitter_ms: number;
}
export interface InlineErrorConfig {
  status_code: number;
  message?: string;
}
export type InlineHangConfig = Record<string, never>;

// Network — all network faults share proxy fields (direction, scope, listen, upstream)
export interface NetworkProxyConfig {
  direction: "upstream" | "downstream";
  scope?: number;
  listen?: string;
  upstream?: string;
}
export interface NetworkBlackholeConfig extends NetworkProxyConfig {}
export interface NetworkRetransmitDelayConfig extends NetworkProxyConfig {
  rate: number;
  delay: string;
  reset_threshold: number;
}
export interface NetworkRstConfig extends NetworkProxyConfig {
  interval_s: number;
}
export interface NetworkThrottleConfig extends NetworkProxyConfig {
  rate_kbps: number;
}
export interface NetworkLatencyConfig extends NetworkProxyConfig {
  latency_ms: number;
  jitter_ms: number;
}
export interface NetworkDripConfig extends NetworkProxyConfig {
  rate_bytes_s: number;
}

// Resource
export interface ResourceCpuConfig {
  target_load: number;
  window: string;
}
export interface ResourceMemoryConfig {
  target_load: number;
  chunk_size: number;
  thrashing?: boolean;
  thrash_workers?: number;
}
export interface ResourceDiskConfig {
  write_rate: number;
  max_disk_usage: number;
  chunk_size: number;
  path?: string;
}
export interface ResourceIoConfig {
  read_rate: number;
  file_size: number;
  file_count: number;
  workers: number;
  path?: string;
  mode: "read" | "write" | "readwrite";
}

export type FaultConfig =
  | InlineLatencyConfig
  | InlineErrorConfig
  | InlineHangConfig
  | NetworkBlackholeConfig
  | NetworkRetransmitDelayConfig
  | NetworkRstConfig
  | NetworkThrottleConfig
  | NetworkLatencyConfig
  | NetworkDripConfig
  | ResourceCpuConfig
  | ResourceMemoryConfig
  | ResourceDiskConfig
  | ResourceIoConfig;

export const FaultSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: FaultCategorySchema,
  fault_type: z.string(),
  params: z.unknown(),
  description: z.string().optional(),
  duration_ms: z.number().int().optional(),
  ramp_up_ms: z.number().int().optional(),
  ramp_down_ms: z.number().int().optional(),
  created_at: Timestamp,
});
export type FaultSpec = z.infer<typeof FaultSpecSchema>;

// ─── Experiment (NEW — not yet exposed) ───────────────────────────────

export const ExperimentStatusSchema = z.enum([
  "planned",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

export const PhaseNameSchema = z.enum([
  "baseline",
  "isolation-1a",
  "isolation-1b",
  "isolation-2a",
  "isolation-2b",
  "combined",
]);
export type PhaseName = z.infer<typeof PhaseNameSchema>;

export const PhaseStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/** Denormalised phase summary used by the experiments list hover card
 *  and the experiment detail phases tab. */
export const PhaseSummarySchema = z.object({
  name: PhaseNameSchema,
  status: PhaseStatusSchema,
  workflow_id: z.string().optional(),
  dataset_id: z.string().optional(),
  vus: z.number().int().optional(),
  duration_ms: z.number().int().optional(),
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
  /** Services frozen via cache-box (per-experiment). */
  frozen_services: z
    .array(
      z.object({
        service: z.string(),
        mode: z.enum(["passthrough", "replay", "replay_with_delay"]),
      }),
    )
    .default([]),
  /** Rules applied during this phase (copies of manteion rules). */
  applied_rules: z
    .array(
      z.object({
        rule_id: z.string(),
        name: z.string(),
        target_summary: z.string(),
      }),
    )
    .default([]),
  /** Latency summary — present for running and completed phases. */
  metrics: z
    .object({
      p50_us: z.number().optional(),
      p95_us: z.number().optional(),
      p99_us: z.number().optional(),
      rps: z.number().optional(),
      error_rate: z.number().optional(),
      baseline_p99_us: z.number().optional(),
    })
    .optional(),
});
export type PhaseSummary = z.infer<typeof PhaseSummarySchema>;

export const ExperimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  hypothesis: z.string().optional(),
  status: ExperimentStatusSchema,
  workflow_ids: z.array(z.string()).default([]),
  targeted_services: z.array(z.string()).default([]),
  phases: z.array(PhaseSummarySchema).default([]),
  created_by: z.string().optional(),
  created_at: Timestamp,
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

// ─── Workflow (DSL v2 definition; manteion-owned) ──────────────────────

/** Bare-bones list-row shape served by GET /api/v1/workflows. Steps and
 *  thresholds are omitted from the list payload — fetch
 *  /api/v1/workflows/{id} for the tree. */
export const WorkflowListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  targets: z.array(z.string()).default([]),
  estimated_rps_per_vu: z.number().default(0),
  /** Precomputed by manteion-go so the workflows list doesn't need the steps tree. */
  request_node_count: z.number().int().default(0),
  created_at: Timestamp,
  updated_at: Timestamp.optional(),
});
export type WorkflowListItem = z.infer<typeof WorkflowListItemSchema>;

/** Full payload served by GET /api/v1/workflows/{id} and returned by POST.
 *  `steps` is the DSL v2 tree — typed as `unknown` here and validated by the
 *  client-side WorkflowNode parser in lib/workflow-types.ts.
 *
 *  Storage split: manteion serves the *definition*; zeus serves
 *  *execution* state. The detail page fans out two parallel queries. */
export const WorkflowSchema = WorkflowListItemSchema.extend({
  steps: z.unknown(),
  thresholds: z.unknown().optional(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

// ─── Dataset ───────────────────────────────────────────────────────────
// Zeus-owned today, reached via the /api/v1/zeus/datasets proxy. `source`
// holds zeus's values ("upload" | "inline" | "cache_box_dump"); kept as a
// plain string (not a strict enum) so the planned rename to "traffic_capture"
// — and manteion taking ownership — don't break parsing. TTL is exposed as
// `ttl_s` (seconds), not a duration string.

/** List-row summary (GET /api/v1/datasets → { datasets: [...] }). No pools. */
export const DatasetListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  size_bytes: z.number().default(0),
  ttl_s: z.number().int().default(0),
  created_at: Timestamp,
});
export type DatasetListItem = z.infer<typeof DatasetListItemSchema>;

/** Per-pool stats on the detail payload. */
export const PoolStatsSchema = z.object({
  row_count: z.number().int().default(0),
  size_bytes: z.number().default(0),
  fields: z.array(z.string()).default([]),
});
export type PoolStats = z.infer<typeof PoolStatsSchema>;

/** Full dataset metadata (GET /api/v1/datasets/{id}). `pool_stats` is keyed
 *  by pool name. Rows are fetched separately via the sample endpoint. */
export const DatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  pool_stats: z.record(PoolStatsSchema).default({}),
  size_bytes: z.number().default(0),
  ttl_s: z.number().int().default(0),
  created_at: Timestamp,
});
export type Dataset = z.infer<typeof DatasetSchema>;

/** Sample rows from one pool (GET /api/v1/datasets/{id}/sample?pool=…). */
export const DatasetSampleSchema = z.object({
  pool: z.string(),
  rows: z.array(z.record(z.unknown())).default([]),
});
export type DatasetSample = z.infer<typeof DatasetSampleSchema>;

// ─── Catalog endpoint (workflow builder picker) ────────────────────────

/** Live SDK-route inventory entry. Aggregated server-side from
 *  sdk_instances.routes by /api/v1/catalog/endpoints — see
 *  manteion-go/internal/api/catalog_handler.go. */
export const CatalogEndpointSchema = z.object({
  id: z.string(),
  service: z.string(),
  method: z.string(),
  path: z.string(),
  description: z.string().optional(),
  /** Catalog ids of prerequisite endpoints (e.g. POST /cart before
   *  /checkout). The picker auto-expands the user's selection in
   *  dependency-first order so the resulting workflow runs end-to-end. */
  depends_on: z.array(z.string()).default([]),
});
export type CatalogEndpoint = z.infer<typeof CatalogEndpointSchema>;

/** Envelope returned by GET /api/v1/catalog/endpoints. `hint` is set
 *  only when `data` is empty — gives the picker a human-readable empty
 *  state (e.g. "No SDK instances have polled in the last 2 minutes"). */
export const CatalogResponseSchema = z.object({
  data: z.array(CatalogEndpointSchema).default([]),
  hint: z.string().optional(),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

// ─── Pagination envelope ───────────────────────────────────────────────

export const PageSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type Page = z.infer<typeof PageSchema>;

/** Wrap with PageEnvelope(MySchema) to build a typed list response.
 *  Matches manteion-go's internal/api/pagination.go envelope shape. */
export const PageEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item).default([]),
    page: PageSchema,
  });

// ─── Run (NEW — minimum viable fields for SSE tail UI) ────────────────

export const RunSchema = z.object({
  id: z.string(),
  experiment_id: z.string().optional(),
  workflow_id: z.string(),
  phase: PhaseNameSchema.optional(),
  status: z.enum(["pending", "running", "completed", "failed", "stopped"]),
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
});
export type Run = z.infer<typeof RunSchema>;
