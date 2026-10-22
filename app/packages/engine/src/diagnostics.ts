// Numerical problems become diagnostics tied to elements (SIM-14, SIM-16).
// Messages are translation keys; the shell owns the wording.

import type { Diagnostic } from "@cs/model";
import type { Circuit } from "./circuit";

/** `row` is the 0-based matrix row from SingularError. */
export function singularDiagnostic(c: Circuit, row: number, t: number): Diagnostic {
  const u = row + 1;
  const names = c.netlist.nodeNames;
  if (u <= c.nodeCount) {
    const node = names[u] ?? `N${u}`;
    return {
      id: "singular-matrix",
      severity: "error",
      message: { key: "engine.singular.node", values: { node } },
      elements: c.netlist.elements.filter((el) => el.nodes.includes(u)).map((el) => el.id),
      nodes: [node],
      simTime: t,
    };
  }
  const owner = c.netlist.elements[c.branchOwner[u - c.nodeCount - 1]];
  return {
    id: "singular-matrix",
    severity: "error",
    message: { key: "engine.singular.branch", values: { element: owner?.id ?? "" } },
    elements: owner ? [owner.id] : [],
    nodes: owner ? owner.nodes.map((n) => names[n] ?? `N${n}`) : [],
    simTime: t,
  };
}

export function noConvergenceDiagnostic(c: Circuit, t: number): Diagnostic {
  return {
    id: "no-convergence",
    severity: "error",
    message: { key: "engine.noConvergence", values: { t } },
    elements: c.netlist.elements.filter((_, i) => c.models[i]?.nonlinear).map((el) => el.id),
    simTime: t,
  };
}

export function stepTooLargeDiagnostic(maxStep: number, limit: number): Diagnostic {
  return {
    id: "step-too-large",
    severity: "warning",
    message: { key: "engine.stepTooLarge", values: { maxStep, limit } },
    elements: [],
  };
}

/** Zero-delay feedback that never settles (an inverter ring with no delay). */
export function digitalOscillationDiagnostic(elements: string[], t: number): Diagnostic {
  return {
    id: "digital-oscillation",
    severity: "error",
    message: { key: "engine.digitalOscillation", values: { t } },
    elements,
    simTime: t,
  };
}

/** Some nodes had no defined voltage and were tied to 0 V (a section with no ground). */
export function floatingDiagnostic(c: Circuit, ties: number[]): Diagnostic {
  const names = c.netlist.nodeNames;
  const nodes = ties.map((u) => names[u] ?? `N${u}`);
  return {
    id: "floating-tied",
    severity: "info",
    message: { key: "engine.floatingTied", values: { count: ties.length, nodes: nodes.join(", ") } },
    elements: c.netlist.elements.filter((el) => el.nodes.some((n) => ties.includes(n))).map((el) => el.id),
    nodes,
  };
}
