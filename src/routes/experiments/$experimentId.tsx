import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";

export const Route = createFileRoute("/experiments/$experimentId")({
  component: ExperimentDetailPage,
});

function ExperimentDetailPage() {
  const { experimentId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Experiments", experimentId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/experiments/{id}",
            "POST   /api/v1/experiments/{id}/runs",
            "GET    /api/v1/experiments/{id}/phase/{phase_name}/status",
            "GET    /api/v1/runs/{id}/events    (SSE)",
          ]}
          note="Experiment detail (Overview, Phases timeline, Observability, Logs) hinges on endpoints that the ExperimentRepo supports but no HTTP routes expose."
        />
      </div>
    </>
  );
}
