/**
 * Cross-entity prerequisite gates. Pure functions — pages feed them query
 * state and render the returned reason, so the "why is this disabled?"
 * logic is testable without a DOM.
 */

/** Load-state summary for a prerequisite list query. */
export interface ResourceState {
  status: "loading" | "error" | "ready";
  count: number;
}

export type ExperimentGateReason =
  | "ok"
  | "workflows-loading"
  | "workflows-unknown"
  | "no-workflows"
  | "backend-missing";

export interface Gate<Reason extends string = string> {
  allowed: boolean;
  reason: Reason;
  /** User-facing explanation rendered next to the disabled affordance. */
  message: string;
}

/**
 * Experiments attach load per phase (PhaseWorkflow.workflow_id is required),
 * so creating one without any workflow is meaningless — gate on ≥1 workflow.
 * `backendSupportsCreate` stays false until manteion-go ships
 * POST /api/v1/experiments; the workflow prerequisite is checked first so the
 * guidance stays actionable either way.
 */
export function experimentCreateGate(
  workflows: ResourceState,
  opts: { backendSupportsCreate?: boolean } = {},
): Gate<ExperimentGateReason> {
  if (workflows.status === "loading") {
    return { allowed: false, reason: "workflows-loading", message: "Checking workflows…" };
  }
  if (workflows.status === "error") {
    return {
      allowed: false,
      reason: "workflows-unknown",
      message: "Can't verify workflows — manteion is unreachable.",
    };
  }
  if (workflows.count === 0) {
    return {
      allowed: false,
      reason: "no-workflows",
      message: "Create a workflow first — experiments attach load per phase.",
    };
  }
  if (!opts.backendSupportsCreate) {
    return {
      allowed: false,
      reason: "backend-missing",
      message: "Experiment creation isn't wired to manteion-go yet.",
    };
  }
  return { allowed: true, reason: "ok", message: "" };
}
