import { Topbar } from "@/components/layout/topbar";
import { PhasesList } from "@/components/phases/phases-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/phases/")({
  component: PhasesPage,
});

function PhasesPage() {
  return (
    <>
      <Topbar breadcrumbs={["Phases"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <PhasesList />
      </div>
    </>
  );
}
