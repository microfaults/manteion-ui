import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { cn } from "@/lib/utils";

const TabsRoot = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/** A single tab in the data-driven underline tab bar (contract navigation/Tabs). */
export interface TabItem {
  value: string;
  label: React.ReactNode;
  /** Optional count badge after the label. */
  badge?: React.ReactNode;
}

/** Data-driven underline-tab-bar props. */
export interface TabsBarProps {
  tabs: TabItem[];
  /** Controlled active value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  style?: React.CSSProperties;
}

type TabsRootProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>;

type TabsProps = TabsRootProps & Partial<TabsBarProps>;

/**
 * Underline tab bar — experiment detail, run detail.
 *
 * Overload: when a `tabs` prop is provided, renders a data-driven underline
 * tab bar. Otherwise behaves as the Radix Root passthrough so existing compound
 * call sites that compose TabsList / TabsTrigger / TabsContent keep working
 * unchanged (with the original pill styling).
 */
function Tabs(props: TabsProps) {
  if (props.tabs === undefined) {
    return <TabsRoot {...(props as TabsRootProps)} />;
  }

  const { tabs, value, defaultValue, onValueChange, style } = props as TabsBarProps;

  return (
    <TabsRoot value={value} defaultValue={defaultValue} onValueChange={onValueChange} style={style}>
      <TabsPrimitive.List className="inline-flex h-9 items-center gap-4 border-b border-border">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className="-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-1 pb-2 pt-1 text-sm font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            {tab.label}
            {tab.badge != null && (
              <span className="font-mono text-xs text-muted-foreground">{tab.badge}</span>
            )}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsRoot>
  );
}
Tabs.displayName = "Tabs";

export { Tabs, TabsList, TabsTrigger, TabsContent };
