/**
 * PrometheusErrorBanner — inline red banner for "Prometheus / manteion
 * unreachable". Leads with an alert glyph, shows the failure message, and
 * renders an optional fix `hint` (e.g. a port-forward command) as a mono chip.
 */
import { AlertTriangle } from "lucide-react";

export interface PrometheusErrorBannerProps {
  message?: string;
  /** Mono command hint for the fix, e.g. a port-forward command. */
  hint?: string;
  style?: React.CSSProperties;
}

export function PrometheusErrorBanner({
  message = "Prometheus unreachable or query failed.",
  hint,
  style,
}: PrometheusErrorBannerProps) {
  return (
    <div
      role="alert"
      style={style}
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p>{message}</p>
        {hint ? (
          <code className="inline-block rounded bg-surface-sunken px-1 font-mono text-xs text-mono">
            {hint}
          </code>
        ) : null}
      </div>
    </div>
  );
}
