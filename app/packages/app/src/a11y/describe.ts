import type { CircuitDocument, CompiledCircuit, Part, Point } from "@cs/model";
import { terminalCurrentOffsets } from "@cs/model";
import type { ElementDescriptor, ElementView, LiveReadouts } from "@cs/elements";
import { formatValue, type Unit } from "@cs/units";
import { t } from "../messages";
import { readingOrder } from "./focus";

export interface DescribeSources {
  doc: CircuitDocument;
  compiled?: CompiledCircuit;
  /** Latest display state (node voltages, then terminal currents); absent before the first frame. */
  display?: ArrayLike<number>;
  getView(type: string): ElementView | undefined;
  getDescriptor(type: string): ElementDescriptor | undefined;
  terminals(part: Part): Point[];
  /** "," for a decimal comma (learner setting). */
  decimal?: "." | ",";
}

export interface PartDescription {
  id: string;
  label: string;
  /** Accessible name: type, label, value, nodes and (with data) live values (ACC-06, ACC-07). */
  text: string;
  nodes: string[];
  live: string[];
}

const fmt = (v: number, unit: Unit, decimal?: "." | ",") => formatValue(v, unit, { digits: 3, locale: decimal === "," ? "de-DE" : undefined });

/** Live readouts for one part from the display state, as element views expect them. */
export function liveReadouts(src: DescribeSources, part: Part): LiveReadouts | undefined {
  const c = src.compiled;
  const d = src.display;
  if (!c || !d) return undefined;
  const els = c.netlist.elements;
  const i = els.findIndex((e) => e.id === part.id);
  if (i < 0) return undefined;
  const el = els[i];
  const tv = el.nodes.map((n) => (n === 0 ? 0 : (d[n] ?? NaN)));
  const iBase = c.netlist.nodeCount + 1 + terminalCurrentOffsets(c.netlist)[i];
  const current = el.nodes.length ? d[iBase] : undefined;
  const voltage = tv.length >= 2 ? tv[0] - tv[1] : undefined;
  return {
    terminalVoltages: tv,
    get(key: string) {
      if (key === "voltage") return voltage;
      if (key === "current") return current;
      if (key === "power") return voltage !== undefined && current !== undefined ? voltage * current : undefined;
      return undefined;
    },
  };
}

/** Node names each terminal of the part connects to, in terminal order. */
export function partNodes(src: DescribeSources, part: Part): string[] {
  const c = src.compiled;
  const el = c?.netlist.elements.find((e) => e.id === part.id);
  if (!c || !el) return [];
  return el.nodes.map((n) => c.netlist.nodeNames[n] ?? `N${n}`);
}

export function describePart(src: DescribeSources, part: Part): PartDescription {
  const view = src.getView(part.type);
  const desc = src.getDescriptor(part.type);
  const live = liveReadouts(src, part);
  const ref = view?.describe(part, undefined) ?? { key: `element.${part.type}.describe`, values: { label: part.label } };
  let text = t(ref);
  // Element views put the main value in `values.value`; add it when the message did not use it.
  const main = ref.values?.value;
  if (main !== undefined && !text.includes(String(main))) text += `, ${main}`;
  else if (main === undefined && desc) {
    const spec = desc.props.find((p) => (p.kind ?? "number") === "number" && p.showOnCanvas);
    const v = spec && part.props[spec.key];
    if (spec && typeof v === "number") text += `, ${fmt(v, spec.unit, src.decimal)}`;
  }
  const nodes = partNodes(src, part);
  const uniq = [...new Set(nodes)];
  text += uniq.length ? `, ${t({ key: "a11y.nodes", values: { nodes: joinWords(uniq) } })}` : "";
  const values: string[] = [];
  if (live) {
    for (const r of desc?.readouts ?? [{ key: "voltage", unit: "V" as Unit }, { key: "current", unit: "A" as Unit }]) {
      const v = live.get(r.key);
      if (v !== undefined && Number.isFinite(v)) values.push(`${r.key} ${fmt(v, r.unit, src.decimal)}`);
    }
  }
  if (values.length) text += `; ${values.join(", ")}`;
  return { id: part.id, label: part.label, text, nodes, live: values };
}

/** Every part, in reading order. */
export function describeCircuit(src: DescribeSources): PartDescription[] {
  const g = { doc: src.doc, terminals: src.terminals };
  return readingOrder(g).map((id) => describePart(src, src.doc.parts[id]));
}

/** "A", "A and B", "A, B and C". */
export function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
