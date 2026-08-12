import type * as React from "react";

import { cn } from "@/lib/utils";

export interface SidebarItemProps {
  /** Icon element (e.g. a 16px lucide glyph). */
  icon?: React.ReactNode;
  label: React.ReactNode;
  active?: boolean;
  /** Render as an uppercase section heading instead of a nav row. */
  sectionLabel?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Nav row for the black sidebar — active = blue left accent bar.
 *
 * When `sectionLabel` is set, renders an uppercase section heading instead of
 * an interactive nav row.
 */
export function SidebarItem({
  icon,
  label,
  active,
  sectionLabel,
  onClick,
  style,
}: SidebarItemProps) {
  if (sectionLabel) {
    return (
      <div
        style={style}
        className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-sidebar-muted"
      >
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={style}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-11 sm:min-h-0",
        active
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-0.5 rounded-r bg-sidebar-primary"
        />
      )}
      {icon != null && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  );
}
SidebarItem.displayName = "SidebarItem";
