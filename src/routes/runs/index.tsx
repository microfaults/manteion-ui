import { createFileRoute, redirect } from "@tanstack/react-router";

// "Runs" became "Phases" (the logical unit of operation). Kept for one
// release so bookmarks survive; delete with the next release.
export const Route = createFileRoute("/runs/")({
  beforeLoad() {
    throw redirect({ to: "/phases" });
  },
  component: () => null,
});
