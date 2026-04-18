import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { type MatchNode, emptyRoot } from "@/lib/rego/ast";
import { compile } from "@/lib/rego/compile";
import { parse } from "@/lib/rego/parse";
import { MatchBuilder } from "./match-builder";
import { RegoEditor } from "./rego-editor";

interface RuleBuilderProps {
  /** Current AST value. The parent form owns state. */
  ast: MatchNode | undefined;
  /** Raw rego override — when present, supersedes ast (used when user paste-edits). */
  rego?: string;
  onChange: (next: { ast?: MatchNode; rego: string; custom: boolean }) => void;
}

/** Two-tab rule match editor.
 *  Tab 1 (Builder): nested AND/OR/NOT tree compiled to rego on every edit.
 *  Tab 2 (Rego): raw rego paste/edit. If the rego parses back into the
 *  builder grammar, the AST is kept in sync; otherwise we mark the rule as
 *  "custom" and the builder view goes read-only. */
export function RuleBuilder({ ast, rego, onChange }: RuleBuilderProps) {
  const [tab, setTab] = useState<"builder" | "rego">("builder");
  const [localAst, setLocalAst] = useState<MatchNode>(ast ?? emptyRoot());
  const [customRego, setCustomRego] = useState<string | undefined>(rego);
  const [parseError, setParseError] = useState<string | undefined>();

  const compiledRego = useMemo(() => compile(localAst), [localAst]);
  const effectiveRego = customRego ?? compiledRego;
  const isCustom = customRego !== undefined;

  const handleAstChange = (next: MatchNode) => {
    setLocalAst(next);
    setCustomRego(undefined);
    setParseError(undefined);
    onChange({ ast: next, rego: compile(next), custom: false });
  };

  const handleRegoChange = (next: string) => {
    setCustomRego(next);
    const result = parse(next);
    if (result.ok) {
      setLocalAst(result.ast);
      setParseError(undefined);
      onChange({ ast: result.ast, rego: next, custom: false });
    } else {
      setParseError(result.reason);
      onChange({ rego: next, custom: true });
    }
  };

  return (
    <div className="space-y-2">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "builder" | "rego")}
      >
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="rego">Rego</TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            {isCustom
              ? "Custom rego — builder is read-only"
              : "Builder compiles to OPA rego."}
          </p>
        </div>

        <TabsContent value="builder" className="mt-2">
          {isCustom ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              This rule uses rego beyond the builder grammar. Switch to the{" "}
              <span className="font-medium text-foreground">Rego</span> tab to
              edit, or clear the custom rego to re-enable the builder.
              <button
                type="button"
                className="ml-2 text-primary hover:underline"
                onClick={() => {
                  setCustomRego(undefined);
                  setParseError(undefined);
                  onChange({
                    ast: localAst,
                    rego: compile(localAst),
                    custom: false,
                  });
                }}
              >
                Clear custom rego
              </button>
            </div>
          ) : (
            <MatchBuilder value={localAst} onChange={handleAstChange} />
          )}
        </TabsContent>

        <TabsContent value="rego" className="mt-2">
          <RegoEditor
            value={effectiveRego}
            onChange={handleRegoChange}
            diagnostics={parseError ? [parseError] : undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
