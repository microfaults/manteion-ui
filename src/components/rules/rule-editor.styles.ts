import { cva } from "class-variance-authority";

/** Outer chrome for the right-hand rule editor panel. */
export const panelChrome = cva("flex h-full flex-col overflow-hidden");

/** Top bar — title + Enabled switch. */
export const panelHeader = cva("flex items-center justify-between border-b px-4 py-3");
export const panelTitle = cva("truncate text-sm font-semibold");

/** Scrolling field stack between header and footer. */
export const fieldStack = cva("flex-1 space-y-4 overflow-y-auto px-4 py-4");

/** Sticky footer with Delete / Save. */
export const panelFooter = cva("space-y-2 border-t px-4 py-3");
export const panelFooterRow = cva("flex items-center justify-between");
export const panelFooterRight = cva("flex items-center gap-2");
