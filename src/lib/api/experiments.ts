/**
 * Experiments client — manteion-go `/api/v1/experiments…` (schema epoch 2).
 *
 * Lifecycle verbs mirror the backend routes 1:1; response codes: create 201 +
 * detail, start 202 + detail, pause/resume/cancel 200 `{status}`, stop 202
 * (empty), delete 204. Admission control answers 409 when the service
 * footprint overlaps a running experiment. Phase results are NOT on the
 * phase — see getPhaseResults / getExperimentResults.
 */
import {
  type CreateExperimentInput,
  type CreatePhaseInput,
  type Experiment,
  type ExperimentResults,
  ExperimentResultsSchema,
  ExperimentSchema,
  PageEnvelope,
  type PhaseListItem,
  type PhaseResults,
  PhaseResultsSchema,
  type PhaseSummary,
  PhaseSummarySchema,
} from "@/types/api";
import { z } from "zod";
import { ApiError, apiClient } from "./client";
import * as mock from "./mock-experiments";
import { listPhases } from "./phases";

export type { CreateExperimentInput, CreatePhaseInput } from "@/types/api";
export { MOCK_PHASE_STEP_MS, mockPhaseResultsFor } from "./mock-experiments";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

function mockDelay() {
  return new Promise((r) => setTimeout(r, 80));
}

const ExperimentPageSchema = PageEnvelope(ExperimentSchema);
const StatusReply = z.object({ status: z.string() });
/** 202/204 replies carry no body. */
const Empty = z.unknown();

const enc = encodeURIComponent;
const expPath = (id: string) => `/api/v1/experiments/${enc(id)}`;
const phasePath = (id: string, phaseId: string) => `${expPath(id)}/phases/${enc(phaseId)}`;
const withStatus = (path: string, status?: string) =>
  status ? `${path}?status=${enc(status)}` : path;

/** Flat list rows carry workflow ids and a frozen-service COUNT only; the
 *  hover card / detail page fetch the full phase when they need the rest. */
function summaryFromListItem(p: PhaseListItem): PhaseSummary {
  return {
    id: p.id,
    experiment_id: p.experiment_id,
    name: p.name,
    position: p.position,
    status: p.status,
    workflows: p.workflow_ids.map((workflow_id) => ({ workflow_id })),
    frozen_services: [],
    rule_ids: [],
    started_at: p.started_at,
    completed_at: p.completed_at,
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────

/** Lists experiments. `GET /api/v1/experiments` returns bare rows (no
 *  phases), so the phase pills are hydrated from the flat `GET /api/v1/phases`
 *  list in one extra request — never N+1 detail fetches. */
export async function listExperiments(): Promise<Experiment[]> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockList();
  }
  const [envelope, phases] = await Promise.all([
    apiClient.get("/api/v1/experiments?limit=200&offset=0", ExperimentPageSchema),
    listPhases().catch((e: unknown) => {
      // Pre-epoch-2 binary without the flat phases route: pills stay empty.
      if (e instanceof ApiError && e.status === 404) return [] as PhaseListItem[];
      throw e;
    }),
  ]);
  const byExperiment = new Map<string, PhaseSummary[]>();
  for (const p of phases) {
    const list = byExperiment.get(p.experiment_id) ?? [];
    list.push(summaryFromListItem(p));
    byExperiment.set(p.experiment_id, list);
  }
  return envelope.data.map((e) =>
    e.phases?.length > 0
      ? e
      : {
          ...e,
          phases: (byExperiment.get(e.id) ?? []).sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
          ),
        },
  );
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

/** `GET /api/v1/experiments/{id}` — the full plan: phases with workflows + rule_ids. */
export async function getExperiment(id: string): Promise<Experiment> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockGet(id);
  }
  return apiClient.get(expPath(id), ExperimentSchema);
}

/** `GET /api/v1/experiments/{id}/phases/{phaseId}`. Phases are addressed by
 *  id, not name: names are free-form and only unique per experiment. */
export async function getPhaseStatus(experimentId: string, phaseId: string): Promise<PhaseSummary> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockGetPhase(experimentId, phaseId);
  }
  return apiClient.get(phasePath(experimentId, phaseId), PhaseSummarySchema);
}

/** `GET …/phases/{phaseId}/results` — harvested at phase end. Empty
 *  `workflow_results` for run-only phases (harvest skips k6 runs until B4);
 *  callers fall back to zeusRunsApi.getRunStats. */
export async function getPhaseResults(
  experimentId: string,
  phaseId: string,
): Promise<PhaseResults> {
  if (USE_MOCK) {
    await mockDelay();
    return (
      mock.mockPhaseResultsFor(phaseId) ?? {
        workflow_results: [],
        service_latency: [],
        service_cache: [],
      }
    );
  }
  return apiClient.get(`${phasePath(experimentId, phaseId)}/results`, PhaseResultsSchema);
}

/** `GET /api/v1/experiments/{id}/results` — rollup, or `{available:false}`. */
export async function getExperimentResults(id: string): Promise<ExperimentResults> {
  if (USE_MOCK) {
    await mockDelay();
    const exp = mock.mockGet(id);
    const rows = exp.phases.flatMap((p) => mock.mockPhaseResultsFor(p.id)?.workflow_results ?? []);
    if (rows.length === 0) return { experiment_id: id, available: false };
    const total_request_count = rows.reduce((n, r) => n + r.request_count, 0);
    const total_error_count = rows.reduce((n, r) => n + r.error_count, 0);
    const worst = rows.reduce((a, b) => (b.latency_p99_us > a.latency_p99_us ? b : a));
    const best = rows.reduce((a, b) => (b.latency_p99_us < a.latency_p99_us ? b : a));
    return {
      experiment_id: id,
      available: true,
      phase_count: exp.phases.length,
      completed_phase_count: exp.phases.filter((p) => p.status === "completed").length,
      total_request_count,
      total_error_count,
      overall_error_rate: total_request_count ? total_error_count / total_request_count : 0,
      worst_p99_us: worst.latency_p99_us,
      worst_p99_phase_id: worst.phase_id,
      best_p99_us: best.latency_p99_us,
      best_p99_phase_id: best.phase_id,
      computed_at: new Date().toISOString(),
    };
  }
  return apiClient.get(`${expPath(id)}/results`, ExperimentResultsSchema);
}

// ─── Create / delete ───────────────────────────────────────────────────

/** `POST /api/v1/experiments` (§0.2). Rules referenced by `rule_ids` should be
 *  created disabled and enabled only after this returns (D9 ordering). */
export async function createExperiment(input: CreateExperimentInput): Promise<Experiment> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockCreate(input);
  }
  return apiClient.post("/api/v1/experiments", input, ExperimentSchema);
}

/** `DELETE /api/v1/experiments/{id}` — 204. */
export async function deleteExperiment(id: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockDelete(id);
    return;
  }
  await apiClient.del(expPath(id));
}

/** `POST /api/v1/experiments/{id}/phases` — 201 + phaseDetail. Omit
 *  `position` to append. */
export async function createPhase(
  experimentId: string,
  input: CreatePhaseInput,
): Promise<PhaseSummary> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockCreatePhase(experimentId, input);
  }
  return apiClient.post(`${expPath(experimentId)}/phases`, input, PhaseSummarySchema);
}

/** `DELETE /api/v1/experiments/{id}/phases/{phaseId}` — 204. */
export async function deletePhase(experimentId: string, phaseId: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockDeletePhase(experimentId, phaseId);
    return;
  }
  await apiClient.del(phasePath(experimentId, phaseId));
}

// ─── Lifecycle ─────────────────────────────────────────────────────────

/** `POST …/start` — 202 + detail; 409 on a service-footprint overlap with a
 *  running experiment (admission control). */
export async function startExperiment(id: string): Promise<Experiment> {
  if (USE_MOCK) {
    await mockDelay();
    return mock.mockStart(id);
  }
  return apiClient.post(`${expPath(id)}/start`, undefined, ExperimentSchema);
}

/** `POST …/pause` — the in-flight phase pauses; the experiment stays `running`. */
export async function pauseExperiment(id: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockPause(id);
    return;
  }
  await apiClient.post(`${expPath(id)}/pause`, undefined, StatusReply);
}

/** `POST …/resume`. */
export async function resumeExperiment(id: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockResume(id);
    return;
  }
  await apiClient.post(`${expPath(id)}/resume`, undefined, StatusReply);
}

/** `POST …/cancel` — running only. */
export async function cancelExperiment(id: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockCancel(id);
    return;
  }
  await apiClient.post(`${expPath(id)}/cancel`, undefined, StatusReply);
}

export type ExperimentFinalStatus = "completed" | "failed" | "cancelled";

/** `POST …/stop?status=` — final status defaults to `cancelled` server-side. */
export async function stopExperiment(id: string, status?: ExperimentFinalStatus): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockStop(id, status);
    return;
  }
  await apiClient.post(withStatus(`${expPath(id)}/stop`, status), undefined, Empty);
}

/** `POST …/phases/{phaseId}/start` — a pending phase of a running experiment. */
export async function startPhase(experimentId: string, phaseId: string): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockStartPhase(experimentId, phaseId);
    return;
  }
  await apiClient.post(`${phasePath(experimentId, phaseId)}/start`, undefined, Empty);
}

export type PhaseFinalStatus = "completed" | "failed" | "skipped";

/** `POST …/phases/{phaseId}/stop?status=` — defaults to `completed` server-side. */
export async function stopPhase(
  experimentId: string,
  phaseId: string,
  status?: PhaseFinalStatus,
): Promise<void> {
  if (USE_MOCK) {
    await mockDelay();
    mock.mockStopPhase(phaseId, status);
    return;
  }
  await apiClient.post(
    withStatus(`${phasePath(experimentId, phaseId)}/stop`, status),
    undefined,
    Empty,
  );
}
