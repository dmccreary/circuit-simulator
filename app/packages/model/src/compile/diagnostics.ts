// Stage 6: structural checks (EDT-39). Graph searches over nodes and elements.
import { newId } from "../document";
import type { NodeIndex } from "../netlist";
import type { Diagnostic, Point } from "../types";
import type { ElementRec, Graph } from "./collect";
import { UnionFind, type NodeAssignment } from "./nodes";

interface El {
  rec: ElementRec;
  nodes: NodeIndex[];
}

export function checkCircuit(g: Graph, na: NodeAssignment, els: El[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const name = (n: NodeIndex) => na.groups[n]?.name ?? String(n);
  const s = (n: NodeIndex) => String(n);

  if (!na.hasGround && els.length > 0) out.push(noGround(g, na, els));

  // Floating sections: element-connected components not reaching node 0.
  {
    const uf = new UnionFind();
    for (const e of els) for (const n of e.nodes) uf.union(s(e.nodes[0]), s(n));
    const comps = new Map<string, El[]>();
    for (const e of els) {
      if (e.nodes.length === 0) continue;
      const r = uf.find(s(e.nodes[0]));
      const list = comps.get(r);
      if (list) list.push(e);
      else comps.set(r, [e]);
    }
    const groundRoot = uf.find("0");
    for (const [r, list] of comps) {
      if (r === groundRoot) continue;
      out.push({
        id: "floating-section",
        severity: "warning",
        message: { key: "diag.floatingSection", values: { count: list.length } },
        elements: list.map((e) => e.rec.id),
      });
    }
  }

  // Dangling wire ends and open terminals (top level only).
  for (const end of g.wireEnds) {
    if ((g.touches.get(end.key) ?? 0) <= 1) {
      out.push({
        id: "dangling-wire-end",
        severity: "info",
        message: { key: "diag.danglingWireEnd" },
        elements: [end.wire],
        nodes: [name(na.keyToNode.get(end.key) ?? 0)],
      });
    }
  }
  const elementIds = new Set(els.map((e) => e.rec.id));
  for (const t of g.terminals) {
    if (!elementIds.has(t.part)) continue;
    if ((g.touches.get(t.key) ?? 0) <= 1) {
      out.push({
        id: "open-terminal",
        severity: "info",
        message: { key: "diag.openTerminal", values: { terminal: t.terminal } },
        elements: [t.part],
      });
    }
  }

  // Zero-resistance graph: internal shorts and ammeters, then voltage sources.
  const shortUF = new UnionFind();
  const srcUF = new UnionFind();
  for (const e of els) {
    const pairs: [number, number][] = e.rec.traits.shorts?.(e.rec.part.props) ?? [];
    if (e.rec.traits.ammeter && e.nodes.length >= 2) pairs.push([0, 1]);
    for (const [a, b] of pairs) {
      if (a >= e.nodes.length || b >= e.nodes.length) continue;
      shortUF.union(s(e.nodes[a]), s(e.nodes[b]));
      srcUF.union(s(e.nodes[a]), s(e.nodes[b]));
    }
  }
  const sources = els.filter((e) => e.rec.traits.voltageSource && e.nodes.length >= 2);
  const added: El[] = [];
  for (const v of sources) {
    const [a, b] = [s(v.nodes[0]), s(v.nodes[1])];
    if (shortUF.find(a) === shortUF.find(b)) {
      out.push({
        id: "short-across-source",
        severity: "error",
        message: { key: "diag.shortAcrossSource" },
        elements: [v.rec.id],
      });
    } else if (srcUF.find(a) === srcUF.find(b)) {
      const root = srcUF.find(a);
      const others = added.filter((o) => srcUF.find(s(o.nodes[0])) === root).map((o) => o.rec.id);
      out.push({
        id: "sources-in-parallel",
        severity: "error",
        message: { key: "diag.sourcesInParallel" },
        elements: [...others, v.rec.id],
      });
    }
    srcUF.union(a, b);
    added.push(v);
  }

  // Ideal current source with no other path between its terminals.
  {
    const uf = new UnionFind();
    for (const e of els) {
      if (e.rec.traits.currentSource) continue;
      for (const n of e.nodes) uf.union(s(e.nodes[0]), s(n));
    }
    for (const c of els) {
      if (!c.rec.traits.currentSource || c.nodes.length < 2) continue;
      if (c.nodes[0] !== c.nodes[1] && uf.find(s(c.nodes[0])) !== uf.find(s(c.nodes[1]))) {
        out.push({
          id: "current-source-no-path",
          severity: "error",
          message: { key: "diag.currentSourceNoPath" },
          elements: [c.rec.id],
        });
      }
    }
  }

  // Overlapping parts: identical terminal positions.
  {
    const byPlace = new Map<string, string[]>();
    for (const e of els) {
      if (!e.rec.topLevel || e.rec.keys.length === 0) continue;
      const k = `${e.rec.part.type}|${[...e.rec.keys].sort().join(";")}`;
      const list = byPlace.get(k);
      if (list) list.push(e.rec.id);
      else byPlace.set(k, [e.rec.id]);
    }
    for (const ids of byPlace.values()) {
      if (ids.length > 1) {
        out.push({ id: "overlapping-parts", severity: "warning", message: { key: "diag.overlappingParts" }, elements: ids });
      }
    }
  }

  // Meters placed wrongly.
  const pairKey = (a: NodeIndex, b: NodeIndex) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const termsAt = new Map<NodeIndex, El[]>();
  for (const e of els) for (const n of e.nodes) termsAt.set(n, [...(termsAt.get(n) ?? []), e]);
  for (const m of els) {
    if (m.nodes.length < 2) continue;
    if (m.rec.traits.ammeter) {
      const k = pairKey(m.nodes[0], m.nodes[1]);
      const parallel = els.filter(
        (o) => o !== m && !o.rec.traits.ammeter && !o.rec.traits.voltmeter && o.nodes.length === 2 && pairKey(o.nodes[0], o.nodes[1]) === k,
      );
      if (parallel.length > 0) {
        out.push({
          id: "ammeter-in-parallel",
          severity: "warning",
          message: { key: "diag.ammeterInParallel" },
          elements: [m.rec.id, ...parallel.map((o) => o.rec.id)],
        });
      }
    }
    if (m.rec.traits.voltmeter) {
      const inSeries = m.nodes.slice(0, 2).some((n) => {
        if (n === 0) return false;
        const at = termsAt.get(n) ?? [];
        return at.length === 2 && at.some((o) => o !== m && !o.rec.traits.voltmeter);
      });
      if (inSeries) {
        out.push({ id: "voltmeter-in-series", severity: "warning", message: { key: "diag.voltmeterInSeries" }, elements: [m.rec.id] });
      }
    }
  }
  return out;
}

function noGround(g: Graph, na: NodeAssignment, els: El[]): Diagnostic {
  const src = els.find((e) => e.rec.topLevel && e.rec.traits.voltageSource && e.rec.keys.length >= 2);
  let at: Point | undefined;
  if (src) at = g.vertices.get(src.rec.keys[1])?.point;
  const d: Diagnostic = {
    id: "no-ground",
    severity: "warning",
    message: { key: "diag.noGround", values: { node: na.referenceName ?? "" } },
    elements: [],
    nodes: na.referenceName ? [na.referenceName] : [],
  };
  if (at) {
    const p = at;
    d.fixes = [
      {
        label: { key: "fix.addGround" },
        apply(draft) {
          const id = newId("n");
          draft.netLabels[id] = { id, name: "GND", at: { x: p.x, y: p.y } };
        },
      },
    ];
  }
  return d;
}
