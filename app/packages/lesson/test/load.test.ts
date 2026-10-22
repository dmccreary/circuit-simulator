/// <reference types="vite/client" />
import ohmsLaw from "../../../public/lessons/ohms-law.yaml?raw";
import rcCharging from "../../../public/lessons/rc-charging.yaml?raw";
import schemaText from "../src/schema/lesson-v1.schema.json?raw";
import { amount, formatProblem, loadLesson, parseMarkdownLite, STEP_TYPES, toleranceWidth } from "@cs/lesson";

const schema: unknown = JSON.parse(schemaText);
const LESSONS: Record<string, string> = { "ohms-law.yaml": ohmsLaw, "rc-charging.yaml": rcCharging };

const minimal = `
lesson: demo
title: Demo
steps:
  - read: Hello
`;

describe("loadLesson", () => {
  test("a minimal lesson loads", () => {
    const r = loadLesson(minimal);
    expect(r.problems).toEqual([]);
    expect(r.lesson?.steps[0]).toMatchObject({ type: "read", text: "Hello", hints: [], spotlight: [] });
  });

  test("YAML syntax errors carry line numbers", () => {
    const r = loadLesson("lesson: x\ntitle: [unclosed\nsteps:\n  - read: a\n");
    expect(r.lesson).toBeUndefined();
    expect(r.problems[0].severity).toBe("error");
    expect(r.problems[0].line).toBeGreaterThan(0);
  });

  test("schema problems are listed with friendly messages and lines", () => {
    const text = `lesson: Bad Id
title: T
steps:
  - read: ok
  - do:
      prompt: Add a part
  - predict-choice:
      prompt: Which?
      options: [only one]
  - measure:
      value: { part: R1, quantity: amps }
  - read: a
    hints: [1, 2, 3, 4]
  - read: x
    do: { check: { part: { type: resistor } } }
`;
    const r = loadLesson(text);
    expect(r.lesson).toBeUndefined();
    const lines = r.problems.map(formatProblem);
    expect(lines.some((l) => l.startsWith("Line 1:") && l.includes("kebab-case"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Line 5:") && l.includes("needs a check"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Line 9:") && l.includes("at least two options"))).toBe(true);
    expect(lines.some((l) => l.includes("quantity must be one of"))).toBe(true);
    expect(lines.some((l) => l.includes("at most 3 hints"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Line 14:") && l.includes("exactly one type"))).toBe(true);
  });

  test("unknown fields are warnings, not errors", () => {
    const r = loadLesson(minimal + "colour: blue\n");
    expect(r.lesson).toBeDefined();
    expect(r.problems).toEqual([expect.objectContaining({ severity: "warning", line: 6 })]);
  });

  test("bad checks are rejected with their path", () => {
    const r = loadLesson(`lesson: c
title: C
steps:
  - do:
      check:
        all:
          - property: { part: R1, prop: resistance }
          - run-state: sleeping
          - frobnicate: 1
`);
    expect(r.lesson).toBeUndefined();
    expect(r.problems.map((p) => p.line)).toEqual([7, 8, 9]);
  });

  test("a script URL is refused as a circuit (LES-02)", () => {
    const r = loadLesson(minimal + "circuit: javascript:alert(1)\n");
    expect(r.lesson).toBeUndefined();
  });

  test("compare-with must name an earlier step", () => {
    const r = loadLesson(`lesson: c
title: C
steps:
  - observe: { run-for: 1 s, compare-with: later }
  - id: later
    predict-number: { prompt: P }
`);
    expect(r.problems.some((p) => p.message.includes("earlier step"))).toBe(true);
  });

  test.each(["ohms-law.yaml", "rc-charging.yaml"])("the book's lesson %s is valid", (file) => {
    const r = loadLesson(LESSONS[file]);
    expect(r.problems).toEqual([]);
    expect(r.lesson!.steps.length).toBeGreaterThan(3);
  });

  test("the published schema lists the same step types as the validator", () => {
    const stepProps = Object.keys((schema as { $defs: { step: { properties: object } } }).$defs.step.properties);
    for (const t of STEP_TYPES) expect(stepProps).toContain(t);
  });
});

describe("amounts", () => {
  test("numbers with units and tolerances", () => {
    expect(amount("2.5 V")).toBeCloseTo(2.5);
    expect(amount("10k")).toBeCloseTo(10e3);
    expect(amount("4.7 mA")).toBeCloseTo(4.7e-3);
    expect(amount("500 ms")).toBeCloseTo(0.5);
    expect(amount(3)).toBe(3);
    expect(toleranceWidth("2%", 5)).toBeCloseTo(0.1);
    expect(toleranceWidth("0.05 V", 5)).toBeCloseTo(0.05);
  });
});

describe("markdown-lite", () => {
  test("paragraphs, lists and inline marks", () => {
    const b = parseMarkdownLite("Hello **big** `I = V/R`\nworld\n\n- one *a*\n- two\n\n1. first");
    expect(b[0]).toEqual({
      kind: "p",
      inlines: [
        { kind: "text", text: "Hello " },
        { kind: "bold", text: "big" },
        { kind: "text", text: " " },
        { kind: "code", text: "I = V/R" },
        { kind: "text", text: " world" },
      ],
    });
    expect(b[1]).toMatchObject({ kind: "ul", items: [[{ text: "one " }, { kind: "italic", text: "a" }], [{ text: "two" }]] });
    expect(b[2]).toMatchObject({ kind: "ol" });
  });
  test("HTML is plain text", () => {
    expect(parseMarkdownLite("<b>x</b>")).toEqual([{ kind: "p", inlines: [{ kind: "text", text: "<b>x</b>" }] }]);
  });
});
