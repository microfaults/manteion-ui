import { cva } from "class-variance-authority";

/** Outer container around the whole match builder tree. */
export const builderShell = cva("rounded-md border border-border bg-background");

/**
 * Shared row chrome for both `GroupRow` header and `LeafRow` body — the only
 * intra-file ≥2x repeat in match-builder.tsx.
 */
export const rowChrome = cva("flex items-center gap-2 px-3 py-2");

/** The three-segment AND/OR/NOT pill at the start of a group header. */
export const combinatorPill = cva(
  "inline-flex overflow-hidden rounded-md border border-border bg-background text-[11px] font-medium uppercase",
);
