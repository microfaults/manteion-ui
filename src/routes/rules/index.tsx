import { RulesPage } from "@/components/rules/rules-page";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/rules/")({
  component: RulesPage,
});
