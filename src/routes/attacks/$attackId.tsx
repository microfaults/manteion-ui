import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";

export const Route = createFileRoute("/attacks/$attackId")({
  component: AttackDetailPage,
});

function AttackDetailPage() {
  const { attackId } = Route.useParams();
  return (
    <>
      <Topbar breadcrumbs={["Attacks", attackId]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet endpoints={["GET /api/v1/attacks/{id}"]} />
      </div>
    </>
  );
}
