import { cn } from "@/lib/utils";
import type { Rule } from "@/types/api";

export type RuleTarget = "inline" | "network" | "resource";

const styles: Record<RuleTarget, string> = {
  inline: "bg-secondary text-secondary-foreground",
  network: "bg-status-degraded text-white",
  resource: "bg-phase-combined text-white",
};

export function deriveTarget(
  rule: Pick<Rule, "fault_spec_id" | "fault_composition_id" | "match">,
): RuleTarget {
  const stored = rule.match?.labels?._target;
  if (stored === "inline" || stored === "network" || stored === "resource") return stored;
  const specId = rule.fault_spec_id ?? rule.fault_composition_id ?? "";
  if (specId.startsWith("network:")) return "network";
  if (specId.startsWith("resource:")) return "resource";
  return "inline";
}

export function ruleSubtitle(rule: Rule): string {
  const target = deriveTarget(rule);
  const specId = rule.fault_spec_id ?? rule.fault_composition_id;
  if (!specId) return target;
  const parts = specId.split(":");
  if (parts.length >= 2 && parts[0] === target) return `${target} · ${parts.slice(1).join(":")}`;
  return `${target} · ${specId.slice(0, 16)}`;
}

interface TargetBadgeProps {
  target: RuleTarget;
  className?: string;
}

export function TargetBadge({ target, className }: TargetBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        styles[target],
        className,
      )}
    >
      {target}
    </span>
  );
}
