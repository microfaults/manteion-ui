import { TooltipProvider } from "@/components/ui/tooltip";
import { IS_MOCK } from "@/lib/env";
import type { ReactNode } from "react";
import { DesktopNotice } from "./desktop-notice";
import { Sidebar } from "./sidebar";
import { SimulatedBar } from "./simulated-bar";

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  const main = <main className="flex min-w-0 flex-1 flex-col">{children}</main>;
  // Kept as its own branch so the operator build's DOM stays identical to before the demo chrome.
  if (!IS_MOCK) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex h-full min-h-screen bg-background">
          <Sidebar />
          {main}
        </div>
      </TooltipProvider>
    );
  }
  // Demo build: the narrow-screen notice spans the full width; the
  // simulated-data bar sits above <main>, beside the sidebar.
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-screen flex-col bg-background">
        <DesktopNotice />
        <div className="flex flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <SimulatedBar />
            {main}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
