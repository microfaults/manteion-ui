/** "Held constant": what stayed the same between the phases of the measured run. */
import { cn } from "@/lib/utils";
import { Eyebrow, LandingSection, Lead } from "./section";

interface Spec {
  label: string;
  value: string;
  /** The one row that did change, in the status-down colour. */
  changed?: boolean;
}

const MESH: Spec[] = [
  { label: "Load", value: "3 browse journeys/s · 2 checkout journeys/s" },
  { label: "Arrival", value: "open loop, constant rate" },
  { label: "Phase length", value: "120 s" },
  { label: "Service limits", value: "fixed for the run · catalog capped at 200 millicores" },
  { label: "Retries and timeouts", value: "fixed for the run" },
  { label: "Changed between phases", value: "the fault only", changed: true },
];

const TESTBED: Spec[] = [
  { label: "Cluster host", value: "8 cores · 16 GiB · virtual machine" },
  { label: "Cluster", value: "k3s v1.34.6 · single node" },
  { label: "On that node", value: "all eleven services · control plane · Postgres" },
  { label: "Load host", value: "4 cores · 8 GiB · separate virtual machine" },
  { label: "Operating system", value: "Ubuntu 22.04.5 LTS on both" },
  { label: "Network", value: "load crosses the network, so that hop is in every number" },
];

function SpecCard({ title, specs }: { title: string; specs: Spec[] }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card px-6 py-5">
      <Eyebrow className="pb-3">{title}</Eyebrow>
      <dl>
        {specs.map(({ label, value, changed }) => (
          <div
            key={label}
            className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-border py-2.5"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("font-mono text-[13px]", changed ? "text-status-down" : "text-mono")}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function HeldConstant() {
  return (
    <LandingSection eyebrow="Held constant" title="What did not change between phases">
      <Lead className="mb-4">
        Only the fault changed. Load, deployment settings and hardware were the same in every phase,
        so the difference between phases is the fault's effect.
      </Lead>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(400px,100%),1fr))] gap-4">
        <SpecCard title="The mesh" specs={MESH} />
        <SpecCard title="The testbed · recorded 2026-08-25" specs={TESTBED} />
      </div>
    </LandingSection>
  );
}
