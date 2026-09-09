import { createFileRoute, redirect } from "@tanstack/react-router";

// /runs/{id} → /phases/{id}: a "run" was always a phase. Kept for one
// release so bookmarks survive; delete with the next release.
export const Route = createFileRoute("/runs/$runId")({
  beforeLoad({ params }) {
    throw redirect({ to: "/phases/$phaseId", params: { phaseId: params.runId } });
  },
  component: () => null,
});
