/**
 * Experiment detail (artboard `Main`): header + lifecycle actions, stat
 * cards from the results rollup, and Overview / Phases / Observability tabs.
 * Polls every 5 s while running — the cadence expctl uses in production.
 */
import { ExperimentActions } from "@/components/experiments/experiment-actions";
import { latencyDecimals } from "@/components/experiments/phase-row-results";
import { type PhaseAction, PhaseTimeline } from "@/components/experiments/phase-timeline";
import { GrafanaPanel } from "@/components/observability/grafana-panel";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { experimentsApi, phasesApi, rulesApi, workflowsApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type { RuleRef } from "@/lib/experiment-draft";
import { type GrafanaMetric, grafanaDashboardUrl, grafanaPanelSrc } from "@/lib/grafana";
import { formatCount, formatDurationMs, formatLatencyUs, formatRelative } from "@/lib/utils";
import {
  ACTIVE_PHASE_STATUSES,
  type Experiment,
  type ExperimentStatus,
  type PhaseSummary,
  TERMINAL_PHASE_STATUSES,
} from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

const statusBadge: Record<
  ExperimentStatus,
  "secondary" | "default" | "status-healthy" | "status-down" | "outline"
> = {
  planned: "secondary",
  running: "default",
  completed: "status-healthy",
  failed: "status-down",
  cancelled: "outline",
};

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "phases", label: "Phases" },
  { value: "observability", label: "Observability" },
];

interface ExperimentDetailProps {
  experimentId: string;
  onDeleted: () => void;
  /** Clock override for deterministic progress (tests). */
  now?: number;
}

export function ExperimentDetail({ experimentId, onDeleted, now }: ExperimentDetailProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [actionError, setActionError] = useState<string | null>(null);

  const experiment = useQuery({
    queryKey: ["experiment", experimentId],
    queryFn: () => experimentsApi.getExperiment(experimentId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 5_000 : false),
    retry: false,
  });
  const exp = experiment.data;
  const running = exp?.status === "running";
  const measured = exp?.phases.some((p) => TERMINAL_PHASE_STATUSES.has(p.status)) ?? false;

  const results = useQuery({
    queryKey: ["experiment-results", experimentId],
    queryFn: () => experimentsApi.getExperimentResults(experimentId),
    enabled: measured,
    refetchInterval: running ? 5_000 : false,
    retry: false,
  });
  const rulesQuery = useQuery({
    queryKey: ["rules"],
    queryFn: rulesApi.listRules,
    staleTime: 30_000,
    retry: false,
  });
  const workflows = useQuery({
    queryKey: ["workflows"],
    queryFn: workflowsApi.listWorkflows,
    staleTime: 30_000,
    retry: false,
  });
  const rules: RuleRef[] = useMemo(
    () =>
      (rulesQuery.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        service: r.service,
        enabled: r.enabled,
      })),
    [rulesQuery.data],
  );
  const workflowNames = useMemo(
    () => Object.fromEntries((workflows.data ?? []).map((w) => [w.id, w.name])),
    [workflows.data],
  );

  const phaseAction = useMutation({
    mutationFn: async ({ phase, action }: { phase: PhaseSummary; action: PhaseAction }) => {
      if (action.type === "pause") await phasesApi.pausePhase(phase.id);
      else if (action.type === "resume") await phasesApi.resumePhase(phase.id);
      else if (action.type === "stop") await phasesApi.stopPhase(phase.id, action.status);
      else await experimentsApi.startPhase(experimentId, phase.id);
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["experiment", experimentId] });
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
    },
    onError: (e: unknown) => setActionError(describeApiError(e)),
  });

  if (experiment.isLoading)
    return <p className="text-sm text-muted-foreground">Loading experiment…</p>;
  if (experiment.isError || !exp) {
    return <p className="text-sm text-status-down">{describeApiError(experiment.error)}</p>;
  }

  const done = exp.phases.filter((p) => TERMINAL_PHASE_STATUSES.has(p.status)).length;
  const current = exp.phases.find((p) => ACTIVE_PHASE_STATUSES.has(p.status));
  const rollup = results.data?.available ? results.data : undefined;
  const worstPhase = exp.phases.find((p) => p.id === rollup?.worst_p99_phase_id);
  const services = exp.targeted_services.length ? exp.targeted_services : footprint(exp, rules);
  const grafanaBase = import.meta.env.VITE_GRAFANA_URL as string | undefined;
  const grafanaEmbed = import.meta.env.VITE_GRAFANA_EMBED === "true";
  const window = exp.started_at ? { from: exp.started_at, to: exp.completed_at } : undefined;
  const windowLabel = exp.started_at
    ? `${formatRelative(exp.started_at)} → ${exp.completed_at ? formatRelative(exp.completed_at) : "now"}`
    : "not started";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{exp.name}</h1>
            <Badge variant={statusBadge[exp.status]} dot={exp.status === "running"}>
              {exp.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {exp.description ? `${exp.description} · ` : ""}
            {exp.created_by ? `created by ${exp.created_by} · ` : ""}
            {exp.started_at
              ? `started ${formatRelative(exp.started_at)}`
              : `created ${formatRelative(exp.created_at)}`}
          </p>
          {exp.hypothesis ? (
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Hypothesis — </span>
              {exp.hypothesis}
            </p>
          ) : null}
          {exp.failure_reason ? (
            <p className="mt-1 text-sm text-status-down">{exp.failure_reason}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {services.map((s) => (
              <span
                key={s}
                className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <ExperimentActions experiment={exp} rules={rules} onDeleted={onDeleted} />
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Phases"
          value={
            <span className="font-mono">
              {done}
              <span className="text-muted-foreground">/{exp.phases.length}</span>
            </span>
          }
          footer={
            current
              ? `${current.name} · ${current.status}`
              : done === exp.phases.length
                ? "all done"
                : "waiting"
          }
        />
        <StatCard
          label="Requests"
          value={<span className="font-mono">{formatCount(rollup?.total_request_count)}</span>}
          footer={rollup ? "harvested so far" : "no results yet"}
        />
        <StatCard
          label="Error rate"
          value={
            <span className="font-mono">
              {rollup?.overall_error_rate != null
                ? `${(rollup.overall_error_rate * 100).toFixed(2)}%`
                : "—"}
            </span>
          }
          footer="overall"
        />
        <StatCard
          label="Worst p99"
          value={
            <span className="font-mono">
              {formatLatencyUs(rollup?.worst_p99_us, latencyDecimals(rollup?.worst_p99_phase_id))}
            </span>
          }
          footer={
            rollup
              ? `${worstPhase?.name ?? rollup.worst_p99_phase_id ?? "—"} · ${rollup.completed_phase_count ?? done} phase${
                  (rollup.completed_phase_count ?? done) === 1 ? "" : "s"
                } measured`
              : "—"
          }
        />
      </div>

      <Tabs tabs={TABS} value={tab} onValueChange={setTab} />

      {actionError ? <p className="text-xs text-status-down">{actionError}</p> : null}

      {tab === "overview" ? (
        <section aria-label="Overview" className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <h2 className="text-sm font-semibold">Plan</h2>
            <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-xs">
              <dt className="text-muted-foreground">Phases</dt>
              <dd className="font-mono">{exp.phases.map((p) => p.name).join(" → ") || "—"}</dd>
              <dt className="text-muted-foreground">Workflows</dt>
              <dd className="font-mono">
                {experimentsApi
                  .workflowIdsForExperiment(exp)
                  .map((id) => workflowNames[id] ?? id)
                  .join(", ") || "—"}
              </dd>
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="font-mono">
                {exp.started_at && exp.completed_at
                  ? formatDurationMs(Date.parse(exp.completed_at) - Date.parse(exp.started_at))
                  : exp.started_at
                    ? `${formatDurationMs((now ?? Date.now()) - Date.parse(exp.started_at))} so far`
                    : "—"}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatRelative(exp.created_at)}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <h2 className="text-sm font-semibold">Results</h2>
            {rollup ? (
              <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-xs">
                <dt className="text-muted-foreground">Best p99</dt>
                <dd className="font-mono">
                  {formatLatencyUs(rollup.best_p99_us, latencyDecimals(rollup.best_p99_phase_id))} ·{" "}
                  {exp.phases.find((p) => p.id === rollup.best_p99_phase_id)?.name ??
                    rollup.best_p99_phase_id}
                </dd>
                <dt className="text-muted-foreground">Worst p99</dt>
                <dd className="font-mono">
                  {formatLatencyUs(rollup.worst_p99_us, latencyDecimals(rollup.worst_p99_phase_id))}{" "}
                  · {worstPhase?.name ?? rollup.worst_p99_phase_id}
                </dd>
                <dt className="text-muted-foreground">Errors</dt>
                <dd className="font-mono">
                  {formatCount(rollup.total_error_count)} /{" "}
                  {formatCount(rollup.total_request_count)}
                </dd>
                <dt className="text-muted-foreground">Computed</dt>
                <dd>{formatRelative(rollup.computed_at)}</dd>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {results.isError
                  ? describeApiError(results.error)
                  : "No phase has completed yet — results are harvested at phase end."}
              </p>
            )}
          </div>
        </section>
      ) : null}

      {tab === "phases" ? (
        <section aria-label="Phases">
          <PhaseTimeline
            experiment={exp}
            rules={rules}
            workflowNames={workflowNames}
            onPhaseAction={(phase, action) => phaseAction.mutate({ phase, action })}
            busy={phaseAction.isPending}
            now={now}
          />
        </section>
      ) : null}

      {tab === "observability" ? (
        <section aria-label="Observability" className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["Requests / sec", "requests-sec"],
              ["p99 latency", "p99-latency"],
              ["Error rate", "error-rate"],
              ["Cache-box hit rate", "cache-hit-rate"],
            ] as const
          ).map(([title, metric]) => (
            <GrafanaPanel
              key={metric}
              title={title}
              window={windowLabel}
              src={
                window
                  ? grafanaPanelSrc(grafanaBase, metric as GrafanaMetric, window, grafanaEmbed)
                  : undefined
              }
              grafanaUrl={grafanaDashboardUrl(grafanaBase, metric as GrafanaMetric, window)}
              height={220}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function footprint(exp: Experiment, rules: readonly RuleRef[]): string[] {
  const byId = new Map(rules.map((r) => [r.id, r.service]));
  const out = new Set<string>();
  for (const p of exp.phases) {
    for (const f of p.frozen_services) out.add(f.service);
    for (const id of p.rule_ids) {
      const s = byId.get(id);
      if (s) out.add(s);
    }
  }
  return [...out];
}
