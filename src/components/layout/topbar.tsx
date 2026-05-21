import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** A breadcrumb is either a plain label or an object that adds a navigation
 *  target. The string form is kept for backward compatibility so existing
 *  call sites don't have to change. */
export type Crumb = string | { label: string; to: string };

interface TopbarProps {
  breadcrumbs: Crumb[];
  action?: ReactNode;
  className?: string;
}

function crumbLabel(c: Crumb): string {
  return typeof c === "string" ? c : c.label;
}
function crumbTo(c: Crumb): string | undefined {
  return typeof c === "string" ? undefined : c.to;
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
        {breadcrumbs.map((crumb, i) => {
          const label = crumbLabel(crumb);
          const to = crumbTo(crumb);
          // Last crumb is the current page — never linked, always emphasized.
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={label} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {!isLast && to ? (
                <Link to={to} className="transition-colors hover:text-foreground">
                  {label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-foreground" : ""}>{label}</span>
              )}
            </span>
          );
        })}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
