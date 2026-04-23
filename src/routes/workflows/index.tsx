import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/workflows/")({
  component: WorkflowsPage,
});

function WorkflowsPage() {
  return (
    <>
      <Topbar breadcrumbs={["Workflows"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/flows",
            "POST   /api/v1/flows",
            "GET    /api/v1/personas",
            "GET    /api/v1/zeus/workloads   (proxy passthrough, opaque)",
          ]}
          note="Flows/personas are modelled in manteion-go but unreachable over HTTP. Zeus workloads are proxied blindly — doc the passthrough shape before wiring the UI."
        />
      </div>
    </>
  );
}
