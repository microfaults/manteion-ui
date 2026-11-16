/** Router fallback for paths that match no route. */
import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium">This page does not exist.</p>
      <Link to="/dashboard" className="text-sm text-primary hover:underline">
        Go to the dashboard
      </Link>
    </div>
  );
}
