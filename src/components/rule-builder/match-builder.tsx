import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type HydratedGroup,
  type HydratedNode,
  type MatchGroup,
  type MatchLeaf,
  type MatchNode,
  type MatchOperator,
  hydrateIds,
  isGroup,
  isLeaf,
  nodeId,
  sampleLeaf,
} from "@/lib/rego/ast";
import { cn } from "@/lib/utils";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { KNOWN_FIELDS, OPERATOR_LABELS, fieldSpec, operatorsForField } from "./fields";
import { builderShell, combinatorPill, rowChrome } from "./match-builder.styles";

interface MatchBuilderProps {
  value: MatchNode;
  onChange: (next: MatchNode) => void;
}

export function MatchBuilder({ value, onChange }: MatchBuilderProps) {
  const hydrated = hydrateIds(
    isGroup(value)
      ? value
      : ({ kind: "group", combinator: "and", children: [value] } satisfies MatchGroup),
  );

  return (
    <div className={builderShell()}>
      <NodeRow node={hydrated} onChange={onChange} depth={0} isRoot />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────

interface NodeRowProps {
  node: HydratedNode;
  onChange: (n: MatchNode) => void;
  onDelete?: () => void;
  depth: number;
  isRoot?: boolean;
}

function NodeRow({ node, onChange, onDelete, depth, isRoot }: NodeRowProps) {
  if (isLeaf(node)) {
    return <LeafRow leaf={node} onChange={onChange} onDelete={onDelete} />;
  }
  if (isGroup(node)) {
    return (
      <GroupRow
        group={node as HydratedGroup}
        onChange={onChange}
        onDelete={onDelete}
        depth={depth}
        isRoot={isRoot ?? false}
      />
    );
  }
  return null;
}

// ──────��───────────────────────────────────────────────────────────────

interface GroupRowProps {
  group: HydratedGroup;
  onChange: (n: MatchNode) => void;
  onDelete?: () => void;
  depth: number;
  isRoot: boolean;
}

function GroupRow({ group, onChange, onDelete, depth, isRoot }: GroupRowProps) {
  const updateChild = useCallback(
    (i: number, next: MatchNode) => {
      const children: MatchNode[] = [...group.children];
      children[i] = next;
      onChange({ ...group, children });
    },
    [group, onChange],
  );

  const deleteChild = useCallback(
    (i: number) => {
      const children: MatchNode[] = group.children.filter((_, idx) => idx !== i);
      onChange({ ...group, children });
    },
    [group, onChange],
  );

  const addLeaf = useCallback(() => {
    onChange({ ...group, children: [...group.children, sampleLeaf()] });
  }, [group, onChange]);

  const addGroup = useCallback(() => {
    onChange({
      ...group,
      children: [
        ...group.children,
        { id: nodeId(), kind: "group", combinator: "and", children: [sampleLeaf()] },
      ],
    });
  }, [group, onChange]);

  const setCombinator = useCallback(
    (combinator: MatchGroup["combinator"]) => {
      // NOT can only wrap a single child — collapse/expand accordingly.
      if (combinator === "not" && group.children.length > 1) {
        onChange({
          id: nodeId(),
          kind: "group",
          combinator: "not",
          children: [
            {
              id: nodeId(),
              kind: "group",
              combinator: "and",
              children: group.children,
            },
          ],
        });
        return;
      }
      onChange({ ...group, combinator });
    },
    [group, onChange],
  );

  return (
    <div className={cn("relative", !isRoot && "ml-4 border-l-2 border-border pl-4")}>
      <div className={rowChrome()}>
        <CombinatorToggle value={group.combinator} onChange={setCombinator} />
        <span className="text-xs text-muted-foreground">
          {group.children.length === 0
            ? "empty group"
            : `${group.children.length} ${group.children.length === 1 ? "condition" : "conditions"}`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={addLeaf} className="h-7 gap-1">
            <Plus className="size-3" />
            condition
          </Button>
          <Button variant="ghost" size="sm" onClick={addGroup} className="h-7 gap-1">
            <Plus className="size-3" />
            group
          </Button>
          {!isRoot && onDelete ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="size-7 p-0"
              aria-label="delete group"
            >
              <Trash2 className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="divide-y divide-border">
        {group.children.length === 0 ? (
          <div className="px-3 pb-3 pt-1 text-xs italic text-muted-foreground">
            No conditions. Add one with the + condition button.
          </div>
        ) : (
          group.children.map((child, i) => (
            <NodeRow
              key={child.id}
              node={child}
              onChange={(next) => updateChild(i, next)}
              onDelete={() => deleteChild(i)}
              depth={depth + 1}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────

function CombinatorToggle({
  value,
  onChange,
}: {
  value: MatchGroup["combinator"];
  onChange: (c: MatchGroup["combinator"]) => void;
}) {
  const options: MatchGroup["combinator"][] = ["and", "or", "not"];
  return (
    <div className={combinatorPill()}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-2 py-1 transition-colors",
            value === opt
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────

interface LeafRowProps {
  leaf: MatchLeaf;
  onChange: (next: MatchNode) => void;
  onDelete?: () => void;
}

function LeafRow({ leaf, onChange, onDelete }: LeafRowProps) {
  const spec = fieldSpec(leaf.field);
  const ops = operatorsForField(leaf.field);

  const setField = (field: string) => {
    const newOps = operatorsForField(field);
    const nextOp: MatchOperator = newOps.includes(leaf.op) ? leaf.op : (newOps[0] ?? "eq");
    onChange({ ...leaf, field, op: nextOp });
  };

  return (
    <div className={rowChrome()}>
      <GripVertical className="size-3 shrink-0 text-muted-foreground/40" aria-hidden />

      {/* Field picker — combobox-like with known values, but free-form allowed. */}
      <div className="w-44">
        <Select value={leaf.field} onValueChange={setField}>
          <SelectTrigger className="h-8 text-xs font-mono">
            <SelectValue placeholder="field" />
          </SelectTrigger>
          <SelectContent>
            {KNOWN_FIELDS.map((f) => (
              <SelectItem key={f.name} value={f.name} className="text-xs">
                <span className="font-mono">{f.name}</span>
              </SelectItem>
            ))}
            {!KNOWN_FIELDS.some((f) => f.name === leaf.field) ? (
              <SelectItem value={leaf.field} className="text-xs">
                <span className="font-mono">{leaf.field}</span> (custom)
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      {/* Operator */}
      <div className="w-32">
        <Select
          value={leaf.op}
          onValueChange={(v) => onChange({ ...leaf, op: v as MatchOperator })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="op" />
          </SelectTrigger>
          <SelectContent>
            {ops.map((op) => (
              <SelectItem key={op} value={op} className="text-xs">
                {OPERATOR_LABELS[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value */}
      <div className="min-w-0 flex-1">
        {spec.kind === "enum" && spec.values ? (
          <Select value={String(leaf.value)} onValueChange={(v) => onChange({ ...leaf, value: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="value" />
            </SelectTrigger>
            <SelectContent>
              {spec.values.map((v) => (
                <SelectItem key={v} value={v} className="text-xs">
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : leaf.op === "in" || leaf.op === "not_in" ? (
          <Input
            className="h-8 font-mono text-xs"
            placeholder="comma, separated, values"
            value={Array.isArray(leaf.value) ? (leaf.value as string[]).join(", ") : ""}
            onChange={(e) =>
              onChange({
                ...leaf,
                value: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        ) : (
          <Input
            className="h-8 font-mono text-xs"
            placeholder="value"
            value={
              typeof leaf.value === "string" || typeof leaf.value === "number"
                ? String(leaf.value)
                : ""
            }
            onChange={(e) => {
              const raw = e.target.value;
              if (spec.kind === "number") {
                const n = Number(raw);
                onChange({ ...leaf, value: Number.isFinite(n) ? n : raw });
              } else {
                onChange({ ...leaf, value: raw });
              }
            }}
          />
        )}
      </div>

      {onDelete ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="size-7 shrink-0 p-0"
          aria-label="delete condition"
        >
          <Trash2 className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}
