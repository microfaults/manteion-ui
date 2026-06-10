import {
  type Experiment,
  ExperimentSchema,
  PageEnvelope,
  type PhaseName,
  type PhaseSummary,
  PhaseSummarySchema,
} from "@/types/api";
import { ApiError, apiClient } from "./client";

const ExperimentPageSchema = PageEnvelope(ExperimentSchema);

/** Lists experiments from manteion-go `GET /api/v1/experiments` (paginated
 *  envelope; empty array when DB has no rows). */
export async function listExperiments(): Promise<Experiment[]> {
  const envelope = await apiClient.get("/api/v1/experiments", ExperimentPageSchema);
  return envelope.data;
}

/** Experiments no longer carry a `workflow_ids` join (schema epoch 2) —
 *  workflows attach per-phase only. The experiment-level list is the
 *  ordered-unique union of phases[].workflows[].workflow_id. */
export function workflowIdsForExperiment(exp: Experiment): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const phase of exp.phases) {
    for (const pw of phase.workflows) {
      if (!seen.has(pw.workflow_id)) {
        seen.add(pw.workflow_id);
        out.push(pw.workflow_id);
      }
    }
  }
  return out;
}

/** Same as {@link listExperiments}, but returns `[]` when the server responds 404 (older manteion-go binary). */
export async function listExperimentsLenient(): Promise<Experiment[]> {
  try {
    return await listExperiments();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return [];
    throw e;
  }
}

/** NEW endpoint. */
export async function getExperiment(id: string): Promise<Experiment> {
  return apiClient.get(`/api/v1/experiments/${encodeURIComponent(id)}`, ExperimentSchema);
}

/** NEW endpoint — drives the Experiments-list phase-pill hover card (Task C.2). */
export async function getPhaseStatus(
  experimentId: string,
  phase: PhaseName,
): Promise<PhaseSummary> {
  return apiClient.get(
    `/api/v1/experiments/${encodeURIComponent(experimentId)}/phase/${encodeURIComponent(phase)}/status`,
    PhaseSummarySchema,
  );
}
