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

/** Detail payload — superset of SDKInstance returned by
 *  GET /api/v1/sdk/instances/{id}. See docs/api/api-needed.md §B.2. */
export const SDKInstanceDetailSchema = SDKInstanceSchema.extend({
  last_error: z.string().optional(),
  last_rule_version_acked: z.number().int().optional(),
  active_rule_ids: z.array(z.string()).default([]),
  recent_run_ids: z.array(z.string()).default([]),
});
export type SDKInstanceDetail = z.infer<typeof SDKInstanceDetailSchema>;

/** POST /api/v1/sdk/instances/{id}/kill-switch response envelope. */
export const KillSwitchResultSchema = z.object({
  disabled_rule_ids: z.array(z.string()).default([]),
  at: Timestamp,
});
export type KillSwitchResult = z.infer<typeof KillSwitchResultSchema>;

/** POST /api/v1/sdk/instances/{id}/cachebox response envelope. */
export const CacheBoxModeResultSchema = z.object({
  rule_id: z.string(),
  at: Timestamp,
});
export type CacheBoxModeResult = z.infer<typeof CacheBoxModeResultSchema>;

// ─── Fault ────────────────────────────────────────────────────────────

export const FaultCategorySchema = z.enum(["inline", "network", "resource"]);
export type FaultCategory = z.infer<typeof FaultCategorySchema>;

/** Network-category envelope: selects which traffic the toxic applies to.
 *  Lives OUTSIDE `params` (schema epoch 2) — `target` is the logical
 *  upstream name, `scope` the fraction of connections (0 = all). */
export const NetworkEnvelopeSchema = z.object({
  target: z.string().optional(),
  direction: z.enum(["upstream", "downstream"]).optional(),
  scope: z.number().optional(),
});
export type NetworkEnvelope = z.infer<typeof NetworkEnvelopeSchema>;

// ─── Fault catalog (GET /api/v1/faults/catalog) ────────────────────────
// Single source of truth for the supported fault vocabulary and per-type
// param field specs. Served from manteion-go/internal/faultcatalog, which
// mirrors atropos-go/faultparams — the same schemas the SDK decoders
// consume, so forms rendered from this catalog can't drift from the wire.

export const FaultParamTypeSchema = z.enum(["duration", "int", "float", "bool", "string", "enum"]);
export type FaultParamType = z.infer<typeof FaultParamTypeSchema>;

/** One params field, as the UI should render it. `duration` values are Go
 *  duration strings ("250ms", "1.5s"); byte sizes and rates are plain ints. */
export const FaultParamSpecSchema = z.object({
  name: z.string(),
  type: FaultParamTypeSchema,
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type FaultParamSpec = z.infer<typeof FaultParamSpecSchema>;

export const FaultCatalogEntrySchema = z.object({
  category: FaultCategorySchema,
  fault_type: z.string(),
  description: z.string().default(""),
  network_required: z.boolean().default(false),
  // Param-less types (e.g. network/blackhole) may serialize as null.
  params: z
    .array(FaultParamSpecSchema)
    .nullish()
    .transform((v) => v ?? []),
});
export type FaultCatalogEntry = z.infer<typeof FaultCatalogEntrySchema>;

/** Envelope returned by GET /api/v1/faults/catalog. */
export const FaultCatalogResponseSchema = z.object({
  catalog: z.array(FaultCatalogEntrySchema).default([]),
});
export type FaultCatalogResponse = z.infer<typeof FaultCatalogResponseSchema>;

export const FaultSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: FaultCategorySchema,
  fault_type: z.string(),
  host: z.string().optional(),
  network: NetworkEnvelopeSchema.optional(),
  /** Type-specific params blob. Strictly validated server-side against the
   *  fault catalog (unknown fields and out-of-range values 400). */
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

/** Free-form phase label (e.g. "baseline", "isolation-productcatalog").
 *  The backend enforces UNIQUE(experiment_id, name) — it is not an enum;
 *  the old baseline/isolation/combined typology survives only as a naming
 *  convention (see manteion-go internal/model/experiment.go). */
export const PhaseNameSchema = z.string();
export type PhaseName = z.infer<typeof PhaseNameSchema>;

/** Mirrors manteion-go internal/model/enums.go PhaseStatusValues.
 *  `draining` = the recording phase is finishing while frozen services flush
 *  their cache-box entries; still in flight from the operator's point of view. */
export const PhaseStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "skipped",
  "draining",
]);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/** Statuses that are still in flight (poll these). */
export const ACTIVE_PHASE_STATUSES: ReadonlySet<PhaseStatus> = new Set([
  "running",
  "draining",
  "paused",
]);
/** Statuses after which results (if any) are final. */
export const TERMINAL_PHASE_STATUSES: ReadonlySet<PhaseStatus> = new Set([
  "completed",
  "failed",
  "skipped",
]);

/** Go serialises a nil slice as `null`; every list field on a phase read-out
 *  may arrive that way (composePhaseDetail leaves `workflows` nil when a phase
 *  has no rows). Normalise to `[]` at the boundary. */
const arrayOrEmpty = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => v ?? []);

export const CacheBoxModeSchema = z.enum(["passthrough", "replay", "replay_with_delay"]);
export type CacheBoxMode = z.infer<typeof CacheBoxModeSchema>;

/** A frozen service — mirrors manteion-go internal/model.CacheBoxConfig as
 *  stored in the phase's frozen_services JSONB (distinct from a rule's
 *  cachebox action, CacheBoxConfigSchema above).
 *  Reads are tolerant — the backend emits "" for defaulted strings; the create
 *  DTO (experimentsApi.createExperiment) is the strict side. */
export const FrozenServiceSchema = z.object({
  service: z.string(),
  mode: CacheBoxModeSchema,
  /** meta-trace-id pattern; "" = all traffic. */
  workflow_scope: z.string().optional(),
  /** "" on the wire means the server default (canonical_v2). */
  key_strategy: z.string().optional(),
  key_headers: z.array(z.string()).optional(),
  mutation_policy: z.string().optional(),
  safe_methods: z.array(z.string()).optional(),
  synthetic_delay: z
    .object({ p50_us: z.number(), p95_us: z.number(), p99_us: z.number() })
    .passthrough()
    .optional(),
  warmup_duration_ms: z.number().optional(),
  cache_ttl_ms: z.number().optional(),
});
export type FrozenService = z.infer<typeof FrozenServiceSchema>;

/** Per-(phase, workflow) attack config row — mirrors
 *  manteion-go/internal/model.PhaseWorkflow. Workflows attach to experiments
 *  per-phase only (schema epoch 2); the experiment-level workflow list is
 *  derived client-side from these rows. `zeus_run_id` (k6 workflow run) and
 *  `zeus_attack_id` (vegeta attack) are stamped by the orchestrator once the
 *  phase starts; either may be absent. */
export const PhaseWorkflowSchema = z.object({
  phase_id: z.string().optional(),
  workflow_id: z.string(),
  vus: z.number().int().optional(),
  rate_rps: z.number().optional(),
  duration_sec: z.number().int().optional(),
  target_url: z.string().optional(),
  target_method: z.string().optional(),
  /** Per-workflow dataset (lands with manteion-go B5; tolerated now). */
  dataset_id: z.string().optional(),
  zeus_attack_id: z.string().optional(),
  zeus_run_id: z.string().optional(),
});
export type PhaseWorkflow = z.infer<typeof PhaseWorkflowSchema>;

/** One phase as served inside experiment detail and by
 *  GET /api/v1/experiments/{id}/phases/{phaseId} (manteion-go `phaseDetail`:
 *  model.ExperimentPhase + `workflows[]` + `rule_ids[]`). There are NO inline
 *  metrics — results live at …/phases/{phaseId}/results once the phase is
 *  terminal — and no duration field: derive it from the timestamps
 *  (see lib/phase-metrics.phaseDurationMs). */
export const PhaseSummarySchema = z.object({
  id: z.string(),
  experiment_id: z.string().optional(),
  name: PhaseNameSchema,
  position: z.number().int().optional(),
  status: PhaseStatusSchema,
  /** Per-(phase, workflow) attack configs attached to this phase. */
  workflows: arrayOrEmpty(PhaseWorkflowSchema),
  /** Services frozen via cache-box during this phase. */
  frozen_services: arrayOrEmpty(FrozenServiceSchema),
  persist_cache: z.boolean().optional(),
  /** Bare rule references (phase_rules join). Resolve names from the rules cache. */
  rule_ids: arrayOrEmpty(z.string()),
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
  /** Why the phase failed — populated once manteion-go B8 ships; tolerated now. */
  failure_reason: z.string().optional(),
});
export type PhaseSummary = z.infer<typeof PhaseSummarySchema>;

export const ExperimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  hypothesis: z.string().optional(),
  status: ExperimentStatusSchema,
  // NOTE: no workflow_ids — workflows attach per-phase (schema epoch 2).
  // Derive the experiment-level list via experimentsApi.workflowIdsForExperiment.
  targeted_services: z.array(z.string()).default([]),
  phases: z.array(PhaseSummarySchema).default([]),
  created_by: z.string().optional(),
  created_at: Timestamp,
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
  /** Why the experiment failed — populated once manteion-go B8 ships; tolerated now. */
  failure_reason: z.string().optional(),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

// ─── Phase results (written once at phase finish by orchestrator/harvest.go) ──

/** Mirrors model.PhaseWorkflowResult. Latencies are microseconds. */
export const PhaseWorkflowResultSchema = z.object({
  phase_id: z.string(),
  workflow_id: z.string(),
  request_count: z.number(),
  error_count: z.number(),
  error_rate: z.number(),
  throughput_rps: z.number(),
  latency_p50_us: z.number(),
  latency_p95_us: z.number(),
  latency_p99_us: z.number(),
  latency_p999_us: z.number().optional(),
  computed_at: Timestamp.optional(),
});
export type PhaseWorkflowResult = z.infer<typeof PhaseWorkflowResultSchema>;

/** Mirrors model.PhaseServiceLatency. */
export const PhaseServiceLatencySchema = z.object({
  phase_id: z.string(),
  service: z.string(),
  workflow_id: z.string().optional(),
  latency_p50_us: z.number(),
  latency_p95_us: z.number(),
  latency_p99_us: z.number(),
  request_count: z.number(),
  computed_at: Timestamp.optional(),
});
export type PhaseServiceLatency = z.infer<typeof PhaseServiceLatencySchema>;

/** Mirrors model.PhaseServiceCache — cache-box fidelity per frozen service. */
export const PhaseServiceCacheSchema = z.object({
  phase_id: z.string(),
  service: z.string(),
  cache_hit_rate: z.number(),
  cache_exact_match: z.number().optional(),
  cache_staleness: z.number().optional(),
  /** hits + misses served by the frozen service (disambiguates 0 hit-rate). */
  request_count: z.number().optional(),
  recorded_entry_count: z.number().optional(),
  computed_at: Timestamp.optional(),
});
export type PhaseServiceCache = z.infer<typeof PhaseServiceCacheSchema>;

/** Mirrors model.PhaseVerdict (INV-6 fidelity verdict; absent on baselines). */
export const PhaseVerdictSchema = z.object({
  verdict: z.string(),
  reasons: z.array(z.string()).optional(),
  collision_rate: z.number().optional(),
  replay_age_max_ms: z.number().optional(),
  replay_age_mean_ms: z.number().optional(),
});
export type PhaseVerdict = z.infer<typeof PhaseVerdictSchema>;

/** Mirrors model.PhaseDrainResult (recording-phase drain outcome). */
export const PhaseDrainResultSchema = z.object({
  status: z.enum(["clean", "degraded"]),
  missing_instances: z.array(z.string()).optional(),
  shortfall_entries: z.number().optional(),
});
export type PhaseDrainResult = z.infer<typeof PhaseDrainResultSchema>;

/** GET /api/v1/experiments/{id}/phases/{phaseId}/results. Harvest skips
 *  k6-only phase workflows (no zeus_attack_id) — `workflow_results` is then
 *  empty and the UI falls back to zeus run stats (ZeusRunStatsSchema). */
export const PhaseResultsSchema = z.object({
  workflow_results: arrayOrEmpty(PhaseWorkflowResultSchema),
  service_latency: arrayOrEmpty(PhaseServiceLatencySchema),
  service_cache: arrayOrEmpty(PhaseServiceCacheSchema),
  verdict: PhaseVerdictSchema.nullish().transform((v) => v ?? undefined),
  drain: PhaseDrainResultSchema.nullish().transform((v) => v ?? undefined),
});
export type PhaseResults = z.infer<typeof PhaseResultsSchema>;

/** GET /api/v1/experiments/{id}/results — model.ExperimentResults, or the
 *  `{experiment_id, available:false}` placeholder before any phase has results. */
export const ExperimentResultsSchema = z.object({
  experiment_id: z.string(),
  available: z.boolean().default(true),
  phase_count: z.number().int().optional(),
  completed_phase_count: z.number().int().optional(),
  total_request_count: z.number().optional(),
  total_error_count: z.number().optional(),
  overall_error_rate: z.number().optional(),
  worst_p99_us: z.number().optional(),
  worst_p99_phase_id: z.string().optional(),
  best_p99_us: z.number().optional(),
  best_p99_phase_id: z.string().optional(),
  computed_at: Timestamp.optional(),
});
export type ExperimentResults = z.infer<typeof ExperimentResultsSchema>;

// ─── Phases — the logical unit of operation (flat endpoints) ──────────

/** GET /api/v1/phases/{phaseId} — api.PhaseDetail: the phase row +
 *  experiment_name + workflows + harvested workflow_results + totals. */
export const PhaseDetailSchema = z.object({
  id: z.string(),
  experiment_id: z.string(),
  experiment_name: z.string().default(""),
  name: PhaseNameSchema,
  position: z.number().int().optional(),
  status: PhaseStatusSchema,
  frozen_services: arrayOrEmpty(FrozenServiceSchema),
  persist_cache: z.boolean().optional(),
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
  failure_reason: z.string().optional(),
  workflows: arrayOrEmpty(PhaseWorkflowSchema),
  workflow_results: arrayOrEmpty(PhaseWorkflowResultSchema),
  total_request_count: z.number().default(0),
  total_error_count: z.number().default(0),
  overall_error_rate: z.number().default(0),
});
export type PhaseDetail = z.infer<typeof PhaseDetailSchema>;

/** GET /api/v1/phases — model.PhaseListItem rows (page envelope). */
export const PhaseListItemSchema = z.object({
  id: z.string(),
  experiment_id: z.string(),
  experiment_name: z.string().default(""),
  name: PhaseNameSchema,
  position: z.number().int().optional(),
  workflow_ids: arrayOrEmpty(z.string()),
  frozen_service_count: z.number().int().default(0),
  status: PhaseStatusSchema,
  started_at: Timestamp.optional(),
  completed_at: Timestamp.optional(),
});
export type PhaseListItem = z.infer<typeof PhaseListItemSchema>;

/** GET /api/v1/phases/{phaseId}/faults — api.PhaseFaults. */
export const PhaseFaultEventSchema = z.object({
  id: z.string(),
  phase_id: z.string().optional(),
  /** rule | cachebox | fault_config */
  source: z.string(),
  service: z.string().optional(),
  /** e.g. "cachebox:replay", "inline:latency". */
  kind: z.string(),
  detail: z.unknown().optional(),
  started_at: Timestamp.optional(),
  ended_at: Timestamp.optional(),
});
export type PhaseFaultEvent = z.infer<typeof PhaseFaultEventSchema>;

export const PhaseFaultsSchema = z.object({
  frozen_services: arrayOrEmpty(FrozenServiceSchema),
  phase_rules: arrayOrEmpty(
    z.object({
      phase_id: z.string().optional(),
      rule_id: z.string(),
      position: z.number().optional(),
    }),
  ),
  fault_events: arrayOrEmpty(PhaseFaultEventSchema),
});
export type PhaseFaults = z.infer<typeof PhaseFaultsSchema>;

// ─── Zeus runs (proxied: /api/v1/zeus/runs/…) ────────────────────────

/** zeus-go internal/run.Run. zeus keeps runs in memory — after a zeus
 *  restart a run id known to manteion may 404 here. `status` is one of
 *  pending | running | completed | stopped | failed | rejected. */
export const ZeusRunSchema = z.object({
  id: z.string(),
  workflow_id: z.string().optional(),
  workflow_name: z.string().optional(),
  experiment_id: z.string().optional(),
  dataset_id: z.string().optional(),
  status: z.string(),
  meta_trace_id: z.string().optional(),
  workflow_label: z.string().optional(),
  k6_job_name: z.string().optional(),
  started_at: Timestamp.optional(),
  ended_at: Timestamp.optional(),
  /** Set when zeus rejected or failed the run (e.g. k6 exit code). */
  reason: z.string().optional(),
});
export type ZeusRun = z.infer<typeof ZeusRunSchema>;

/** zeus answers GET /runs/{id}/stats with 200 + this `status` while the run
 *  is still in flight (or finished without a snapshot). */
export const ZEUS_STATS_PENDING = "no stats available yet";

const NS_PER_US = 1_000;
const NS_PER_MS = 1_000_000;

export interface ZeusRunStats {
  run_id: string;
  workflow_id?: string;
  status?: string;
  duration_ms: number;
  iterations: number;
  requests_sent: number;
  requests_ok: number;
  requests_dropped: number;
  latency_p50_us: number;
  latency_p95_us: number;
  latency_p99_us: number;
  finalized_at?: string;
}

/** zeus-go stats.RunStats — durations/latencies are Go `time.Duration`
 *  (nanoseconds) on the wire; converted to ms/µs here so nothing downstream
 *  ever sees nanoseconds. Parses to `undefined` for the in-flight placeholder. */
export const ZeusRunStatsSchema = z
  .object({
    run_id: z.string(),
    workflow_id: z.string().optional(),
    status: z.string().optional(),
    duration: z.number().default(0),
    iterations: z.number().default(0),
    requests_sent: z.number().default(0),
    requests_ok: z.number().default(0),
    requests_dropped: z.number().default(0),
    latency_p50: z.number().default(0),
    latency_p95: z.number().default(0),
    latency_p99: z.number().default(0),
    finalized_at: Timestamp.optional(),
  })
  .transform((s): ZeusRunStats | undefined =>
    s.status === ZEUS_STATS_PENDING
      ? undefined
      : {
          run_id: s.run_id,
          workflow_id: s.workflow_id,
          status: s.status,
          duration_ms: s.duration / NS_PER_MS,
          iterations: s.iterations,
          requests_sent: s.requests_sent,
          requests_ok: s.requests_ok,
          requests_dropped: s.requests_dropped,
          latency_p50_us: s.latency_p50 / NS_PER_US,
          latency_p95_us: s.latency_p95 / NS_PER_US,
          latency_p99_us: s.latency_p99 / NS_PER_US,
          finalized_at: s.finalized_at,
        },
  );

// ─── Workflow (DSL v2 definition; manteion-owned) ──────────────────────

/** Bare-bones list-row shape served by GET /api/v1/workflows. The DSL
 *  document is omitted from the list payload — fetch
 *  /api/v1/workflows/{id} for the tree. */
export const WorkflowListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().default("2"),
  description: z.string().optional(),
  targets: z.array(z.string()).default([]),
  estimated_rps_per_vu: z.number().default(0),
  /** Precomputed by manteion-go so the workflows list doesn't need the DSL tree. */
  request_node_count: z.number().int().default(0),
  created_at: Timestamp,
  updated_at: Timestamp.optional(),
});
export type WorkflowListItem = z.infer<typeof WorkflowListItemSchema>;

/** Full zeus DSL v2 document (schema epoch 2: workflows are stored as one
 *  `dsl` JSONB document). Only the metadata the UI consumes is typed here;
 *  the node tree at `root` stays `unknown` and is coerced by the
 *  client-side WorkflowNode parser in lib/workflow-types.ts. */
export const WorkflowDslSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional(),
  targets: z.array(z.string()).default([]),
  estimated_rps_per_vu: z.number().default(0),
  root: z.unknown(),
  thresholds: z.unknown().optional(),
  data_schema: z.unknown().optional(),
  default_delay: z.unknown().optional(),
  base_url: z.string().optional(),
});
export type WorkflowDsl = z.infer<typeof WorkflowDslSchema>;

/** Full payload served by GET /api/v1/workflows/{id} and returned by POST.
 *  `dsl` is the full zeus DSL v2 document (node tree at `dsl.root`).
 *
 *  Storage split: manteion serves the *definition*; zeus validates it
 *  (stateless POST /workflows/validate) and serves *execution* state. The
 *  detail page fans out two parallel queries. */
export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().default("2"),
  description: z.string().optional(),
  dsl: WorkflowDslSchema,
  created_at: Timestamp,
  updated_at: Timestamp.optional(),
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
