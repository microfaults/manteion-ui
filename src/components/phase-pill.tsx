import { cn } from "@/lib/utils";
import type { PhaseName, PhaseStatus } from "@/types/api";

interface PhasePillProps {
  name: PhaseName;
  status: PhaseStatus;
  /** Visual width — set to a fixed width so timelines align row-to-row. */
  widthPx?: number;
  className?: string;
}

const statusClasses: Record<PhaseStatus, string> = {
  pending: "bg-phase-pending",
  running: "bg-phase-isolation animate-pulse",
  completed: "bg-phase-baseline",
  failed: "bg-phase-failed",
};

const familyClasses: Partial<Record<string, string>> = {
  baseline: "bg-phase-baseline",
  "isolation-1a": "bg-phase-isolation",
  "isolation-1b": "bg-phase-isolation/80",
  "isolation-2a": "bg-phase-isolation",
  "isolation-2b": "bg-phase-isolation/80",
  combined: "bg-phase-combined",
};

export function PhasePill({ name, status, widthPx = 32, className }: PhasePillProps) {
  // Prefer family color unless pending/failed — those override with status color.
  const colorClass =
    status === "pending" || status === "failed"
      ? statusClasses[status]
      : (familyClasses[name] ?? statusClasses[status]);

  return (
    <span
      role="img"
      aria-label={`${name} — ${status}`}
      className={cn("inline-block h-4 rounded-sm align-middle", colorClass, className)}
      style={{ width: widthPx }}
      data-phase-name={name}
      data-phase-status={status}
    />
  );
}
