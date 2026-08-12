import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Red border + focus ring to signal a validation error. */
  invalid?: boolean;
  /** Use JetBrains Mono — for IDs, latencies, rule names, durations. */
  mono?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, mono, "aria-invalid": ariaInvalid, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={invalid ? true : ariaInvalid}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          invalid &&
            "border-destructive focus-visible:ring-destructive aria-[invalid=true]:border-destructive",
          mono && "font-mono",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
