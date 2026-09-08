import { NewExperimentWizard } from "@/components/experiments/new-experiment-wizard";
import { Topbar } from "@/components/layout/topbar";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/experiments/new")({
  component: NewExperimentPage,
});

function NewExperimentPage() {
  const navigate = useNavigate();
  return (
    <>
      <Topbar breadcrumbs={[{ label: "Experiments", to: "/experiments" }, "New experiment"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NewExperimentWizard
          onCreated={(exp) =>
            navigate({ to: "/experiments/$experimentId", params: { experimentId: exp.id } })
          }
          onCancel={() => navigate({ to: "/experiments" })}
        />
      </div>
    </>
  );
}
