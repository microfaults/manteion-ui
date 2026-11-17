/**
 * Strip shown below 1024px in the mock build: the console is laid out for
 * desktop widths. Dismissible, never blocking; the dismissal lasts for the
 * browser session when sessionStorage is available.
 */
import { X } from "lucide-react";
import { useState } from "react";

const STORAGE_KEY = "manteion:desktop-notice-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Blocked storage: the notice stays dismissed until the next page load.
  }
}

export function DesktopNotice() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;
  return (
    <aside
      aria-label="Screen width notice"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground lg:hidden"
    >
      <span className="min-w-0 flex-1">
        Built for desktop widths. Some panels will not fit on this screen.
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </aside>
  );
}
