/**
 * What a phase measured. Harvested results first; zeus run stats as the
 * fallback for run-only phases (captioned, so the operator knows the numbers
 * came from zeus's in-memory summary rather than manteion's tables).
 */
import { type PhaseMetrics, pctDelta } from "@/lib/phase-metrics";
import { usePhaseMetrics } from "@/lib/use-phase-metrics";
import { formatCount, formatLatencyUs } from "@/lib/utils";
import { ACTIVE_PHASE_STATUSES, type PhaseSummary } from "@/types/api";
import { AlertTriangle } from "lucide-react";

export const ZEUS_FALLBACK_CAPTION =
  "via zeus run stats — manteion has no harvested row for this run";

export function MetricsGrid({
  metrics,
  baselineP99Us,
  caption,
}: {
  metrics: PhaseMetrics;
  baselineP99Us?: number;
  /** Prefix for the zeus caption (e.g. the workflow name). */
  caption?: string;
}) {
  const delta =
    metrics.p99_us != null && baselineP99Us ? pctDelta(baselineP99Us, metrics.p99_us) : undefined;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="p99" value={formatLatencyUs(metrics.p99_us)} delta={delta} />
        <Metric label="RPS" value={metrics.rps != null ? metrics.rps.toFixed(1) : "—"} />
        <Metric
          label="errors"
          value={metrics.error_rate != null ? `${(metrics.error_rate * 100).toFixed(2)}%` : "—"}
        />
      </div>
      {metrics.dropped_iterations ? (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] text-status-degraded">
          <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
          <span>
            {formatCount(metrics.dropped_iterations)} iterations dropped — the VUs could not sustain
            the offered rate, so the load ran below plan. Add VUs or lower the rate.
          </span>
        </p>
      ) : null}
      {metrics.source === "zeus" ? (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          {caption ? `${caption} · ` : ""}
          {ZEUS_FALLBACK_CAPTION}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-medium">{value}</div>
      {delta ? (
        <div
          className={
            delta.startsWith("-")
              ? "text-[10px] text-status-healthy"
              : "text-[10px] text-status-down"
          }
        >
          {delta}
        </div>
      ) : null}
    </div>
  );
}

/** Results block for one phase row: fetches on its own, renders by status. */
export function PhaseRowResults({
  experimentId,
  phase,
  baselineP99Us,
}: {
  experimentId: string;
  phase: PhaseSummary;
  baselineP99Us?: number;
}) {
  const state = usePhaseMetrics(experimentId, phase);
  if (phase.status === "pending") return null;
  if (ACTIVE_PHASE_STATUSES.has(phase.status)) {
    return (
      <p className="text-xs italic text-muted-foreground">
        Metrics land when the phase completes — zeus reports only a final summary.
      </p>
    );
  }
  if (phase.status === "skipped") {
    return <p className="text-xs italic text-muted-foreground">Skipped — nothing measured.</p>;
  }
  if (state.isLoading) return <p className="text-xs text-muted-foreground">Loading results…</p>;
  if (state.metrics) {
    const caption = phase.workflows.length === 1 ? phase.workflows[0]?.workflow_id : undefined;
    return <MetricsGrid metrics={state.metrics} baselineP99Us={baselineP99Us} caption={caption} />;
  }
  const drove = phase.workflows.some((w) => w.zeus_run_id || w.zeus_attack_id);
  return (
    <p className="text-xs italic text-muted-foreground">
      {drove
        ? "No results — nothing was harvested and zeus has no stats for this run (zeus may have restarted)."
        : "No load ran — the phase ended before zeus started any run or attack."}
    </p>
  );
}
