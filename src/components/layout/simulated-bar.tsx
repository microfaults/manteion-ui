/**
 * One-line strip above the console's main area in the mock build: says the
 * data is generated in the browser and links to the demo's landing page.
 */
import { Link } from "@tanstack/react-router";

export function SimulatedBar() {
  return (
    <aside
      aria-label="Simulated data"
      className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-card px-4 text-xs text-muted-foreground"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-status-degraded" />
      <span className="shrink-0 font-medium text-foreground">Simulated data</span>
      <span className="min-w-0 truncate">
        No cluster is attached; everything here is generated in your browser.
      </span>
      <Link to="/" className="ml-auto shrink-0 text-primary hover:underline">
        About this demo
      </Link>
    </aside>
  );
}
