/**
 * The new-experiment wizard's draft model — pure functions so every rule the
 * backend enforces (name, ≥1 phase, unique phase names, workflow vus/duration,
 * mutation_policy, cache-box key-strategy agreement per service — INV-2,
 * model/cachebox.go) is caught client-side before POST /api/v1/experiments,
 * and the preflight (admission-control overlap, disabled rules, no SDK
 * instances) is computable from the query caches without a DOM.
 */
import type { CacheBoxMode, CreateExperimentInput, CreatePhaseInput } from "@/types/api";

export const DEFAULT_KEY_STRATEGY = "canonical_v2";
export const CACHEBOX_KEY_STRATEGIES = [
  "canonical_v2",
  "exact",
  "exact_with_host",
  "exact_with_body",
  "exact_with_host_norm",
] as const;
export const CACHEBOX_MODES: readonly CacheBoxMode[] = [
  "replay",
  "replay_with_delay",
  "passthrough",
];
export const DEFAULT_WORKFLOW_ROW = { vus: 10, duration_sec: 300 } as const;

export interface WorkflowRowDraft {
  /** Stable React key (rows are reorderable/removable). */
  key: string;
  workflow_id: string;
  vus: number;
  duration_sec: number;
  rate_rps?: number;
  /** Per-workflow dataset (A7 — hidden until manteion-go B5 ships). */
  dataset_id?: string;
  target_url?: string;
  target_method?: string;
}

export interface FrozenServiceDraft {
  key: string;
  service: string;
  mode: CacheBoxMode;
  /** "" means the server default (canonical_v2). */
  key_strategy: string;
  mutation_policy: "deny" | "allow";
}

export interface PhaseDraft {
  key: string;
  name: string;
  persist_cache: boolean;
  workflows: WorkflowRowDraft[];
  rule_ids: string[];
  frozen_services: FrozenServiceDraft[];
}

export interface ExperimentDraft {
  name: string;
  description: string;
  hypothesis: string;
  created_by: string;
  phases: PhaseDraft[];
}

export interface DraftIssue {
  code:
    | "name-required"
    | "no-phases"
    | "phase-name-required"
    | "duplicate-phase-name"
    | "no-workflows"
    | "workflow-required"
    | "vus-invalid"
    | "duration-invalid"
    | "frozen-service-required"
    | "duplicate-frozen-service"
    | "key-strategy-conflict";
  message: string;
  /** Phase the issue belongs to (absent for experiment-level issues). */
  phaseKey?: string;
}

let seq = 0;
/** Unique-per-session key for draft rows. */
export const draftKey = (prefix = "k"): string => `${prefix}-${(++seq).toString(36)}`;

export function emptyDraft(): ExperimentDraft {
  return { name: "", description: "", hypothesis: "", created_by: "", phases: [] };
}

export function newWorkflowRow(workflow_id = ""): WorkflowRowDraft {
  return { key: draftKey("w"), workflow_id, ...DEFAULT_WORKFLOW_ROW };
}

export function newFrozenService(service = ""): FrozenServiceDraft {
  return {
    key: draftKey("f"),
    service,
    mode: "replay",
    key_strategy: DEFAULT_KEY_STRATEGY,
    mutation_policy: "deny",
  };
}

export function newPhase(name: string, workflowId = ""): PhaseDraft {
  return {
    key: draftKey("p"),
    name,
    persist_cache: false,
    workflows: [newWorkflowRow(workflowId)],
    rule_ids: [],
    frozen_services: [],
  };
}

const effectiveStrategy = (s: string) => s || DEFAULT_KEY_STRATEGY;

/** Every blocking problem with the draft, in plan order. Empty = submittable. */
export function validateDraft(draft: ExperimentDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!draft.name.trim()) issues.push({ code: "name-required", message: "Name is required." });
  if (draft.phases.length === 0) {
    issues.push({ code: "no-phases", message: "Add at least one phase." });
  }
  const names = new Set<string>();
  const strategies = new Map<string, { strategy: string; phase: string }>();
  for (const p of draft.phases) {
    const name = p.name.trim();
    const at = { phaseKey: p.key };
    if (!name)
      issues.push({ code: "phase-name-required", message: "Every phase needs a name.", ...at });
    else if (names.has(name)) {
      issues.push({
        code: "duplicate-phase-name",
        message: `Phase name "${name}" is used twice — names are unique per experiment.`,
        ...at,
      });
    }
    names.add(name);

    if (p.workflows.length === 0) {
      issues.push({
        code: "no-workflows",
        message: `Phase "${name}" needs at least one workflow.`,
        ...at,
      });
    }
    for (const w of p.workflows) {
      if (!w.workflow_id)
        issues.push({ code: "workflow-required", message: `Pick a workflow in "${name}".`, ...at });
      if (!(w.vus > 0))
        issues.push({ code: "vus-invalid", message: `VUs must be > 0 in "${name}".`, ...at });
      if (!(w.duration_sec > 0)) {
        issues.push({
          code: "duration-invalid",
          message: `Duration must be > 0 s in "${name}".`,
          ...at,
        });
      }
    }

    const seenServices = new Set<string>();
    for (const f of p.frozen_services) {
      if (!f.service) {
        issues.push({
          code: "frozen-service-required",
          message: `Pick a service to freeze in "${name}".`,
          ...at,
        });
        continue;
      }
      if (seenServices.has(f.service)) {
        issues.push({
          code: "duplicate-frozen-service",
          message: `${f.service} is frozen twice in "${name}".`,
          ...at,
        });
      }
      seenServices.add(f.service);
      const strategy = effectiveStrategy(f.key_strategy);
      const prev = strategies.get(f.service);
      if (prev && prev.strategy !== strategy) {
        issues.push({
          code: "key-strategy-conflict",
          message: `${f.service} uses key strategy ${prev.strategy} in "${prev.phase}" but ${strategy} in "${name}" — record and replay must derive identical keys.`,
          ...at,
        });
      } else if (!prev) strategies.set(f.service, { strategy, phase: name });
    }
  }
  return issues;
}

/** Strict wire shape for POST /api/v1/experiments (§0.2). */
export function draftToCreateInput(draft: ExperimentDraft): CreateExperimentInput {
  const input: CreateExperimentInput = {
    name: draft.name.trim(),
    phases: draft.phases.map(
      (p, position): CreatePhaseInput => ({
        name: p.name.trim(),
        position,
        persist_cache: p.persist_cache,
        frozen_services: p.frozen_services.map((f) => ({
          service: f.service,
          mode: f.mode,
          key_strategy: effectiveStrategy(f.key_strategy),
          mutation_policy: f.mutation_policy || "deny",
        })),
        workflows: p.workflows.map((w) => ({
          workflow_id: w.workflow_id,
          vus: w.vus,
          duration_sec: w.duration_sec,
          ...(w.rate_rps ? { rate_rps: w.rate_rps } : {}),
          ...(w.dataset_id ? { dataset_id: w.dataset_id } : {}),
          ...(w.target_url
            ? { target_url: w.target_url, target_method: w.target_method || "GET" }
            : {}),
        })),
        rule_ids: [...p.rule_ids],
      }),
    ),
  };
  if (draft.description.trim()) input.description = draft.description.trim();
  if (draft.hypothesis.trim()) input.hypothesis = draft.hypothesis.trim();
  if (draft.created_by.trim()) input.created_by = draft.created_by.trim();
  return input;
}

export interface RuleRef {
  id: string;
  name: string;
  service: string;
  enabled: boolean;
}

/** baseline → one isolation per targeted service (every OTHER targeted
 *  service replayed from the cache box, that service's rules attached) →
 *  combined (nothing frozen, every matching rule). Each phase carries one
 *  row of the chosen workflow. */
export function autoPlanPhases(opts: {
  services: readonly string[];
  workflowId: string;
  rules?: readonly RuleRef[];
  row?: Partial<Omit<WorkflowRowDraft, "key" | "workflow_id">>;
}): PhaseDraft[] {
  const services = [...new Set(opts.services)];
  const rules = (opts.rules ?? []).filter((r) => services.includes(r.service));
  const row = (): WorkflowRowDraft => ({ ...newWorkflowRow(opts.workflowId), ...opts.row });
  const phase = (name: string, frozen: string[], ruleIds: string[]): PhaseDraft => ({
    key: draftKey("p"),
    name,
    persist_cache: false,
    workflows: [row()],
    rule_ids: ruleIds,
    frozen_services: frozen.map((service) => newFrozenService(service)),
  });
  return [
    phase("baseline", [], []),
    ...services.map((svc) =>
      phase(
        `isolation-${svc}`,
        services.filter((s) => s !== svc),
        rules.filter((r) => r.service === svc).map((r) => r.id),
      ),
    ),
    phase(
      "combined",
      [],
      rules.map((r) => r.id),
    ),
  ];
}

/** Services the plan touches: frozen services ∪ services of selected rules
 *  (first-seen order). Mirrors the orchestrator's admission-control footprint. */
export function footprintOfDraft(draft: ExperimentDraft, rules: readonly RuleRef[]): string[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const out: string[] = [];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  for (const p of draft.phases) {
    for (const f of p.frozen_services) add(f.service);
    for (const id of p.rule_ids) add(byId.get(id)?.service ?? "");
  }
  return out;
}

/** Minimal experiment view the preflight needs (works on the list payload). */
export interface ExperimentRef {
  id: string;
  name: string;
  status: string;
  phases: readonly {
    rule_ids: readonly string[];
    frozen_services: readonly { service: string }[];
  }[];
}

export interface PreflightItem {
  code: "service-overlap" | "key-strategy" | "disabled-rules" | "no-sdk-instances";
  level: "ok" | "warning" | "error";
  message: string;
}

/** Checks that need live data: ✗ footprint overlap with a running experiment
 *  (the backend would 409 at start), ✓/✗ key-strategy agreement, ⚠ selected
 *  rules currently disabled (the wizard never enables rules — decision 1),
 *  ⚠ zero SDK instances (only when the count is known). */
export function preflight(input: {
  draft: ExperimentDraft;
  rules: readonly RuleRef[];
  experiments: readonly ExperimentRef[];
  sdkInstanceCount: number | undefined;
}): PreflightItem[] {
  const { draft, rules } = input;
  const items: PreflightItem[] = [];
  const mine = footprintOfDraft(draft, rules);
  const byId = new Map(rules.map((r) => [r.id, r]));

  let overlap: PreflightItem | undefined;
  for (const exp of input.experiments) {
    if (exp.status !== "running") continue;
    const theirs = new Set<string>();
    for (const p of exp.phases) {
      for (const f of p.frozen_services) theirs.add(f.service);
      for (const id of p.rule_ids) {
        const svc = byId.get(id)?.service;
        if (svc) theirs.add(svc);
      }
    }
    const shared = mine.filter((s) => theirs.has(s));
    if (shared.length) {
      overlap = {
        code: "service-overlap",
        level: "error",
        message: `Service footprint overlaps running experiment ${exp.name}: ${shared.join(", ")} — starting would be refused (409).`,
      };
      break;
    }
  }
  items.push(
    overlap ?? {
      code: "service-overlap",
      level: "ok",
      message: mine.length
        ? `No running experiment overlaps — ${mine.join(" · ")}`
        : "No services touched — nothing frozen and no rules selected.",
    },
  );

  const conflicts = validateDraft(draft).filter((i) => i.code === "key-strategy-conflict");
  const frozenServices = [
    ...new Set(draft.phases.flatMap((p) => p.frozen_services.map((f) => f.service))),
  ];
  items.push(
    conflicts.length
      ? { code: "key-strategy", level: "error", message: conflicts[0]?.message ?? "" }
      : {
          code: "key-strategy",
          level: "ok",
          message: frozenServices.length
            ? `Cache-box key strategy agrees across phases (${frozenServices.join(", ")})`
            : "No cache-box freezes — key strategy not applicable.",
        },
  );

  const disabled: string[] = [];
  for (const p of draft.phases) {
    for (const id of p.rule_ids) {
      const r = byId.get(id);
      if (r && !r.enabled) disabled.push(`${r.name} (on ${p.name || "unnamed phase"})`);
    }
  }
  if (disabled.length) {
    items.push({
      code: "disabled-rules",
      level: "warning",
      message: `${disabled.length} selected rule${disabled.length > 1 ? "s are" : " is"} disabled: ${disabled.join(", ")} — enable on the Rules page before starting, or that phase runs without it.`,
    });
  }

  if (input.sdkInstanceCount === 0) {
    items.push({
      code: "no-sdk-instances",
      level: "warning",
      message:
        "No SDK instances are registered — rules and cache-box freezes have nowhere to apply.",
    });
  }
  return items;
}
