/**
 * Phase detail (artboard `PhaseDetail`): the logical unit of operation.
 * Header + time-based progress, per-workflow rows (one zeus run / attack
 * each with live status), faults in effect + fault events, the zeus
 * run.state timeline observed while polling, and results (harvested, else
 * zeus run stats) once the phase is terminal.
 */
import { AcceleratedTag } from "@/components/experiments/accelerated-tag";
import {
  MetricsGrid,
  latencyDecimals,
  phaseProvenance,
} from "@/components/experiments/phase-row-results";
import { PhasePill } from "@/components/phase-pill";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { experimentsApi, phasesApi, rulesApi, workflowsApi } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type { PhaseFinalStatus } from "@/lib/api/phases";
import { IS_MOCK } from "@/lib/env";
import { phaseDatasetIds, phaseProgress } from "@/lib/phase-metrics";
import { useFinalRefetch } from "@/lib/use-final-refetch";
import { usePhaseMetrics } from "@/lib/use-phase-metrics";
import { type RunTransition, useRunStateTimeline, useZeusRun } from "@/lib/use-zeus-run";
import { cn, formatCount, formatDurationMs, formatLatencyUs, formatRelative } from "@/lib/utils";
import {
  ACTIVE_PHASE_STATUSES,
  type PhaseDetail as PhaseDetailDto,
  type PhaseStatus,
  type PhaseSummary,
  type PhaseWorkflow,
  TERMINAL_PHASE_STATUSES,
} from "@/types/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

const badgeVariant: Record<
  PhaseStatus,
  "secondary" | "default" | "status-degraded" | "status-healthy" | "status-down" | "outline"
> = {
  pending: "secondary",
  running: "default",
  paused: "status-degraded",
  draining: "status-degraded",
  completed: "status-healthy",
  failed: "status-down",
  skipped: "outline",
};
const SECTION = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 10)}…` : id);
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });

interface PhaseDetailProps {
  phaseId: string;
  /** Clock override for deterministic progress (tests). */
  now?: number;
}

export function PhaseDetail({ phaseId, now }: PhaseDetailProps) {
  const queryClient = useQueryClient();
  const [stopStatus, setStopStatus] = useState<PhaseFinalStatus>("completed");
  const [actionError, setActionError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["phase-detail", phaseId],
    queryFn: () => phasesApi.getPhaseDetail(phaseId),
    refetchInterval: (q) =>
      q.state.data && ACTIVE_PHASE_STATUSES.has(q.state.data.status) ? 5_000 : false,
    retry: false,
  });
  const phase = detail.data;
  const active = !!phase && ACTIVE_PHASE_STATUSES.has(phase.status);
  const terminal = !!phase && TERMINAL_PHASE_STATUSES.has(phase.status);

  // Fault events close when the phase ends; fetch them once more after it does.
  useFinalRefetch(["phase-faults", phaseId], active);
  const faults = useQuery({
    queryKey: ["phase-faults", phaseId],
    queryFn: () => phasesApi.getPhaseFaults(phaseId),
    enabled: !!phase,
    refetchInterval: active ? 10_000 : false,
    retry: false,
  });
  const experiment = useQuery({
    queryKey: ["experiment", phase?.experiment_id ?? ""],
    queryFn: () => experimentsApi.getExperiment(phase?.experiment_id ?? ""),
    enabled: !!phase?.experiment_id,
    staleTime: 10_000,
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
  const workflowNames = useMemo(
    () => Object.fromEntries((workflows.data ?? []).map((w) => [w.id, w.name])),
    [workflows.data],
  );
  const rulesById = useMemo(
    () => new Map((rulesQuery.data ?? []).map((r) => [r.id, r])),
    [rulesQuery.data],
  );

  const summary: PhaseSummary | undefined = phase
    ? { ...phase, rule_ids: faults.data?.phase_rules.map((r) => r.rule_id) ?? [] }
    : undefined;
  const results = usePhaseMetrics(phase?.experiment_id ?? "", summary);

  const act = useMutation({
    mutationFn: async (action: "pause" | "resume" | "stop" | "start") => {
      if (action === "pause") await phasesApi.pausePhase(phaseId);
      else if (action === "resume") await phasesApi.resumePhase(phaseId);
      else if (action === "stop") await phasesApi.stopPhase(phaseId, stopStatus);
      else await experimentsApi.startPhase(phase?.experiment_id ?? "", phaseId);
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["phase-detail", phaseId] });
      queryClient.invalidateQueries({ queryKey: ["phases"] });
      queryClient.invalidateQueries({ queryKey: ["experiment", phase?.experiment_id ?? ""] });
    },
    onError: (e: unknown) => setActionError(describeApiError(e)),
  });

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">Loading phase…</p>;
  if (detail.isError || !phase) {
    return <p className="text-sm text-status-down">{describeApiError(detail.error)}</p>;
  }

  const exp = experiment.data;
  const total = exp?.phases.length;
  const index = exp?.phases.findIndex((p) => p.id === phase.id) ?? -1;
  const anyActive = exp?.phases.some((p) => ACTIVE_PHASE_STATUSES.has(p.status)) ?? true;
  const canStart = exp?.status === "running" && phase.status === "pending" && !anyActive;
  const progress = phaseProgress(phase, now);
  const runs = phase.workflows.filter((w) => w.zeus_run_id).length;
  const attacks = phase.workflows.filter((w) => w.zeus_attack_id).length;
  const metrics = results.metrics;
  const cacheHit = results.results?.service_cache.length
    ? results.results.service_cache.reduce((s, c) => s + c.cache_hit_rate, 0) /
      results.results.service_cache.length
    : undefined;
  // The mock build generates its numbers, or replays the sample's recorded ones.
  const resultSource = IS_MOCK ? phaseProvenance(phaseId) : "harvested";
  const decimals = latencyDecimals(phaseId);
  const failureReason =
    phase.failure_reason ?? exp?.phases.find((p) => p.id === phase.id)?.failure_reason;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <PhasePill name={phase.name} status={phase.status} widthPx={16} className="mt-1.5 h-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold">{phase.name}</h1>
            <Badge variant={badgeVariant[phase.status]} dot={phase.status !== "pending"}>
              {phase.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {index >= 0 && total ? `phase ${index + 1} of ${total} in ` : "in "}
            <Link
              to="/experiments/$experimentId"
              params={{ experimentId: phase.experiment_id }}
              className="text-primary hover:underline"
            >
              {phase.experiment_name || phase.experiment_id}
            </Link>
          </p>
          <ProgressLine phase={phase} progress={progress} />
          {phase.status === "failed" ? (
            <FailureReason
              reason={failureReason}
              runId={phase.workflows.find((w) => w.zeus_run_id)?.zeus_run_id}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {phase.status === "running" || phase.status === "draining" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={act.isPending}
              onClick={() => act.mutate("pause")}
            >
              Pause
            </Button>
          ) : null}
          {phase.status === "paused" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={act.isPending}
              onClick={() => act.mutate("resume")}
            >
              Resume
            </Button>
          ) : null}
          {active ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate("stop")}
              >
                Stop
              </Button>
              <NativeSelect
                aria-label="Stop status"
                className="h-8 w-28 text-xs"
                value={stopStatus}
                onChange={(e) => setStopStatus(e.target.value as PhaseFinalStatus)}
                options={["completed", "failed", "skipped"]}
              />
            </>
          ) : null}
          {canStart ? (
            <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("start")}>
              Start now
            </Button>
          ) : null}
        </div>
      </header>
      {actionError ? <p className="text-xs text-status-down">{actionError}</p> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Requests sent"
          value={
            <span className="font-mono">{metrics ? formatCount(metrics.request_count) : "—"}</span>
          }
          footer={
            metrics
              ? metrics.source === "zeus"
                ? "zeus run stats"
                : resultSource
              : "final at completion"
          }
        />
        <StatCard
          label="Errors"
          value={
            <span className="font-mono">
              {metrics?.error_rate != null ? `${(metrics.error_rate * 100).toFixed(2)}%` : "—"}
            </span>
          }
          footer={
            metrics
              ? `${formatCount(metrics.error_count)} of ${formatCount(metrics.request_count)}`
              : "final at completion"
          }
        />
        <StatCard
          label="p99"
          value={<span className="font-mono">{formatLatencyUs(metrics?.p99_us, decimals)}</span>}
          footer={
            metrics?.source === "zeus"
              ? "zeus run stats · ns→µs"
              : metrics
                ? resultSource
                : "final at completion"
          }
        />
        <StatCard
          label="Load drivers"
          value={
            <span className="font-mono">
              {runs} run{runs === 1 ? "" : "s"}
            </span>
          }
          footer={`${attacks} attack${attacks === 1 ? "" : "s"}`}
        />
      </div>

      <section aria-label="Workflows" className="rounded-lg border border-border bg-card">
        <div className="flex items-baseline gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold">Workflows</h2>
          <span className="text-xs text-muted-foreground">each row is one zeus run or attack</span>
          <span className="ml-auto text-xs text-muted-foreground">
            Datasets needed:{" "}
            {phaseDatasetIds(phase).length === 0 ? (
              "zeus default"
            ) : (
              <span className="font-mono text-foreground">{phaseDatasetIds(phase).join(", ")}</span>
            )}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workflow</TableHead>
              <TableHead className="text-right">VUs</TableHead>
              <TableHead className="text-right">rate</TableHead>
              <TableHead className="text-right">duration</TableHead>
              <TableHead>dataset</TableHead>
              <TableHead>zeus run</TableHead>
              <TableHead>status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phase.workflows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No workflows attached.
                </TableCell>
              </TableRow>
            ) : null}
            {phase.workflows.map((w) => (
              <WorkflowRow
                key={`${w.workflow_id}-${w.zeus_run_id ?? ""}-${w.zeus_attack_id ?? ""}`}
                workflow={w}
                name={workflowNames[w.workflow_id] ?? w.workflow_id}
                live={active}
              />
            ))}
          </TableBody>
        </Table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section
          aria-label="Faults in effect"
          className="rounded-lg border border-border bg-card p-4"
        >
          <h2 className="text-sm font-semibold">Faults in effect</h2>
          <div className={cn(SECTION, "mt-3")}>Applied rules</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {faults.data?.phase_rules.length === 0 ? (
              <span className="text-muted-foreground">none</span>
            ) : null}
            {faults.data?.phase_rules.map((pr) => {
              const rule = rulesById.get(pr.rule_id);
              return (
                <span
                  key={pr.rule_id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5"
                >
                  <span className="font-mono">{rule?.name ?? pr.rule_id}</span>
                  {rule ? (
                    <span className="text-muted-foreground">
                      · {rule.action.type.replace("_", " ")}
                    </span>
                  ) : null}
                  {rule ? (
                    <Badge
                      variant={rule.enabled ? "status-healthy" : "status-degraded"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {rule.enabled ? "enabled" : "disabled"}
                    </Badge>
                  ) : null}
                </span>
              );
            })}
          </div>
          <div className={cn(SECTION, "mt-3")}>Frozen services</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {phase.frozen_services.length === 0 ? (
              <li className="text-muted-foreground">none</li>
            ) : null}
            {phase.frozen_services.map((f) => (
              <li key={f.service} className="font-mono">
                {f.service}
                <span className="text-muted-foreground">
                  {" "}
                  · {f.mode} · {f.key_strategy || "canonical_v2"}
                </span>
              </li>
            ))}
          </ul>
          <div className={cn(SECTION, "mt-3")}>Fault events</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {faults.isError ? (
              <li className="text-status-down">{describeApiError(faults.error)}</li>
            ) : null}
            {faults.data && faults.data.fault_events.length === 0 ? (
              <li className="text-muted-foreground">
                {phase.started_at ? "No fault events recorded." : "Recorded once the phase starts."}
              </li>
            ) : null}
            {faults.data?.fault_events.map((ev) => (
              <li key={ev.id}>
                <span className="font-mono">{ev.source}</span>
                <span className="text-muted-foreground">
                  {ev.service ? ` · ${ev.service}` : ""} · {ev.kind}
                  {ev.started_at ? ` · opened ${formatRelative(ev.started_at)}` : ""}
                  {ev.ended_at ? ` · closed ${formatRelative(ev.ended_at)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Run timeline" className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">
            Run timeline <span className="font-normal text-muted-foreground">· zeus run.state</span>
          </h2>
          {runs === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No zeus runs yet.</p>
          ) : (
            phase.workflows
              .filter((w) => w.zeus_run_id)
              .map((w) => (
                <RunTimeline
                  key={w.zeus_run_id}
                  runId={w.zeus_run_id ?? ""}
                  name={workflowNames[w.workflow_id] ?? w.workflow_id}
                  live={active}
                  now={now}
                />
              ))
          )}
        </section>
      </div>

      <section aria-label="Results" className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Results</h2>
        {!terminal ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Latency percentiles, error rate, cache-hit rate and the fidelity verdict appear here
            when the phase finishes. Sourced from the harvested results when present, otherwise from
            the zeus run summary.
          </p>
        ) : results.isLoading ? (
          <p className="mt-2 text-xs text-muted-foreground">Loading results…</p>
        ) : metrics ? (
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_16rem]">
            <MetricsGrid metrics={metrics} phaseId={phaseId} />
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-xs">
              <dt className="text-muted-foreground">p50 · p95</dt>
              <dd className="font-mono">
                {formatLatencyUs(metrics.p50_us, decimals)} ·{" "}
                {formatLatencyUs(metrics.p95_us, decimals)}
              </dd>
              <dt className="text-muted-foreground">cache hit</dt>
              <dd className="font-mono">
                {cacheHit != null ? `${(cacheHit * 100).toFixed(1)}%` : "—"}
              </dd>
              <dt className="text-muted-foreground">verdict</dt>
              <dd className="font-mono">{results.results?.verdict?.verdict ?? "—"}</dd>
              <dt className="text-muted-foreground">drain</dt>
              <dd className="font-mono">{results.results?.drain?.status ?? "—"}</dd>
            </dl>
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-muted-foreground">
            {phase.status === "skipped"
              ? "Skipped — nothing measured."
              : "No results — nothing was harvested and zeus has no stats for this run (zeus may have restarted)."}
          </p>
        )}
      </section>
    </div>
  );
}

function ProgressLine({
  phase,
  progress,
}: { phase: PhaseDetailDto; progress: ReturnType<typeof phaseProgress> }) {
  if (phase.status === "pending") {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        starts automatically after the previous phase
      </p>
    );
  }
  if (!progress) return null;
  if (ACTIVE_PHASE_STATUSES.has(phase.status)) {
    return (
      <div className="mt-1">
        <p className="text-xs text-muted-foreground">
          {phase.status !== "running" ? `${phase.status} · ` : ""}
          {formatDurationMs(progress.elapsedMs)}
          {progress.plannedMs != null ? ` / ${formatDurationMs(progress.plannedMs)}` : ""} ·
          time-based (no mid-run metrics)
          <AcceleratedTag phaseId={phase.id} />
        </p>
        {progress.fraction != null ? (
          <progress
            aria-label={`${phase.name} progress`}
            value={Math.round(progress.fraction * 100)}
            max={100}
            className="mt-1 block h-1.5 w-72 max-w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
          />
        ) : null}
      </div>
    );
  }
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {formatDurationMs(progress.elapsedMs)} · {formatRelative(phase.started_at)}
      {phase.completed_at ? ` → ${formatRelative(phase.completed_at)}` : ""}
      <AcceleratedTag phaseId={phase.id} />
    </p>
  );
}

function WorkflowRow({
  workflow,
  name,
  live,
}: { workflow: PhaseWorkflow; name: string; live: boolean }) {
  const run = useZeusRun(workflow.zeus_run_id, live);
  const status = workflow.zeus_run_id
    ? (run.data?.status ?? (run.isError ? "unknown (zeus restarted?)" : "…"))
    : workflow.zeus_attack_id
      ? "attack"
      : "not started";
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{name}</TableCell>
      <TableCell className="text-right font-mono text-xs">{workflow.vus ?? "—"}</TableCell>
      <TableCell className="text-right font-mono text-xs">
        {workflow.rate_rps ? `${workflow.rate_rps} rps` : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {workflow.duration_sec ? `${workflow.duration_sec}s` : "—"}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {workflow.dataset_id ?? <span className="text-muted-foreground">default</span>}
      </TableCell>
      <TableCell
        className="font-mono text-xs"
        title={workflow.zeus_run_id ?? workflow.zeus_attack_id}
      >
        {workflow.zeus_run_id
          ? shortId(workflow.zeus_run_id)
          : workflow.zeus_attack_id
            ? shortId(workflow.zeus_attack_id)
            : "—"}
      </TableCell>
      <TableCell className="text-xs">
        {status}
        {run.data?.reason && run.data.status === "completed" ? (
          <span className="ml-1 text-status-degraded">· {run.data.reason}</span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function RunTimeline({
  runId,
  name,
  live,
  now,
}: { runId: string; name: string; live: boolean; now?: number }) {
  const run = useZeusRun(runId, live);
  const timeline = useRunStateTimeline(run.data, now != null ? () => now : undefined);
  return (
    <div className="mt-2">
      <div className="font-mono text-xs">
        {name} <span className="text-muted-foreground">· {shortId(runId)}</span>
        {run.data?.k6_job_name ? (
          <span className="text-muted-foreground"> · k6 job {run.data.k6_job_name}</span>
        ) : null}
      </div>
      <ol className="mt-1 space-y-0.5 text-xs">
        {run.isError ? (
          <li className="text-muted-foreground">
            zeus has no record of this run (state is in-memory; it may have restarted)
          </li>
        ) : null}
        {timeline.map((t: RunTransition) => (
          <li key={`${t.at}-${t.to}`} className="flex gap-2">
            <span className="font-mono text-muted-foreground">{clock(t.at)}</span>
            <span className="font-mono">
              {t.from ? `${t.from} → ` : ""}
              {t.to}
            </span>
          </li>
        ))}
        {run.data?.status === "running" ? (
          <li className="flex gap-2 text-muted-foreground">
            <span className="font-mono">—</span>
            <span className="font-mono">running → completed</span>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function FailureReason({ reason, runId }: { reason?: string; runId?: string }) {
  const run = useZeusRun(reason ? undefined : runId, false);
  const text =
    reason ??
    run.data?.reason ??
    (run.isLoading ? "…" : "reason unavailable — zeus may have restarted (its state is in-memory)");
  return <p className="mt-1 text-sm text-status-down">{text}</p>;
}
