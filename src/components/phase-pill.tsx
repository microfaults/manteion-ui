import { cn } from "@/lib/utils";
import type { PhaseName, PhaseStatus } from "@/types/api";

interface PhasePillProps {
  /** Free-form phase name; family color matches by prefix (e.g. "isolation-productcatalog"). */
  name?: PhaseName;
  status?: PhaseStatus;
  /** Fixed pixel width so timelines align row-to-row. */
  width?: number;
  /** @deprecated alias for {@link PhasePillProps.width}; `width` wins when both are set. */
  widthPx?: number;
  className?: string;
  style?: React.CSSProperties;
}

const statusClasses: Record<PhaseStatus, string> = {
  pending: "bg-phase-pending",
  running: "bg-phase-isolation animate-pulse",
  paused: "bg-status-degraded",
  completed: "bg-phase-baseline",
  failed: "bg-phase-failed",
  skipped: "bg-phase-pending/50",
};

/** Phase names are free-form; the baseline/isolation/combined typology is a
 *  naming convention (e.g. "isolation-productcatalog"), so match by prefix. */
function familyClass(name: string): string | undefined {
  if (name.startsWith("baseline")) return "bg-phase-baseline";
  if (name.startsWith("isolation")) return "bg-phase-isolation";
  if (name.startsWith("combined")) return "bg-phase-combined";
  return undefined;
}

export function PhasePill({
  name = "baseline",
  status = "pending",
  width,
  widthPx,
  className,
  style,
}: PhasePillProps) {
  // `width` wins over the legacy `widthPx` alias; fall back to the 32px default.
  const resolvedWidth = width ?? widthPx ?? 32;

  // Family color only while the phase ran or is running — pending/failed/
  // paused/skipped override with status color.
  const colorClass =
    status === "running" || status === "completed"
      ? (familyClass(name) ?? statusClasses[status])
      : statusClasses[status];

  return (
    <span
      role="img"
      aria-label={`${name} — ${status}`}
      className={cn("inline-block h-4 rounded-sm align-middle", colorClass, className)}
      style={{ width: resolvedWidth, ...style }}
      data-phase-name={name}
      data-phase-status={status}
    />
  );
}
