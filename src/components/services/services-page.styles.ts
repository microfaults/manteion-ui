import { cva } from "class-variance-authority";

export const listHeader = cva("flex items-center justify-between");

const focusRing =
  "outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--ring)] focus-visible:bg-muted/50";

/** Clickable instance row; honors data-selected for the open detail panel. */
export const instanceRow = cva(
  `cursor-pointer hover:bg-muted/50 data-[selected]:bg-primary/10 data-[selected]:[box-shadow:inset_2px_0_0_var(--primary)] ${focusRing}`,
);

/** Group header row (one per service). */
export const groupRow = cva(
  `cursor-pointer select-none bg-muted/40 hover:bg-muted/60 [&_td]:py-2 ${focusRing}`,
);
