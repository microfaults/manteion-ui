import { cn } from "@/lib/utils";

type Status = "healthy" | "degraded" | "down" | "unknown" | "complete" | "stopped";

const statusClasses: Record<Status, string> = {
  healthy: "bg-status-healthy",
  degraded: "bg-status-degraded",
  down: "bg-status-down",
  unknown: "bg-muted-foreground/40",
  /** Completed / success path — matches Figma blue dot on experiment rows */
  complete: "bg-primary",
  stopped: "bg-zinc-400",
};

interface StatusDotProps {
  status: Status;
  label?: string;
  className?: string;
}

export function StatusDot({ status, label, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className={cn("inline-block size-2 rounded-full", statusClasses[status])} />
      {label ? <span className="text-sm">{label}</span> : null}
    </span>
  );
}
