/**
 * Strip above the console's main area in the mock build: says the data is
 * generated in the browser (the sample run replays recorded figures) and
 * links to the demo's landing page.
 */
import { Link } from "@tanstack/react-router";

export function SimulatedBar() {
  return (
    <aside
      aria-label="Simulated data"
      className="flex min-h-8 shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-1 text-xs text-muted-foreground sm:py-0"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-status-degraded" />
      <span className="shrink-0 font-medium text-foreground">Simulated data</span>
      <span className="hidden min-w-0 truncate sm:block">
        No cluster is attached. Numbers are generated in your browser, except the sample run, which
        replays recorded figures.
      </span>
      <Link to="/" className="ml-auto shrink-0 text-primary hover:underline">
        About this demo
      </Link>
    </aside>
  );
}
