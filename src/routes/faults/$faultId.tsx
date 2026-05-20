import { createFileRoute, redirect } from "@tanstack/react-router";

// Deep links to /faults/:id redirect to the main Faults page.
// The list page uses local state for selection so we pass the id via search.
export const Route = createFileRoute("/faults/$faultId")({
  beforeLoad({ params }) {
    throw redirect({ to: "/faults", search: { selected: params.faultId } });
  },
  component: () => null,
});
