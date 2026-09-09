/**
 * One hook for "what did this phase measure": harvested results from
 * manteion (`…/phases/{id}/results`), else — for run-only phases the harvester
 * skipped — zeus's final run stats by the `zeus_run_id` stamped on the phase
 * workflow. Only terminal phases are queried; results never change once
 * written, so they are cached indefinitely.
 */
import { experimentsApi, zeusRunsApi } from "@/lib/api";
import { type PhaseMetrics, metricsFromResults, metricsFromZeusStats } from "@/lib/phase-metrics";
import type { PhaseResults, PhaseSummary } from "@/types/api";
import { useQuery } from "@tanstack/react-query";

export interface PhaseMetricsState {
  metrics: PhaseMetrics | undefined;
  results: PhaseResults | undefined;
  isLoading: boolean;
  error: unknown;
}

const measurable = (p: PhaseSummary | undefined) =>
  !!p && (p.status === "completed" || p.status === "failed");

export function usePhaseMetrics(
  experimentId: string,
  phase: PhaseSummary | undefined,
  enabled = true,
): PhaseMetricsState {
  const phaseId = phase?.id ?? "";
  const wanted = enabled && measurable(phase);
  const results = useQuery({
    queryKey: ["phase-results", experimentId, phaseId],
    queryFn: () => experimentsApi.getPhaseResults(experimentId, phaseId),
    enabled: wanted,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const harvested = results.data ? metricsFromResults(results.data) : undefined;
  const runId = phase?.workflows.find((w) => w.zeus_run_id)?.zeus_run_id ?? "";
  const needZeus = wanted && results.isSuccess && !harvested && runId !== "";
  const zeus = useQuery({
    queryKey: ["zeus-run-stats", runId],
    queryFn: () => zeusRunsApi.getRunStats(runId),
    enabled: needZeus,
    staleTime: 60_000,
    retry: false,
  });
  return {
    metrics: harvested ?? (zeus.data ? metricsFromZeusStats(zeus.data) : undefined),
    results: results.data,
    isLoading: wanted && (results.isLoading || (needZeus && zeus.isLoading)),
    error: results.error ?? zeus.error,
  };
}
