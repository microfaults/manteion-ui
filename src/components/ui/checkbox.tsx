"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onCheckedChange"> {
  onCheckedChange?: (checked: boolean) => void;
  /** Optional inline label rendered to the right. */
  label?: React.ReactNode;
}

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, label, id, onCheckedChange, ...props }, ref) => {
    const box = (
      <CheckboxPrimitive.Root
        ref={ref}
        id={id}
        onCheckedChange={(state) => onCheckedChange?.(state === true)}
        className={cn(
          "peer size-4 shrink-0 rounded-sm border border-input shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
          <Check className="size-3.5" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );

    if (label == null) {
      return box;
    }

    return (
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium leading-none"
      >
        {box}
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
