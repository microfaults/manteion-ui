/**
 * GrafanaButton — compact square icon button that deep-links a panel into
 * Grafana. Renders an anchor (opens in a new tab) wrapped in the Tooltip
 * wrapper so the accessible label is also discoverable on hover/focus.
 */
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

export interface GrafanaButtonProps {
  /** Grafana deep link (d-solo / dashboard URL). */
  href?: string;
  /** Accessible label + tooltip text. */
  label?: string;
  /** Square size in px. */
  size?: number;
  style?: React.CSSProperties;
}

export function GrafanaButton({
  href,
  label = "Open in Grafana",
  size = 32,
  style,
}: GrafanaButtonProps) {
  return (
    <Tooltip content={label}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        title={label}
        style={{ width: size, height: size, ...style }}
        // Keep the configured desktop size, but never below a 44px tap
        // target on touch viewports.
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
          "max-sm:min-h-11 max-sm:min-w-11",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          !href && "pointer-events-none opacity-50",
        )}
      >
        <ExternalLink size={Math.round(size * 0.5)} aria-hidden />
      </a>
    </Tooltip>
  );
}
