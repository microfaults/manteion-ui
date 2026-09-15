/**
 * Phases tab of the experiment detail (artboard `Main`): one row per phase
 * with pill + status, time-based progress while in flight, workflows with
 * live zeus run status, rule chips (disabled ones flagged — the orchestrator
 * skips them silently), frozen services, fault events on demand, results or
 * the zeus fallback when terminal, failure reasons, and per-phase actions.
 */
import { PhaseRowResults } from "@/components/experiments/phase-row-results";
import { PhasePill } from "@/components/phase-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { phasesApi } from "@/lib/api";
import type { PhaseFinalStatus } from "@/lib/api/phases";
import type { RuleRef } from "@/lib/experiment-draft";
import { baselinePhase, phaseDatasetIds, phaseProgress } from "@/lib/phase-metrics";
import { usePhaseMetrics } from "@/lib/use-phase-metrics";
import { useZeusRun } from "@/lib/use-zeus-run";
import { cn, formatDurationMs, formatRelative } from "@/lib/utils";
import {
  ACTIVE_PHASE_STATUSES,
  type Experiment,
  type PhaseStatus,
  type PhaseSummary,
} from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export type PhaseAction =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "start" }
  | { type: "stop"; status: PhaseFinalStatus };

interface PhaseTimelineProps {
  experiment: Experiment;
  rules: readonly RuleRef[];
  workflowNames?: Readonly<Record<string, string>>;
  onPhaseAction?: (phase: PhaseSummary, action: PhaseAction) => void;
  /** Disable action buttons while a mutation is in flight. */
  busy?: boolean;
  /** Clock override for deterministic progress (tests). */
  now?: number;
}

const statusBadge: Record<
  PhaseStatus,
  "default" | "secondary" | "outline" | "status-healthy" | "status-degraded" | "status-down"
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

export function PhaseTimeline({
  experiment,
  rules,
  workflowNames = {},
  onPhaseAction,
  busy = false,
  now,
}: PhaseTimelineProps) {
  const phases = [...experiment.phases].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const baseline = baselinePhase(phases);
  const baselineState = usePhaseMetrics(experiment.id, baseline);
  const anyActive = phases.some((p) => ACTIVE_PHASE_STATUSES.has(p.status));

  if (phases.length === 0) {
    return <p className="text-sm text-muted-foreground">This experiment has no phases.</p>;
  }
  return (
    <ol className="space-y-3">
      {phases.map((phase) => (
        <PhaseRow
          key={phase.id}
          experiment={experiment}
          phase={phase}
          rules={rules}
          workflowNames={workflowNames}
          baselineP99Us={phase.id === baseline?.id ? undefined : baselineState.metrics?.p99_us}
          canStart={experiment.status === "running" && !anyActive && phase.status === "pending"}
          onAction={onPhaseAction ? (a) => onPhaseAction(phase, a) : undefined}
          busy={busy}
          now={now}
        />
      ))}
    </ol>
  );
}

function PhaseRow({
  experiment,
  phase,
  rules,
  workflowNames,
  baselineP99Us,
  canStart,
  onAction,
  busy,
  now,
}: {
  experiment: Experiment;
  phase: PhaseSummary;
  rules: readonly RuleRef[];
  workflowNames: Readonly<Record<string, string>>;
  baselineP99Us?: number;
  canStart: boolean;
  onAction?: (action: PhaseAction) => void;
  busy: boolean;
  now?: number;
}) {
  const [stopStatus, setStopStatus] = useState<PhaseFinalStatus>("completed");
  const active = ACTIVE_PHASE_STATUSES.has(phase.status);
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  const attached = phase.rule_ids.map(
    (id) => rulesById.get(id) ?? { id, name: id, service: "", enabled: true },
  );
  const disabledAttached = attached.filter((r) => !r.enabled);
  const firstRunId = phase.workflows.find((w) => w.zeus_run_id)?.zeus_run_id;

  return (
    <li
      aria-label={`Phase ${phase.name}`}
      className={cn("rounded-lg border border-border bg-card p-4", active && "border-primary/40")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <PhasePill name={phase.name} status={phase.status} widthPx={14} className="mt-1 h-5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{phase.name}</span>
            <Badge variant={statusBadge[phase.status]} dot={phase.status !== "pending"}>
              {phase.status}
            </Badge>
            {phase.persist_cache ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                persist_cache
              </Badge>
            ) : null}
          </div>
          <Timing phase={phase} now={now} />
        </div>
        {onAction ? (
          <div className="flex items-center gap-1.5">
            {phase.status === "running" || phase.status === "draining" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAction({ type: "pause" })}
              >
                Pause
              </Button>
            ) : null}
            {phase.status === "paused" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAction({ type: "resume" })}
              >
                Resume
              </Button>
            ) : null}
            {active ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onAction({ type: "stop", status: stopStatus })}
                >
                  Stop
                </Button>
                <NativeSelect
                  aria-label={`Stop status for ${phase.name}`}
                  className="h-8 w-28 text-xs"
                  value={stopStatus}
                  onChange={(e) => setStopStatus(e.target.value as PhaseFinalStatus)}
                  options={["completed", "failed", "skipped"]}
                />
              </>
            ) : null}
            {canStart ? (
              <Button size="sm" disabled={busy} onClick={() => onAction({ type: "start" })}>
                Start now
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className={SECTION}>Workflows</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {phase.workflows.length === 0 ? <li className="text-muted-foreground">none</li> : null}
            {phase.workflows.map((w) => (
              <li
                key={`${w.workflow_id}-${w.zeus_run_id ?? ""}`}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="font-mono">{workflowNames[w.workflow_id] ?? w.workflow_id}</span>
                <span className="text-muted-foreground">
                  · {w.vus ?? "—"} VUs{w.rate_rps ? ` · ${w.rate_rps} rps` : ""} ·{" "}
                  {w.duration_sec ?? "—"}s
                </span>
                {w.zeus_run_id ? <ZeusRunStatus runId={w.zeus_run_id} live={active} /> : null}
                {w.zeus_attack_id ? (
                  <span
                    className="font-mono text-[11px] text-muted-foreground"
                    title={w.zeus_attack_id}
                  >
                    · {shortId(w.zeus_attack_id)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className={SECTION}>Rules</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {attached.length === 0 ? <span className="text-muted-foreground">none</span> : null}
            {attached.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5"
              >
                <span className="font-mono">{r.name}</span>
                {r.service ? <span className="text-muted-foreground">· {r.service}</span> : null}
                {!r.enabled ? (
                  <Badge variant="status-degraded" className="px-1.5 py-0 text-[10px]">
                    disabled
                  </Badge>
                ) : null}
              </span>
            ))}
          </div>
          {disabledAttached.length > 0 && phase.status === "pending" ? (
            <p className="mt-1.5 text-xs text-status-degraded">
              {disabledAttached.length} attached rule{disabledAttached.length > 1 ? "s are" : " is"}{" "}
              disabled — skipped when this phase starts.{" "}
              <a href="/rules" className="text-primary hover:underline">
                Enable on Rules
              </a>
            </p>
          ) : null}
          <div className={cn(SECTION, "mt-2")}>Frozen</div>
          <div className="mt-1 text-xs">
            {phase.frozen_services.length === 0 ? (
              <span className="text-muted-foreground">none</span>
            ) : (
              phase.frozen_services.map((f) => (
                <span key={f.service} className="mr-2 font-mono">
                  {f.service} <span className="text-muted-foreground">· {f.mode}</span>
                </span>
              ))
            )}
          </div>
          {phaseDatasetIds(phase).length > 0 ? (
            <>
              <div className={cn(SECTION, "mt-2")}>Datasets</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                {phaseDatasetIds(phase).map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-border px-1.5 py-0.5 font-mono"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {phase.status === "failed" ? <FailureReason phase={phase} runId={firstRunId} /> : null}

      {phase.started_at ? <FaultEvents phaseId={phase.id} now={now} /> : null}

      <div className="mt-3">
        <PhaseRowResults experimentId={experiment.id} phase={phase} baselineP99Us={baselineP99Us} />
      </div>
    </li>
  );
}

function Timing({ phase, now }: { phase: PhaseSummary; now?: number }) {
  const progress = phaseProgress(phase, now);
  if (phase.status === "pending") {
    return (
      <p className="mt-0.5 text-xs text-muted-foreground">
        starts automatically after the previous phase
      </p>
    );
  }
  if (!progress) return <p className="mt-0.5 text-xs text-muted-foreground">not started</p>;
  if (ACTIVE_PHASE_STATUSES.has(phase.status)) {
    const planned = progress.plannedMs != null ? ` / ${formatDurationMs(progress.plannedMs)}` : "";
    return (
      <div className="mt-1">
        <p className="text-xs text-muted-foreground">
          {phase.status === "running" ? "" : `${phase.status} · `}
          {formatDurationMs(progress.elapsedMs)}
          {planned} · time-based
        </p>
        {progress.fraction != null ? (
          <progress
            aria-label={`${phase.name} progress`}
            value={Math.round(progress.fraction * 100)}
            max={100}
            className={cn(
              "mt-1 block h-1.5 w-64 max-w-full appearance-none overflow-hidden rounded-full bg-muted",
              "[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full",
              phase.status === "paused"
                ? "[&::-moz-progress-bar]:bg-status-degraded [&::-webkit-progress-value]:bg-status-degraded"
                : "[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary",
            )}
          />
        ) : null}
      </div>
    );
  }
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {formatDurationMs(progress.elapsedMs)} · {formatRelative(phase.started_at)}
      {phase.completed_at ? ` → ${formatRelative(phase.completed_at)}` : ""}
    </p>
  );
}

function ZeusRunStatus({ runId, live }: { runId: string; live: boolean }) {
  const run = useZeusRun(runId, live);
  const status = run.data?.status ?? (run.isError ? "unknown" : undefined);
  return (
    <span className="font-mono text-[11px] text-muted-foreground" title={runId}>
      · {shortId(runId)}
      {status ? ` · ${status}` : ""}
      {run.data?.reason && run.data.status === "completed" ? (
        <span className="text-status-degraded"> · {run.data.reason}</span>
      ) : null}
    </span>
  );
}

function FailureReason({ phase, runId }: { phase: PhaseSummary; runId?: string }) {
  const run = useZeusRun(phase.failure_reason ? undefined : runId, false);
  const reason =
    phase.failure_reason ??
    run.data?.reason ??
    (run.isLoading ? "…" : "reason unavailable — zeus may have restarted (its state is in-memory)");
  return <p className="mt-3 text-xs text-status-down">{reason}</p>;
}

function FaultEvents({ phaseId, now }: { phaseId: string; now?: number }) {
  const [open, setOpen] = useState(false);
  const faults = useQuery({
    queryKey: ["phase-faults", phaseId],
    queryFn: () => phasesApi.getPhaseFaults(phaseId),
    enabled: open,
    staleTime: 15_000,
    retry: false,
  });
  return (
    <details
      className="mt-3"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={cn(SECTION, "cursor-pointer select-none")}>Fault events</summary>
      {faults.isLoading ? <p className="mt-1 text-xs text-muted-foreground">Loading…</p> : null}
      {faults.isError ? (
        <p className="mt-1 text-xs text-status-down">Couldn't load fault events.</p>
      ) : null}
      {faults.data ? (
        <ul className="mt-1 space-y-0.5 text-xs">
          {faults.data.fault_events.length === 0 ? (
            <li className="text-muted-foreground">No fault events recorded.</li>
          ) : null}
          {faults.data.fault_events.map((ev) => (
            <li key={ev.id}>
              <span className="font-mono">{ev.source}</span>
              <span className="text-muted-foreground">
                {ev.service ? ` · ${ev.service}` : ""} · {ev.kind}
                {ev.started_at ? ` · opened ${relativeTo(ev.started_at, now)}` : ""}
                {ev.ended_at ? ` · closed ${relativeTo(ev.ended_at, now)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function relativeTo(iso: string, now?: number): string {
  if (now == null) return formatRelative(iso);
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}
