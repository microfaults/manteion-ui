import {
  type Experiment,
  ExperimentSchema,
  PageEnvelope,
  type PhaseSummary,
  PhaseSummarySchema,
} from "@/types/api";
import { ApiError, apiClient } from "./client";
import { mockExperiments } from "./mock-fixtures";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

const ExperimentPageSchema = PageEnvelope(ExperimentSchema);

/** Lists experiments from manteion-go `GET /api/v1/experiments` (paginated
 *  envelope; empty array when DB has no rows). */
export async function listExperiments(): Promise<Experiment[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mockExperiments.map((e) => ({ ...e }));
  }
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
  if (USE_MOCK) {
    await mockDelay();
    const exp = mockExperiments.find((e) => e.id === id);
    if (!exp) throw new Error(`Mock: experiment ${id} not found`);
    return { ...exp };
  }
  return apiClient.get(`/api/v1/experiments/${encodeURIComponent(id)}`, ExperimentSchema);
}

/** Fetches one phase by id — `GET /api/v1/experiments/{id}/phases/{phaseId}`.
 *  Drives the Experiments-list phase-pill hover card (Task C.2). Phases are
 *  addressed by id, not name: names are free-form and only unique per
 *  experiment. */
export async function getPhaseStatus(experimentId: string, phaseId: string): Promise<PhaseSummary> {
  if (USE_MOCK) {
    await mockDelay();
    const phase = mockExperiments
      .find((e) => e.id === experimentId)
      ?.phases.find((p) => p.id === phaseId);
    if (!phase) throw new Error(`Mock: phase ${phaseId} not found`);
    return { ...phase };
  }
  return apiClient.get(
    `/api/v1/experiments/${encodeURIComponent(experimentId)}/phases/${encodeURIComponent(phaseId)}`,
    PhaseSummarySchema,
  );
}
