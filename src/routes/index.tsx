import { LandingPage } from "@/components/landing/landing-page";
import { IS_MOCK } from "@/lib/env";
import { indexRedirect } from "@/lib/sample-experiment";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const to = indexRedirect(IS_MOCK);
    if (to) throw redirect({ to });
  },
  component: LandingPage,
});
