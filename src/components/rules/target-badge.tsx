import { cn } from "@/lib/utils";
import type { Rule } from "@/types/api";

export type RuleTarget = "inline" | "network" | "resource" | "cachebox";

const styles: Record<RuleTarget, string> = {
  inline: "bg-secondary text-secondary-foreground",
  network: "bg-status-degraded/15 text-status-degraded",
  resource: "bg-phase-combined/15 text-phase-combined",
  cachebox: "bg-primary/15 text-primary",
};

export function deriveTarget(rule: Pick<Rule, "action" | "match">): RuleTarget {
  const stored = rule.match?.labels?._target;
  if (stored === "inline" || stored === "network" || stored === "resource" || stored === "cachebox")
    return stored;
  const action = rule.action;
  if (action.type === "cachebox") return "cachebox";
  const specId =
    action.type === "fault_spec"
      ? action.fault_spec_id
      : action.type === "fault_composition"
        ? action.fault_composition_id
        : "";
  if (specId.startsWith("network:") || specId.startsWith("spec-network")) return "network";
  if (specId.startsWith("resource:") || specId.startsWith("spec-resource")) return "resource";
  return "inline";
}

export function ruleSubtitle(rule: Rule): string {
  const target = deriveTarget(rule);
  const action = rule.action;
  const specId =
    action.type === "fault_spec"
      ? action.fault_spec_id
      : action.type === "fault_composition"
        ? action.fault_composition_id
        : action.type === "cachebox"
          ? "cachebox"
          : "";
  if (!specId) return target;
  const parts = specId.split(":");
  if (parts.length >= 2 && parts[0] === target) return `${target} · ${parts.slice(1).join(":")}`;
  return `${target} · ${specId.slice(0, 24)}`;
}

interface TargetBadgeProps {
  target?: RuleTarget;
  /** Optional param summary appended after a dot, e.g. "rst" or "250ms". */
  detail?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function TargetBadge({ target = "inline", detail, className, style }: TargetBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-medium",
        styles[target],
        className,
      )}
      style={style}
    >
      {detail ? `${target} · ${detail}` : target}
    </span>
  );
}
