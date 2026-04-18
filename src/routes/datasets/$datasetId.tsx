import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";

export const Route = createFileRoute("/datasets/$datasetId")({
  component: DatasetDetailPage,
});

function DatasetDetailPage() {
  const { datasetId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Datasets", datasetId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet endpoints={["GET /api/v1/datasets/{id}"]} />
      </div>
    </>
  );
}
