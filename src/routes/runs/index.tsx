import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/runs/")({
  component: RunsPage,
});

function RunsPage() {
  return (
    <>
      <Topbar breadcrumbs={["Runs"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet endpoints={["GET /api/v1/runs"]} />
      </div>
    </>
  );
}
