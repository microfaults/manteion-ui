import { z } from "zod";
import { apiClient } from "./client";
import {
  ExperimentSchema,
  PhaseSummarySchema,
  type Experiment,
  type PhaseName,
  type PhaseSummary,
} from "@/types/api";

const List = z.array(ExperimentSchema);

/** NEW endpoint — not yet exposed by manteion-go. See docs/API-NEEDED.md. */
export async function listExperiments(): Promise<Experiment[]> {
  return apiClient.get("/api/v1/experiments", List);
}

/** NEW endpoint. */
export async function getExperiment(id: string): Promise<Experiment> {
  return apiClient.get(
    `/api/v1/experiments/${encodeURIComponent(id)}`,
    ExperimentSchema,
  );
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
