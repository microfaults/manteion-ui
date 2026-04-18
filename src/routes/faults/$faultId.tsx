import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";

export const Route = createFileRoute("/faults/$faultId")({
  component: FaultDetailPage,
});

function FaultDetailPage() {
  const { faultId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Faults", faultId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/faults/specs/{id}",
            "PUT    /api/v1/faults/specs/{id}",
          ]}
        />
      </div>
    </>
  );
}
