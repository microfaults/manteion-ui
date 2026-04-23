import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/attacks/")({
  component: AttacksPage,
});

function AttacksPage() {
  return (
    <>
      <Topbar breadcrumbs={["Attacks"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <NotWiredYet
          endpoints={[
            "GET    /api/v1/attacks                    (likely via zeus proxy)",
            "GET    /api/v1/attacks/{id}/results",
          ]}
          note="Attacks are currently proxied blindly to zeus-go via /api/v1/zeus/attacks. Need either a schema-validated wrapper on manteion or a documented passthrough contract."
        />
      </div>
    </>
  );
}
