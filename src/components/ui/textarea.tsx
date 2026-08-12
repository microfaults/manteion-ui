import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Red border + aria-invalid to signal a validation error. */
  invalid?: boolean;
  /** JetBrains Mono (default true) — for rule JSON / DSL / rego. */
  mono?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, mono = true, "aria-invalid": ariaInvalid, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid ? true : ariaInvalid}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          mono && "font-mono",
          invalid &&
            "border-destructive focus-visible:ring-destructive aria-[invalid=true]:border-destructive",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
