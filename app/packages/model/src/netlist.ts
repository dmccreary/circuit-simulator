// Shared contract: what the netlist compiler produces and the engine consumes
// (design/circuit-model.md §4, design/simulation-engine.md §7).
// Changing this file affects every package; coordinate before editing.

import type { CircuitSettings, Diagnostic, ElementId, NodeId, Point, PropValue } from "./types";

/** Node index in a netlist. 0 is ground; analog nodes are 1..nodeCount. */
export type NodeIndex = number;

export interface NetlistElement {
  id: ElementId; // stable part id ("p7") or flattened "U1/R3"
  type: string; // element type, matches ElementDescriptor.type
  nodes: NodeIndex[]; // one per terminal, in descriptor terminal order
  props: Record<string, PropValue>;
  savedState?: number[];
}

export interface Netlist {
  nodeCount: number; // excluding ground
  nodeNames: NodeId[]; // index = NodeIndex; nodeNames[0] === "GND"
  elements: NetlistElement[];
  settings: CircuitSettings;
}

/**
 * Offset of each element's first terminal current in the display state's
 * terminal-current block. Element i owns entries [offsets[i], offsets[i+1]).
 */
export function terminalCurrentOffsets(netlist: Netlist): number[] {
  const out = [0];
  for (const el of netlist.elements) out.push(out[out.length - 1] + el.nodes.length);
  return out;
}

/**
 * Display state layout (one Float64Array / Float32Array):
 *   [0 .. nodeCount]                  node voltages, index = NodeIndex (index 0 = ground = 0 V)
 *   [nodeCount+1 .. +totalTerminals]  current INTO each element terminal, amps,
 *                                     ordered by terminalCurrentOffsets(netlist)
 */
export function displayStateSize(netlist: Netlist): number {
  const offs = terminalCurrentOffsets(netlist);
  return netlist.nodeCount + 1 + offs[offs.length - 1];
}

/** One recorded quantity (design/simulation-engine.md §7.3). */
export type ChannelSpec =
  | { id: string; kind: "voltage"; a: NodeIndex; b: NodeIndex } // V(a) - V(b); b = 0 for node voltage
  | { id: string; kind: "current"; element: ElementId; terminal: number } // into that terminal
  | { id: string; kind: "power"; element: ElementId } // absorbed power, sum of V*I over terminals
  | { id: string; kind: "logic"; node: NodeIndex };

// ---- Compiler output (main thread only) ----

export interface NodeInfo {
  index: NodeIndex;
  name: NodeId;
  points: Point[]; // grid points belonging to the node
  kind: "analog" | "digital" | "mixed";
}

/**
 * A drawn wire segment and how to compute its current from element terminal
 * currents: current flowing from `from` to `to` = sum(sign * terminalCurrent).
 */
export interface SegmentInfo {
  wire: string;
  segment: number;
  from: Point;
  to: Point;
  node: NodeIndex;
  terms: { element: ElementId; terminal: number; sign: 1 | -1 }[];
}

/** Old element ids to new, for state re-mapping across topology changes (SIM-19). */
export type IdentityMap = Record<ElementId, ElementId>;

export interface CompiledCircuit {
  netlist: Netlist;
  nodes: NodeInfo[]; // index = NodeIndex
  /** "x,y" grid key -> node index, for hover (CAN-11) and probe placement. */
  pointToNode: Map<string, NodeIndex>;
  segments: SegmentInfo[];
  /** Probe id -> resolved channel. */
  channels: Record<string, ChannelSpec>;
  identity: IdentityMap;
  diagnostics: Diagnostic[];
}

/** What the compiler needs to know about part types; implemented by the elements package. */
export interface PartResolver {
  /** Terminal positions in document grid coordinates, in descriptor terminal order. */
  terminals(part: import("./types").Part): Point[];
  traits(type: string): PartTraits;
}

export interface PartTraits {
  known: boolean;
  /** Terminal 0 joins the named net, like a net label (the ground symbol uses "GND"). */
  netName?: string;
  voltageSource?: boolean; // ideal voltage source between terminals 0 and 1
  currentSource?: boolean;
  ammeter?: boolean;
  voltmeter?: boolean;
  /** Pairs of terminals joined by a zero-resistance path inside the part (closed switch, wire-like parts). */
  shorts?(props: Record<string, PropValue>): [number, number][];
  digitalPins?: number[];
}

export const pointKey = (p: Point): string => `${p.x},${p.y}`;
