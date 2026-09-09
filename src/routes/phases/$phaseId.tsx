import { Topbar } from "@/components/layout/topbar";
import { PhaseDetail } from "@/components/phases/phase-detail";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/phases/$phaseId")({
  component: PhaseDetailPage,
});

function PhaseDetailPage() {
  const { phaseId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={[{ label: "Phases", to: "/phases" }, phaseId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <PhaseDetail phaseId={phaseId} />
      </div>
    </>
  );
}
