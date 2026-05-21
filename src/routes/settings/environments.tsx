import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/environments")({
  component: EnvironmentsPage,
});

function EnvironmentsPage() {
  return (
    <>
      <Topbar breadcrumbs={["Settings", "Environments"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={["(product decision required — per-deployment vs tenant column)"]}
          note="Environment scoping is unresolved — one manteion per env vs tenant-scoped rows. See docs/design/ui-design.md §8 'Unresolved questions'."
        />
      </div>
    </>
  );
}
