import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TopbarProps {
  breadcrumbs: string[];
  action?: ReactNode;
  className?: string;
}

export function Topbar({ breadcrumbs, action, className }: TopbarProps) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6",
        className,
      )}
    >
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={`${crumb}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50">/</span>}
            <span
              className={
                i === breadcrumbs.length - 1
                  ? "font-medium text-foreground"
                  : ""
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
