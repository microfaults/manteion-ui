import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";

export const Route = createFileRoute("/datasets/")({
  component: DatasetsPage,
});

function DatasetsPage() {
  return (
    <>
      <Topbar breadcrumbs={["Datasets"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/datasets",
            "POST   /api/v1/datasets",
            "POST   /api/v1/datasets/{id}/pools   (NDJSON upload)",
          ]}
        />
      </div>
    </>
  );
}
