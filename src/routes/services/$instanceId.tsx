import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/services/$instanceId")({
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { instanceId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Services", instanceId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/sdk/instances/{id}    (need detail fields: last_error, last_rule_version_acked)",
            "POST   /api/v1/sdk/instances/{id}/kill-switch",
          ]}
          note="Service detail requires the instance-detail endpoint to surface rule-version lag, last error, and the kill-switch action. Today only the list endpoint exists."
        />
      </div>
    </>
  );
}
