import { Shell } from "@/components/layout/shell";
import { IS_MOCK } from "@/lib/env";
import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The demo's landing page at `/` is a standalone page, outside the console shell.
  if (IS_MOCK && pathname === "/") return <Outlet />;
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
