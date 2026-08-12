import type * as React from "react";

import { cn } from "@/lib/utils";

export type StatusKind =
  | "healthy"
  | "degraded"
  | "down"
  | "unknown"
  | "complete"
  | "running"
  | "stopped";

const statusClasses: Record<StatusKind, string> = {
  healthy: "bg-status-healthy",
  degraded: "bg-status-degraded",
  down: "bg-status-down",
  unknown: "bg-muted-foreground/40",
  /** Completed / success path — matches Figma blue dot on experiment rows */
  complete: "bg-primary",
  /** Live / in-flight — Figma blue, pair with `pulse` for the breathing signal */
  running: "bg-primary",
  stopped: "bg-status-unknown",
};

export interface StatusDotProps {
  status?: StatusKind;
  /** Optional capitalized label to the right of the dot. */
  label?: React.ReactNode;
  /** Pulse opacity — for live/running states. */
  pulse?: boolean;
  /** Diameter in px (drives width/height). Defaults to 8. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function StatusDot({
  status = "unknown",
  label,
  pulse,
  size = 8,
  className,
  style,
}: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} style={style}>
      <span
        aria-hidden
        className={cn(
          "inline-block shrink-0 rounded-full",
          statusClasses[status],
          pulse && "animate-pulse opacity-80",
        )}
        style={{ width: size, height: size }}
      />
      {label != null ? <span className="text-sm">{label}</span> : null}
    </span>
  );
}
