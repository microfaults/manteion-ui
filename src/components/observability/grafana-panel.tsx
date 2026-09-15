/**
 * GrafanaPanel — card chrome around an embedded Grafana d-solo iframe.
 *
 * Three body states:
 *  - `unavailable` → a "Grafana unreachable" failure card (destructive tokens).
 *  - `src` present → the embedded iframe.
 *  - otherwise     → an empty-state tile: "embedding is off" when there is a
 *                    Grafana link to fall back to, "No panel configured" if not.
 */
import { GrafanaButton } from "@/components/observability/grafana-button";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export interface GrafanaPanelProps {
  title: string;
  /** Time-window label shown under the title. */
  window?: string;
  /** Grafana d-solo iframe src. Omit for the empty-state tile. */
  src?: string;
  /** Render the "Grafana unreachable" failure card. */
  unavailable?: boolean;
  height?: number;
  grafanaUrl?: string;
  style?: React.CSSProperties;
}

export function GrafanaPanel({
  title,
  window,
  src,
  unavailable,
  height = 200,
  grafanaUrl,
  style,
}: GrafanaPanelProps) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground" style={style}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-medium leading-tight">{title}</div>
          {window ? (
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{window}</p>
          ) : null}
        </div>
        <GrafanaButton href={grafanaUrl} label={`Open "${title}" in Grafana`} />
      </div>

      <div className="p-3">
        {unavailable ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 text-center text-destructive",
            )}
            style={{ minHeight: height }}
          >
            <AlertTriangle size={20} aria-hidden />
            <span className="text-sm font-medium">Grafana unreachable</span>
          </div>
        ) : src ? (
          <iframe
            src={src}
            title={title}
            height={height}
            className="w-full rounded-md border-0 bg-surface-sunken"
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-md bg-muted/40 px-4 text-center text-sm text-muted-foreground"
            style={{ minHeight: height }}
          >
            {grafanaUrl
              ? "Embedding is off — open this panel in Grafana (VITE_GRAFANA_EMBED=true needs allow_embedding on the Grafana side)."
              : "No panel configured"}
          </div>
        )}
      </div>
    </div>
  );
}
