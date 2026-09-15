import type { RuleTarget } from "@/lib/rule-target";
import { cn } from "@/lib/utils";

export {
  type FaultSpecLookup,
  type RuleTarget,
  deriveTarget,
  ruleSubtitle,
  specLookup,
} from "@/lib/rule-target";

const styles: Record<RuleTarget, string> = {
  inline: "bg-secondary text-secondary-foreground",
  network: "bg-status-degraded/15 text-status-degraded",
  resource: "bg-phase-combined/15 text-phase-combined",
  cachebox: "bg-primary/15 text-primary",
};

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
