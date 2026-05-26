import { cva } from "class-variance-authority";

/** Topbar "New rule" CTA button. Long, structural, single-use but worth naming. */
export const newRuleButton = cva(
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90",
);

/** Header chrome above the rules table (title/count on the left, search on the right). */
export const listHeader = cva("flex items-center justify-between border-b px-5 py-4");

/** Clickable rule row in the table; honors data-selected for the open editor. */
export const ruleRow = cva("cursor-pointer hover:bg-accent data-[selected]:bg-accent");
