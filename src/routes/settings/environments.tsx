import { Topbar } from "@/components/layout/topbar";
import { NotWiredYet } from "@/components/not-wired-yet";
import { Card, CardContent } from "@/components/ui/card";
import { IS_MOCK } from "@/lib/env";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/environments")({
  component: EnvironmentsPage,
});

function EnvironmentsPage() {
  return (
    <>
      <Topbar breadcrumbs={["Settings", "Environments"]} />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {IS_MOCK ? (
          <DemoEnvironment />
        ) : (
          <NotWiredYet
            endpoints={["(product decision required — per-deployment vs tenant column)"]}
            note="Environment scoping is unresolved — one manteion per env vs tenant-scoped rows. See docs/design/ui-design.md §8 'Unresolved questions'."
          />
        )}
      </div>
    </>
  );
}

/** Visitor-facing copy for the public demo: the operator build's placeholder
 *  carries internal notes that mean nothing to a visitor. */
function DemoEnvironment() {
  const env = (import.meta.env?.VITE_DEFAULT_ENV as string | undefined) ?? "online-boutique";
  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card>
        <CardContent className="p-6">
          <h3 className="font-mono text-sm font-semibold">{env}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The one environment this console manages: the Online Boutique bed, eleven services with
            the atropos SDK compiled into each. It is fixed when the console is built, so there is
            nothing to change here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
