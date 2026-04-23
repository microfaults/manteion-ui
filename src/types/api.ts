/**
 * API types — hand-written Zod schemas until manteion-go ships an OpenAPI spec.
 * Keep these in sync with `manteion-go/internal/model/*.go`.
 *
 * Current backend reality (see docs/API-NEEDED.md for the full list):
 *  - /api/v1/rules          CRUD (RuleRepo)
 *  - /api/v1/sdk/instances  read-only list (SDKRepo)
 *  - /api/v1/sdk/rules      version-based poll for atropos SDKs
 *  - /api/v1/zeus/*         blind passthrough to zeus-go
 *
 * Many screens below reference endpoints that DO NOT yet exist. Those are
 * documented in docs/API-NEEDED.md and scoped under "NEW" comments here.
 */
import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────

export const Timestamp = z.string(); // RFC 3339
export type Timestamp = z.infer<typeof Timestamp>;

// ─── Rule ─────────────────────────────────────────────────────────────

/** Match-criteria AST used by the in-UI rule builder.
 *  Compiles to rego via `src/lib/rego/compile.ts`. See docs/API-NEEDED.md §B.3#2.
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

export const RuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  service: z.string(),
  enabled: z.boolean(),
  priority: z.number().int(),
  /** Backend currently stores: `match.injection_point`, `match.labels{}`.
   *  UI treats these as a projection of the richer match_ast/match_expr. */
  match: z
    .object({
      injection_point: z.string().optional(),
      labels: z.record(z.string()).optional(),
    })
    .optional(),
  /** NEW — sent on save, backend must store (see docs/API-NEEDED.md §B.3#2). */
  match_ast: MatchNodeSchema.optional(),
  /** NEW — compiled rego; backend source of truth once implemented. */
  match_expr: z.string().optional(),
  /** XOR with fault_composition_id. */
  fault_spec_id: z.string().optional(),
  fault_composition_id: z.string().optional(),
  mode: z.enum(["inline", "background"]),
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

// ─── Fault (NEW — not yet exposed) ────────────────────────────────────

export const FaultCategorySchema = z.enum(["inline", "network", "resource"]);
export type FaultCategory = z.infer<typeof FaultCategorySchema>;

export const FaultSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: FaultCategorySchema,
  fault_type: z.string(),
  config: z.unknown(),
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
