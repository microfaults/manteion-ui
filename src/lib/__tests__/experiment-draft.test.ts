import {
  type ExperimentDraft,
  type PhaseDraft,
  type WorkflowRowDraft,
  autoPlanPhases,
  draftToCreateInput,
  emptyDraft,
  footprintOfDraft,
  preflight,
  validateDraft,
} from "@/lib/experiment-draft";
import { describe, expect, it } from "vitest";

const wf = (over: Partial<WorkflowRowDraft> = {}): WorkflowRowDraft => ({
  key: "w1",
  workflow_id: "wf-checkout",
  vus: 10,
  duration_sec: 300,
  ...over,
});
const phase = (over: Partial<PhaseDraft> = {}): PhaseDraft => ({
  key: "p1",
  name: "baseline",
  persist_cache: false,
  workflows: [wf()],
  rule_ids: [],
  frozen_services: [],
  ...over,
});
const draft = (over: Partial<ExperimentDraft> = {}): ExperimentDraft => ({
  ...emptyDraft(),
  name: "checkout-p99",
  phases: [phase()],
  ...over,
});
const codes = (d: ExperimentDraft) => validateDraft(d).map((i) => i.code);

const RULES = [
  { id: "rule-1", name: "hang-catalog", service: "productcatalog", enabled: true },
  { id: "rule-2", name: "slow-cart", service: "cartservice", enabled: false },
];

describe("validateDraft", () => {
  it("requires a name and at least one phase", () => {
    expect(codes(draft({ name: "  ", phases: [] }))).toEqual(
      expect.arrayContaining(["name-required", "no-phases"]),
    );
  });

  it("requires unique, non-empty phase names (UNIQUE(experiment_id, name))", () => {
    const d = draft({
      phases: [phase(), phase({ key: "p2", name: "baseline" }), phase({ key: "p3", name: " " })],
    });
    expect(codes(d)).toEqual(
      expect.arrayContaining(["duplicate-phase-name", "phase-name-required"]),
    );
  });

  it("requires ≥1 workflow per phase, each with a workflow, vus > 0 and duration > 0", () => {
    expect(codes(draft({ phases: [phase({ workflows: [] })] }))).toContain("no-workflows");
    const bad = phase({ workflows: [wf({ workflow_id: "", vus: 0, duration_sec: 0 })] });
    expect(codes(draft({ phases: [bad] }))).toEqual(
      expect.arrayContaining(["workflow-required", "vus-invalid", "duration-invalid"]),
    );
  });

  it("flags key-strategy disagreement for one service across phases (INV-2) and a service frozen twice in a phase", () => {
    const d = draft({
      phases: [
        phase({
          frozen_services: [
            {
              key: "f1",
              service: "cartservice",
              mode: "replay",
              key_strategy: "exact",
              mutation_policy: "deny",
            },
            {
              key: "f2",
              service: "cartservice",
              mode: "replay",
              key_strategy: "exact",
              mutation_policy: "deny",
            },
          ],
        }),
        phase({
          key: "p2",
          name: "isolation",
          frozen_services: [
            {
              key: "f3",
              service: "cartservice",
              mode: "replay",
              key_strategy: "canonical_v2",
              mutation_policy: "deny",
            },
          ],
        }),
      ],
    });
    const issues = validateDraft(d);
    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["key-strategy-conflict", "duplicate-frozen-service"]),
    );
    expect(issues.find((i) => i.code === "key-strategy-conflict")?.message).toMatch(/cartservice/);
  });

  it("passes a well-formed draft", () => {
    expect(validateDraft(draft())).toEqual([]);
  });
});

describe("draftToCreateInput", () => {
  it("maps plan order to positions, defaults mutation_policy=deny and key_strategy=canonical_v2, drops empty optionals", () => {
    const d = draft({
      description: "",
      hypothesis: "tail latency",
      created_by: "pmundra",
      phases: [
        phase({ workflows: [wf({ rate_rps: 0 })] }),
        phase({
          key: "p2",
          name: "isolation-catalog",
          persist_cache: true,
          workflows: [wf({ key: "w2", rate_rps: 40, dataset_id: "ds-1" })],
          rule_ids: ["rule-1"],
          frozen_services: [
            {
              key: "f1",
              service: "cartservice",
              mode: "replay",
              key_strategy: "",
              mutation_policy: "" as never,
            },
          ],
        }),
      ],
    });
    const input = draftToCreateInput(d);
    expect(input).toEqual({
      name: "checkout-p99",
      hypothesis: "tail latency",
      created_by: "pmundra",
      phases: [
        {
          name: "baseline",
          position: 0,
          persist_cache: false,
          frozen_services: [],
          workflows: [{ workflow_id: "wf-checkout", vus: 10, duration_sec: 300 }],
          rule_ids: [],
        },
        {
          name: "isolation-catalog",
          position: 1,
          persist_cache: true,
          frozen_services: [
            {
              service: "cartservice",
              mode: "replay",
              key_strategy: "canonical_v2",
              mutation_policy: "deny",
            },
          ],
          workflows: [
            {
              workflow_id: "wf-checkout",
              vus: 10,
              duration_sec: 300,
              rate_rps: 40,
              dataset_id: "ds-1",
            },
          ],
          rule_ids: ["rule-1"],
        },
      ],
    });
    expect(input).not.toHaveProperty("description");
  });
});

describe("autoPlanPhases", () => {
  it("generates baseline + one isolation per targeted service (the others frozen, that service's rules attached) + combined (every rule)", () => {
    const phases = autoPlanPhases({
      services: ["productcatalog", "cartservice"],
      workflowId: "wf-checkout",
      rules: RULES,
    });
    expect(phases.map((p) => p.name)).toEqual([
      "baseline",
      "isolation-productcatalog",
      "isolation-cartservice",
      "combined",
    ]);
    expect(phases[0]?.frozen_services).toEqual([]);
    expect(phases[0]?.rule_ids).toEqual([]);
    expect(phases[1]?.frozen_services.map((f) => f.service)).toEqual(["cartservice"]);
    expect(phases[1]?.frozen_services[0]).toMatchObject({
      mode: "replay",
      key_strategy: "canonical_v2",
      mutation_policy: "deny",
    });
    expect(phases[1]?.rule_ids).toEqual(["rule-1"]);
    expect(phases[2]?.frozen_services.map((f) => f.service)).toEqual(["productcatalog"]);
    expect(phases[2]?.rule_ids).toEqual(["rule-2"]);
    expect(phases[3]?.frozen_services).toEqual([]);
    expect(phases[3]?.rule_ids).toEqual(["rule-1", "rule-2"]);
    for (const p of phases)
      expect(p.workflows).toEqual([expect.objectContaining({ workflow_id: "wf-checkout" })]);
    expect(new Set(phases.map((p) => p.key)).size).toBe(4);
  });
});

describe("footprintOfDraft / preflight", () => {
  const d = draft({
    phases: [
      phase(),
      phase({
        key: "p2",
        name: "isolation",
        rule_ids: ["rule-1", "rule-2"],
        frozen_services: [
          {
            key: "f1",
            service: "checkoutservice",
            mode: "replay",
            key_strategy: "canonical_v2",
            mutation_policy: "deny",
          },
        ],
      }),
    ],
  });

  it("footprint = frozen services ∪ services of selected rules", () => {
    expect(footprintOfDraft(d, RULES)).toEqual([
      "checkoutservice",
      "productcatalog",
      "cartservice",
    ]);
  });

  it("blocks on a footprint overlap with a running experiment and names it", () => {
    const items = preflight({
      draft: d,
      rules: RULES,
      experiments: [
        {
          id: "exp-9",
          name: "cart-freeze",
          status: "running",
          phases: [{ rule_ids: [], frozen_services: [{ service: "cartservice" }] }],
        },
        {
          id: "exp-8",
          name: "old",
          status: "completed",
          phases: [{ rule_ids: [], frozen_services: [{ service: "checkoutservice" }] }],
        },
      ],
      sdkInstanceCount: 3,
    });
    const overlap = items.find((i) => i.code === "service-overlap");
    expect(overlap?.level).toBe("error");
    expect(overlap?.message).toMatch(/cart-freeze/);
    expect(overlap?.message).toMatch(/cartservice/);
  });

  it("warns on disabled selected rules (naming the phase) and on zero SDK instances; reports ok lines otherwise", () => {
    const items = preflight({ draft: d, rules: RULES, experiments: [], sdkInstanceCount: 0 });
    expect(items.find((i) => i.code === "service-overlap")?.level).toBe("ok");
    const disabled = items.find((i) => i.code === "disabled-rules");
    expect(disabled?.level).toBe("warning");
    expect(disabled?.message).toMatch(/slow-cart/);
    expect(disabled?.message).toMatch(/isolation/);
    expect(items.find((i) => i.code === "no-sdk-instances")?.level).toBe("warning");
    expect(items.find((i) => i.code === "key-strategy")?.level).toBe("ok");
    expect(
      preflight({ draft: d, rules: RULES, experiments: [], sdkInstanceCount: undefined }).some(
        (i) => i.code === "no-sdk-instances",
      ),
    ).toBe(false);
  });
});
