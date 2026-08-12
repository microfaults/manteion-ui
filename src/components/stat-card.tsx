import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

type StatAccent = "blue" | "red" | "green" | "amber" | "purple" | "neutral";

interface StatCardProps {
  /** Uppercase eyebrow label. */
  label: ReactNode;
  /** Big top-line value (string or mono number). */
  value: ReactNode;
  /** Optional delta pill — direction colors it (up=green, down=red). */
  delta?: { value: string; direction: "up" | "down" | "flat" };
  /** Muted footer note under the value. */
  footer?: ReactNode;
  /** Accent color for the top bar + hover glow. */
  accent?: StatAccent;
  /** Optional icon (e.g. a lucide glyph) in the top-right. */
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const accentBar: Record<StatAccent, string> = {
  blue: "bg-primary",
  red: "bg-status-down",
  green: "bg-status-healthy",
  amber: "bg-status-degraded",
  purple: "bg-chart-5",
  neutral: "bg-border-strong",
};

const accentGlow: Record<StatAccent, string> = {
  blue: "hover:ring-primary/40",
  red: "hover:ring-status-down/40",
  green: "hover:ring-status-healthy/40",
  amber: "hover:ring-status-degraded/40",
  purple: "hover:ring-chart-5/40",
  neutral: "hover:ring-border-strong/40",
};

export function StatCard({
  label,
  value,
  delta,
  footer,
  accent = "neutral",
  icon,
  className,
  style,
}: StatCardProps) {
  return (
    <Card
      style={style}
      className={cn(
        "relative overflow-hidden border-border transition-shadow hover:ring-1",
        accentGlow[accent],
        className,
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-0.5", accentBar[accent])} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {icon ? <div className="shrink-0 text-muted-foreground">{icon}</div> : null}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
        {delta ? (
          <div
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-medium",
              delta.direction === "up" && "text-status-healthy",
              delta.direction === "down" && "text-status-down",
              delta.direction === "flat" && "text-muted-foreground",
            )}
          >
            {delta.direction === "up" && "▲"}
            {delta.direction === "down" && "▼"}
            {delta.direction === "flat" && "·"}
            <span>{delta.value}</span>
          </div>
        ) : null}
        {footer ? <div className="mt-3 text-xs text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
