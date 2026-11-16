/**
 * Router fallback for a route that throws while loading or rendering. Shows an
 * Error's message (never its stack) and offers a retry through `reset`.
 */
import { Button } from "@/components/ui/button";

export function ErrorPage({ error, reset }: { error: unknown; reset?: () => void }) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "The page hit an unexpected error while loading.";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">Something went wrong.</p>
      <p className="max-w-xl break-words font-mono text-xs text-muted-foreground">{message}</p>
      {reset ? (
        <Button size="sm" variant="outline" onClick={reset}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
