import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        "status-healthy": "border-status-healthy/30 bg-status-healthy/15 text-status-healthy",
        "status-degraded": "border-status-degraded/30 bg-status-degraded/15 text-status-degraded",
        "status-down": "border-status-down/30 bg-status-down/15 text-status-down",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** Per-variant fill for the optional leading dot; non-status variants inherit currentColor. */
const dotVariants: Partial<
  Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, string>
> = {
  "status-healthy": "bg-status-healthy",
  "status-degraded": "bg-status-degraded",
  "status-down": "bg-status-down",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Render a leading filled dot (auto-colored for status variants). */
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden
          className={cn(
            "inline-block size-1.5 shrink-0 rounded-full",
            (variant && dotVariants[variant]) ?? "bg-current",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
