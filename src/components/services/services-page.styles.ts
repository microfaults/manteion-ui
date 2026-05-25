import { cva } from "class-variance-authority";

export const listHeader = cva("flex items-center justify-between");

/** Clickable instance row; honors data-selected for the open detail panel. */
export const instanceRow = cva(
  "cursor-pointer hover:bg-muted/50 data-[selected]:bg-blue-50 data-[selected]:[box-shadow:inset_2px_0_0_#2563eb] dark:data-[selected]:bg-blue-950/20",
);

/** Group header row (one per service). */
export const groupRow = cva(
  "cursor-pointer select-none bg-muted/40 hover:bg-muted/60 [&_td]:py-2",
);
