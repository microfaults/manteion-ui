import { MetricsGrid } from "@/components/experiments/phase-row-results";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { experimentsApi } from "@/lib/api";
import { type PhaseMetrics, phaseProgress } from "@/lib/phase-metrics";
import { usePhaseMetrics } from "@/lib/use-phase-metrics";
import { formatDurationMs } from "@/lib/utils";
import {
  ACTIVE_PHASE_STATUSES,
  type PhaseName,
  type PhaseStatus,
  type PhaseSummary,
} from "@/types/api";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useState } from "react";

interface PhaseHoverCardProps {
  experimentId: string;
  /** Phase row id — phases are fetched by id (names are only unique per experiment). */
  phaseId: string;
  /** Free-form display name (e.g. "isolation-productcatalog"). */
  phase: PhaseName;
  statusHint: PhaseStatus;
  /** Optional inline summary so the card renders immediately without waiting for fetch. */
  fallbackSummary?: PhaseSummary;
  /** The experiment's baseline phase — its p99 anchors the delta line. */
  baselinePhase?: PhaseSummary;
  /** Open the card immediately (tests / debugging). */
  defaultOpen?: boolean;
  children: ReactNode;
}

const statusBadgeVariant: Record<
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

/**
 * Fetches the phase summary only while the card is open. Experiment lists
 * render one pill per phase — an always-enabled query here meant N eager
 * requests on mount plus 2s polling for every running phase, hovered or not.
 */
export function PhaseHoverCard({
  experimentId,
  phaseId,
  phase,
  statusHint,
  fallbackSummary,
  baselinePhase,
  defaultOpen = false,
  children,
}: PhaseHoverCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isLive = ACTIVE_PHASE_STATUSES.has(statusHint);

  const query = useQuery({
    queryKey: ["phase", experimentId, phaseId],
    queryFn: () => experimentsApi.getPhaseStatus(experimentId, phaseId),
    enabled: open,
    staleTime: isLive ? 2_000 : 30_000,
    refetchInterval: open && isLive ? 2_000 : false,
    retry: false,
    // Shown while the real phase loads; never persisted as if it were fetched.
    placeholderData: fallbackSummary,
  });

  const summary = query.data ?? fallbackSummary;
  // Terminal phases fetch their results (zeus fallback) only while the card is open.
  const own = usePhaseMetrics(experimentId, summary, open);
  const base = usePhaseMetrics(experimentId, baselinePhase, open && baselinePhase?.id !== phaseId);
  const metrics = own.metrics;
  const baselineP99Us = baselinePhase?.id === phaseId ? undefined : base.metrics?.p99_us;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-96" side="top" align="start" sideOffset={6}>
        <PhaseSummaryContent
          experimentId={experimentId}
          phase={phase}
          status={summary?.status ?? statusHint}
          summary={summary}
          metrics={metrics}
          baselineP99Us={baselineP99Us}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

const SECTION_LABEL = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

/** Presentational body of the hover card — pure render of a PhaseSummary
 *  plus optional derived metrics (the backend keeps results off the phase). */
export function PhaseSummaryContent({
  experimentId,
  phase,
  status,
  summary,
  metrics,
  baselineP99Us,
}: {
  experimentId: string;
  phase: PhaseName;
  status: PhaseStatus;
  summary?: PhaseSummary;
  metrics?: PhaseMetrics;
  baselineP99Us?: number;
}) {
  const progress = summary ? phaseProgress(summary) : null;
  const inFlight = ACTIVE_PHASE_STATUSES.has(status);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-sm font-medium">{phase}</div>
        <Badge variant={statusBadgeVariant[status]} dot={status !== "pending"}>
          {status}
        </Badge>
      </div>

      {summary?.frozen_services.length ? (
        <div className="mt-3">
          <div className={SECTION_LABEL}>Services frozen (cache-box)</div>
          <ul className="mt-1 space-y-0.5">
            {summary.frozen_services.map((fs) => (
              <li key={fs.service} className="font-mono text-xs">
                {fs.service} <span className="text-muted-foreground">· {fs.mode}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary?.rule_ids.length ? (
        <div className="mt-3">
          <div className={SECTION_LABEL}>Rules attached</div>
          <ul className="mt-1 flex flex-wrap gap-1">
            {summary.rule_ids.map((id) => (
              <li key={id} className="rounded-sm border border-border px-1.5 font-mono text-xs">
                {id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {metrics ? (
        <div className="mt-3">
          <MetricsGrid metrics={metrics} baselineP99Us={baselineP99Us} />
        </div>
      ) : status === "pending" ? (
        <p className="mt-3 text-xs italic text-muted-foreground">Not run yet.</p>
      ) : null}

      {status === "failed" && summary?.failure_reason ? (
        <p className="mt-3 text-xs text-status-down">{summary.failure_reason}</p>
      ) : null}

      {progress ? (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {inFlight ? "elapsed" : "duration"} · {formatDurationMs(progress.elapsedMs)}
          {inFlight && progress.plannedMs != null
            ? ` / ${formatDurationMs(progress.plannedMs)}`
            : ""}
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
    </>
  );
}
