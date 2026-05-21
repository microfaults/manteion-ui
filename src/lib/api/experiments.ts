import {
  type Experiment,
  ExperimentSchema,
  type PhaseName,
  type PhaseSummary,
  PhaseSummarySchema,
} from "@/types/api";
import { z } from "zod";
import { ApiError, apiClient } from "./client";

const List = z.array(ExperimentSchema);

/** Lists experiments from manteion-go `GET /api/v1/experiments` (empty array when DB has no rows). */
export async function listExperiments(): Promise<Experiment[]> {
  return apiClient.get("/api/v1/experiments", List);
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
