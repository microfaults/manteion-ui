import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";

export const Route = createFileRoute("/faults/")({
  component: FaultsPage,
});

function FaultsPage() {
  return (
    <>
      <Topbar breadcrumbs={["Faults"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/faults/specs",
            "POST   /api/v1/faults/specs",
            "PUT    /api/v1/faults/specs/{id}",
            "DELETE /api/v1/faults/specs/{id}",
            "GET    /api/v1/faults/compositions",
            "GET    /api/v1/faults/incompatibilities",
          ]}
          note="FaultRepo is already wired into manteion-go's Server struct but no HTTP routes are registered. Rules currently reference fault_spec_id by string."
        />
      </div>
    </>
  );
}
