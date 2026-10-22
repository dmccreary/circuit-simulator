// Each check is a predicate over the lesson context (embedding-lessons-xapi.md §4.3, LES-06).

import type { ProbeTarget } from "@cs/model";
import { amount, compare, seconds } from "./amount";
import { findPart, findProbe, nodeOf, type LessonContext, type Reason } from "./context";
import type { Check, CheckKind, ValueRef } from "./types";

export const checkKind = (c: Check): CheckKind => Object.keys(c)[0] as CheckKind;

/** The events that can change a check's answer (LES-08: evaluate only then). */
export function checkDeps(c: Check, out = new Set<Reason>()): Set<Reason> {
  if ("all" in c) c.all.forEach((x) => checkDeps(x, out));
  else if ("any" in c) c.any.forEach((x) => checkDeps(x, out));
  else if ("not" in c) checkDeps(c.not, out);
  else if ("diagnostic" in c) out.add("diagnostics").add("doc");
  else if ("value" in c || "measurement" in c || "sim-time" in c || "run-state" in c) out.add("frame");
  else out.add("doc");
  return out;
}

export function evaluateCheck(c: Check, ctx: LessonContext): boolean {
  if ("all" in c) return c.all.every((x) => evaluateCheck(x, ctx));
  if ("any" in c) return c.any.some((x) => evaluateCheck(x, ctx));
  if ("not" in c) return !evaluateCheck(c.not, ctx);
  if ("part" in c) {
    const { type, label, exists = true } = c.part;
    const found = Object.values(ctx.doc.parts).some((p) => (type === undefined || p.type === type) && (label === undefined || p.label === label));
    return found === exists;
  }
  if ("property" in c) {
    const part = findPart(ctx.doc, c.property.part);
    const v = part?.props[c.property.prop];
    const n = typeof v === "number" ? v : typeof v === "string" ? amount(v) : typeof v === "boolean" ? Number(v) : null;
    return n !== null && compare(n, c.property);
  }
  if ("switch" in c) {
    const props = findPart(ctx.doc, c.switch.part)?.props;
    if (!props) return false;
    const closed = "closed" in props ? props.closed : props.pressed;
    return typeof closed === "boolean" && closed === c.switch.closed;
  }
  if ("connected" in c) {
    const a = nodeOf(ctx, c.connected.a);
    const b = nodeOf(ctx, c.connected.b);
    if (a === undefined || b === undefined) return c.connected.connected === false;
    return (a === b) === (c.connected.connected ?? true);
  }
  if ("probe" in c) {
    const { quantity, part, exists = true } = c.probe;
    const partId = part === undefined ? undefined : findPart(ctx.doc, part)?.id;
    if (part !== undefined && !partId) return !exists;
    const found = Object.values(ctx.doc.probes).some(
      (p) => (quantity === undefined || p.quantity === quantity) && (partId === undefined || targetTouches(p.target, partId)),
    );
    return found === exists;
  }
  if ("value" in c) {
    const v = readValue(ctx, c.value.of);
    return v !== undefined && compare(v, c.value);
  }
  if ("measurement" in c) {
    const probe = findProbe(ctx.doc, c.measurement.probe);
    const v = probe ? ctx.measure(probe.id, c.measurement.kind, seconds(c.measurement.over) ?? undefined) : undefined;
    return v !== undefined && compare(v, c.measurement);
  }
  if ("diagnostic" in c) {
    const found = ctx.diagnostics.some((d) => d.id === c.diagnostic.id);
    return found === (c.diagnostic.present ?? true);
  }
  if ("sim-time" in c) {
    const t = seconds(c["sim-time"]);
    return t !== null && ctx.simTime >= t - 1e-12;
  }
  if ("run-state" in c) return c["run-state"] === "running" ? ctx.runState === "running" : ctx.runState !== "running";
  return false;
}

/** The latest value of a part quantity or probe. */
export function readValue(ctx: LessonContext, ref: ValueRef): number | undefined {
  if ("probe" in ref) {
    const probe = findProbe(ctx.doc, ref.probe);
    return probe ? ctx.probeValue(probe.id) : undefined;
  }
  const part = findPart(ctx.doc, ref.part);
  return part ? ctx.partValue(part.id, ref.quantity) : undefined;
}

function targetTouches(t: ProbeTarget, partId: string): boolean {
  switch (t.kind) {
    case "terminal":
    case "across":
    case "through":
      return t.part === partId;
    case "between":
      return targetTouches(t.a, partId) || targetTouches(t.b, partId);
    default:
      return false;
  }
}

/** Every part label a check refers to, for validation against the circuit (LES-16). */
export function checkPartRefs(c: Check, out: string[] = []): string[] {
  if ("all" in c) c.all.forEach((x) => checkPartRefs(x, out));
  else if ("any" in c) c.any.forEach((x) => checkPartRefs(x, out));
  else if ("not" in c) checkPartRefs(c.not, out);
  else if ("property" in c) out.push(c.property.part);
  else if ("switch" in c) out.push(c.switch.part);
  else if ("connected" in c) for (const r of [c.connected.a, c.connected.b]) {
    const m = /^(.+)\.\d+$/.exec(r);
    if (m) out.push(m[1]);
  }
  else if ("value" in c && "part" in c.value.of) out.push(c.value.of.part);
  return out;
}
