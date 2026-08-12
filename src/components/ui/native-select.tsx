// DS contract names this primitive `core/Select` (a native <select> styled to
// match Input). The repo already exports `Select` as the Radix compound select
// (src/components/ui/select.tsx), so this native variant is exported as
// `NativeSelect` to avoid the name collision.
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface NativeSelectProps extends React.ComponentProps<"select"> {
  /** Red border + aria-invalid to signal a validation error. */
  invalid?: boolean;
  /** Options as strings or {value,label}. You can also pass <option> children. */
  options?: (string | SelectOption)[];
  /** Renders a disabled, hidden first option as the placeholder. */
  placeholder?: string;
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    {
      className,
      invalid,
      options,
      placeholder,
      children,
      defaultValue,
      value,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    // Default to the placeholder only when the select is uncontrolled.
    const resolvedDefault =
      value === undefined && defaultValue === undefined && placeholder !== undefined
        ? ""
        : defaultValue;

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          aria-invalid={invalid ? true : ariaInvalid}
          value={value}
          defaultValue={resolvedDefault}
          className={cn(
            "flex h-9 w-full appearance-none rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            invalid &&
              "border-destructive focus-visible:ring-destructive aria-[invalid=true]:border-destructive",
            className,
          )}
          {...props}
        >
          {placeholder !== undefined ? (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          ) : null}
          {options
            ? options.map((opt) => {
                const option: SelectOption =
                  typeof opt === "string" ? { value: opt, label: opt } : opt;
                return (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                );
              })
            : children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
