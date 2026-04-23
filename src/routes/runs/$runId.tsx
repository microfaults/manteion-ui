import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/runs/$runId")({
  component: RunDetailPage,
});

function RunDetailPage() {
  const { runId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Runs", runId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/runs/{id}",
            "GET    /api/v1/runs/{id}/steps",
            "GET    /api/v1/runs/{id}/events   (Server-Sent Events)",
          ]}
          note="Run detail needs an SSE endpoint for the live event tail (step.ok / step.drop / iteration.done). manteion-go currently exposes no streaming."
        />
      </div>
    </>
  );
}
