import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { experimentsApi } from "@/lib/api";
import { formatDurationMs, formatLatencyUs } from "@/lib/utils";
import type { PhaseName, PhaseStatus, PhaseSummary } from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

interface PhaseHoverCardProps {
  experimentId: string;
  phase: PhaseName;
  statusHint: PhaseStatus;
  /** Optional inline summary so the card renders immediately without waiting for fetch. */
  fallbackSummary?: PhaseSummary;
  children: ReactNode;
}

const statusVariants: Record<PhaseStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-phase-isolation text-white",
  completed: "bg-status-healthy text-white",
  failed: "bg-status-down text-white",
};

export function PhaseHoverCard({
  experimentId,
  phase,
  statusHint,
  fallbackSummary,
  children,
}: PhaseHoverCardProps) {
  const isLive = statusHint === "running";

  const query = useQuery({
    queryKey: ["phase", experimentId, phase],
    queryFn: () => experimentsApi.getPhaseStatus(experimentId, phase),
    // Only fetch when user actually hovers (triggered by HoverCard — always enabled, but cached).
    staleTime: isLive ? 2_000 : 30_000,
    refetchInterval: isLive ? 2_000 : false,
    // If the backend endpoint doesn't exist yet, fall back gracefully.
    retry: false,
    initialData: fallbackSummary,
  });

  const summary = query.data ?? fallbackSummary;

  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-96" side="top" align="start" sideOffset={6}>
        <div className="flex items-start justify-between gap-2">
          <div className="font-mono text-sm font-medium">{phase}</div>
          <Badge variant="secondary" className={statusVariants[summary?.status ?? statusHint]}>
            {summary?.status ?? statusHint}
          </Badge>
        </div>

        {summary?.frozen_services?.length ? (
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Services frozen (cache-box)
            </div>
            <ul className="mt-1 space-y-0.5">
              {summary.frozen_services.map((fs) => (
                <li key={fs.service} className="font-mono text-xs">
                  {fs.service} <span className="text-muted-foreground">· {fs.mode}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary?.applied_rules?.length ? (
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rules applied
            </div>
            <ul className="mt-1 space-y-0.5">
              {summary.applied_rules.map((r) => (
                <li key={r.rule_id} className="text-xs">
                  <span className="font-mono">{r.name}</span>{" "}
                  <span className="text-muted-foreground">· {r.target_summary}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary?.metrics ? (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
            <Metric
              label="p99"
              value={formatLatencyUs(summary.metrics.p99_us)}
              delta={
                summary.metrics.p99_us && summary.metrics.baseline_p99_us
                  ? pctDelta(summary.metrics.baseline_p99_us, summary.metrics.p99_us)
                  : undefined
              }
            />
            <Metric
              label="RPS"
              value={summary.metrics.rps ? summary.metrics.rps.toFixed(1) : "—"}
            />
            <Metric
              label="errors"
              value={
                summary.metrics.error_rate != null
                  ? `${(summary.metrics.error_rate * 100).toFixed(2)}%`
                  : "—"
              }
            />
          </div>
        ) : summary?.status === "pending" ? (
          <p className="mt-3 text-xs italic text-muted-foreground">Not run yet.</p>
        ) : null}

        {summary?.duration_ms ? (
          <div className="mt-2 text-[11px] text-muted-foreground">
            duration · {formatDurationMs(summary.duration_ms)}
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-end border-t border-border pt-2 text-xs">
          <a
            href={`/experiments/${experimentId}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open experiment <ArrowRight className="size-3" aria-hidden />
          </a>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
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

function pctDelta(baseline: number, current: number): string {
  if (!baseline) return "";
  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}% vs baseline`;
}
