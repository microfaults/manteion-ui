import { cva } from "class-variance-authority";

/** Header chrome above the services table — mirrors rules-page.styles. */
export const listHeader = cva("flex items-center justify-between border-b px-4 py-3");

/** Clickable instance row; honors data-selected for the open detail panel. */
export const instanceRow = cva("cursor-pointer hover:bg-accent data-[selected]:bg-accent");

/** Group header row (one per service). */
export const groupRow = cva(
  "cursor-pointer select-none bg-muted/40 hover:bg-muted/60 [&_td]:py-2",
);
