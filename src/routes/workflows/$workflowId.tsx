import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/workflows/$workflowId")({
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Workflows", workflowId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={["GET /api/v1/flows/{id}", "POST /api/v1/flows/{id}/validate?dataset={id}"]}
        />
      </div>
    </>
  );
}
