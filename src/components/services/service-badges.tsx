import { cn } from "@/lib/utils";
import type { Rule, SDKInstance } from "@/types/api";
import { cva } from "class-variance-authority";

// ── Shared pill base ──────────────────────────────────────────────────────────

const pill = cva("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium", {
  variants: {
    color: {
      green: "border-green-300  bg-green-100  text-green-800",
      amber: "border-amber-300  bg-amber-100  text-amber-800",
      red: "border-red-300    bg-red-100    text-red-800",
      blue: "border-blue-300   bg-blue-100   text-blue-800",
      muted: "border-border     bg-muted      text-muted-foreground",
      outline: "border-border     bg-transparent text-muted-foreground",
    },
  },
  defaultVariants: { color: "muted" },
});

// ── StatusBadge ───────────────────────────────────────────────────────────────

type Status = SDKInstance["status"];

const statusColor: Record<NonNullable<Status>, "green" | "amber" | "red"> = {
  alive: "green",
  stale: "amber",
  dead: "red",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn(pill({ color: status ? statusColor[status] : "muted" }), className)}>
      {status ?? "—"}
    </span>
  );
}

// ── CacheBoxBadge ─────────────────────────────────────────────────────────────

export function CacheBoxBadge({ className }: { className?: string }) {
  return <span className={cn(pill({ color: "blue" }), className)}>cache-box</span>;
}

// ── RuleTypeBadge ─────────────────────────────────────────────────────────────

// Non-cachebox rules show their execution mode (not the fault category).
const modeColor: Record<Rule["mode"], "blue" | "muted"> = {
  inline: "blue",
  background: "muted",
};

export function RuleTypeBadge({ rule }: { rule: Rule }) {
  if (rule.action.type === "cachebox") {
    return <span className={pill({ color: "outline" })}>cache-box</span>;
  }
  return <span className={pill({ color: modeColor[rule.mode] })}>{rule.mode}</span>;
}
