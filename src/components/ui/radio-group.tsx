"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface RadioOption {
  value: string;
  label: string;
  /** Optional secondary line under the label. */
  hint?: string;
}

export interface RadioGroupProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /** Options as strings or {value,label,hint}. When provided, items render internally. */
  options?: (string | RadioOption)[];
  /** Lay items out vertically (default) or in a horizontal row. */
  orientation?: "vertical" | "horizontal";
}

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(({ className, options, orientation = "vertical", children, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn(
        "grid gap-2",
        orientation === "horizontal" && "grid-flow-col auto-cols-max gap-4",
        className,
      )}
      orientation={orientation}
      {...props}
      ref={ref}
    >
      {options
        ? options.map((opt) => {
            const option: RadioOption = typeof opt === "string" ? { value: opt, label: opt } : opt;
            const itemId = `${props.name ?? "radio"}-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={itemId}
                className="flex cursor-pointer items-start gap-2"
              >
                <RadioGroupItem id={itemId} value={option.value} className="mt-0.5" />
                <span className="grid gap-0.5 leading-none">
                  <span className="text-sm font-medium">{option.label}</span>
                  {option.hint ? (
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  ) : null}
                </span>
              </label>
            );
          })
        : children}
    </RadioGroupPrimitive.Root>
  );
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-3.5 w-3.5 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
