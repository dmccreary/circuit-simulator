// The engine's view of one netlist: instantiated models, unknown layout, and
// the bookkeeping needed for display state and diagnostics.

import { terminalCurrentOffsets, type Netlist } from "@cs/model";
import type { ElementModel, ModelFactory, SolutionView } from "@cs/elements";

export type FactoryLookup = (type: string) => ModelFactory | undefined;

export interface Circuit {
  netlist: Netlist;
  nodeCount: number;
  /** Total unknowns: node voltages then branch currents. */
  size: number;
  models: (ElementModel | null)[];
  nonlinear: boolean;
  /** Element index that allocated each branch unknown (index = unknown - nodeCount - 1). */
  branchOwner: number[];
  branchNames: string[];
  /** For each element, true when it allocated a branch current. */
  hasBranch: boolean[];
  termOffsets: number[];
  displaySize: number;
  stateOffsets: number[];
  stateTotal: number;
  idIndex: Map<string, number>;
  /** Nodes no modelled terminal touches (a dangling wire); held to ground by gmin. */
  idleNodes: number[];
}

export function buildCircuit(netlist: Netlist, lookup: FactoryLookup): Circuit {
  const nodeCount = netlist.nodeCount;
  const branchOwner: number[] = [];
  const branchNames: string[] = [];
  const models: (ElementModel | null)[] = [];
  const hasBranch: boolean[] = [];
  const idIndex = new Map<string, number>();
  netlist.elements.forEach((el, i) => {
    idIndex.set(el.id, i);
    const factory = lookup(el.type);
    const model = factory ? factory(el) : null;
    models.push(model);
    hasBranch.push(false);
    if (!model) return;
    model.setup({
      nodes: el.nodes,
      allocBranch(name: string) {
        branchOwner.push(i);
        branchNames.push(`${el.id}:${name}`);
        hasBranch[i] = true;
        return nodeCount + branchOwner.length;
      },
    });
  });
  const touched = new Uint8Array(nodeCount + 1);
  netlist.elements.forEach((el, i) => {
    if (models[i]) for (const n of el.nodes) if (n > 0 && n <= nodeCount) touched[n] = 1;
  });
  const idleNodes: number[] = [];
  for (let n = 1; n <= nodeCount; n++) if (!touched[n]) idleNodes.push(n);
  const termOffsets = terminalCurrentOffsets(netlist);
  const stateOffsets = [0];
  for (const m of models) stateOffsets.push(stateOffsets[stateOffsets.length - 1] + (m ? m.stateSize : 0));
  return {
    netlist,
    nodeCount,
    size: nodeCount + branchOwner.length,
    models,
    nonlinear: models.some((m) => !!m?.nonlinear && !!m.stampNewton),
    branchOwner,
    branchNames,
    hasBranch,
    termOffsets,
    displaySize: nodeCount + 1 + termOffsets[termOffsets.length - 1],
    stateOffsets,
    stateTotal: stateOffsets[stateOffsets.length - 1],
    idIndex,
    idleNodes,
  };
}

/** A SolutionView over a vector indexed by unknown (index 0 = ground = 0). */
export class VectorView implements SolutionView {
  constructor(public data: Float64Array) {}
  x(i: number): number {
    return i <= 0 ? 0 : this.data[i];
  }
  v(node: number): number {
    return node <= 0 ? 0 : this.data[node];
  }
}

export function saveAllStates(c: Circuit): Float64Array {
  const out = new Float64Array(c.stateTotal);
  c.models.forEach((m, i) => {
    if (m && m.stateSize > 0) m.saveState(out.subarray(c.stateOffsets[i], c.stateOffsets[i + 1]));
  });
  return out;
}

export function loadAllStates(c: Circuit, states: Float64Array): void {
  c.models.forEach((m, i) => {
    if (m && m.stateSize > 0) m.loadState(states.slice(c.stateOffsets[i], c.stateOffsets[i + 1]));
  });
}

/** Node voltages then terminal currents (displayStateSize layout in @cs/model). */
export function fillDisplay(c: Circuit, x: Float64Array, out: Float64Array): void {
  out[0] = 0;
  for (let n = 1; n <= c.nodeCount; n++) out[n] = x[n];
  const view = new VectorView(x);
  const base = c.nodeCount + 1;
  c.models.forEach((m, i) => {
    const sub = out.subarray(base + c.termOffsets[i], base + c.termOffsets[i + 1]);
    if (m) m.terminalCurrents(view, sub);
    else sub.fill(0);
  });
}
