"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** Contract feedback/Tooltip props. */
export interface TooltipProps {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  style?: React.CSSProperties;
}

type TooltipRootProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>;

type TooltipComponentProps = TooltipRootProps & Partial<TooltipProps>;

/**
 * Hover/focus tooltip on a floating dark surface.
 *
 * Overload: when a `content` prop is provided, self-composes
 * Provider + Root + Trigger (asChild) + Content so callers can drop a tooltip
 * onto any element, rendered on the dark popover surface (never the blue
 * primary token). Otherwise behaves as the Radix Root passthrough so existing
 * compound call sites that compose TooltipTrigger / TooltipContent keep
 * working unchanged.
 */
function Tooltip(props: TooltipComponentProps) {
  if (props.content === undefined) {
    return <TooltipRoot {...(props as TooltipRootProps)} />;
  }

  const { content, side = "top", children, style } = props as TooltipProps;

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} style={style}>
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
Tooltip.displayName = "Tooltip";

export { Tooltip, TooltipRoot, TooltipTrigger, TooltipContent, TooltipProvider };
