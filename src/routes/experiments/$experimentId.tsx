import { ExperimentDetail } from "@/components/experiments/experiment-detail";
import { Topbar } from "@/components/layout/topbar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/experiments/$experimentId")({
  component: ExperimentDetailPage,
});

function ExperimentDetailPage() {
  const { experimentId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <>
      <Topbar breadcrumbs={[{ label: "Experiments", to: "/experiments" }, experimentId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <ExperimentDetail
          experimentId={experimentId}
          onDeleted={() => navigate({ to: "/experiments" })}
        />
      </div>
    </>
  );
}
