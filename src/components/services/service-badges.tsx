import { cn } from "@/lib/utils";
import type { Rule, SDKInstance } from "@/types/api";
import { cva } from "class-variance-authority";

// ── Shared pill base ──────────────────────────────────────────────────────────

const pill = cva("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium", {
  variants: {
    color: {
      green: "border-status-healthy/30 bg-status-healthy/15 text-status-healthy",
      amber: "border-status-degraded/30 bg-status-degraded/15 text-status-degraded",
      red: "border-status-down/30 bg-status-down/15 text-status-down",
      blue: "border-primary/30 bg-primary/15 text-primary",
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
