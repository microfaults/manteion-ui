import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

export interface ToastProps {
  kind?: "success" | "error" | "info";
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** Optional action element (e.g. a Button or link). */
  action?: React.ReactNode;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

const KIND_CONFIG = {
  success: {
    Icon: CheckCircle2,
    accent: "bg-status-healthy",
    iconColor: "text-status-healthy",
  },
  error: {
    Icon: AlertCircle,
    accent: "bg-destructive",
    iconColor: "text-destructive",
  },
  info: {
    Icon: Info,
    accent: "bg-primary",
    iconColor: "text-primary",
  },
} as const;

/**
 * Async confirmation toast — run started, rule pushed, SDK registered.
 *
 * Self-contained card on the dark popover surface with a left accent bar and a
 * leading icon colored by `kind`.
 */
export function Toast({ kind = "info", title, message, action, onDismiss, style }: ToastProps) {
  const { Icon, accent, iconColor } = KIND_CONFIG[kind];

  return (
    // biome-ignore lint/a11y/useSemanticElements: contract mandates role="status" on the toast container for an assertive-free live region
    <div
      role="status"
      style={style}
      className="relative flex items-start gap-3 overflow-hidden rounded-lg border border-border bg-popover py-3 pl-4 pr-3 text-popover-foreground shadow-lg"
    >
      <span aria-hidden className={cn("absolute left-0 top-0 h-full w-1", accent)} />

      <Icon className={cn("mt-0.5 size-4 shrink-0", iconColor)} aria-hidden />

      <div className="min-w-0 flex-1">
        {title != null && <div className="text-sm font-medium leading-tight">{title}</div>}
        {message != null && (
          <div className={cn("text-sm text-muted-foreground", title != null && "mt-0.5")}>
            {message}
          </div>
        )}
        {action != null && <div className="mt-2 flex items-center gap-2">{action}</div>}
      </div>

      {onDismiss != null && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
Toast.displayName = "Toast";
