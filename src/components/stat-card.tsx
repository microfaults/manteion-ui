import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  footer?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, delta, footer, className }: StatCardProps) {
  return (
    <Card className={cn("border-border", className)}>
      <CardContent className="p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
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
