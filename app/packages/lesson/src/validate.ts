// Turns parsed YAML into a Lesson, listing every problem with its path (LES-16).
// Mirrors schema/lesson-v1.schema.json; the schema serves editors, this serves the app.

import { amount, isTolerance } from "./amount";
import type {
  Amount,
  BlindItem,
  Check,
  CircuitSource,
  Compare,
  Fault,
  Feedback,
  Lesson,
  LessonProblem,
  PanelName,
  Permissions,
  Quantity,
  Step,
  StepType,
  ToolName,
  ValueRef,
} from "./types";

type Path = (string | number)[];
type Obj = Record<string, unknown>;

export const STEP_TYPES: StepType[] = ["read", "predict-number", "predict-choice", "do", "observe", "measure", "explain", "troubleshoot"];
export const CHECK_KINDS = ["all", "any", "not", "part", "property", "switch", "connected", "probe", "value", "measurement", "diagnostic", "sim-time", "run-state"] as const;
const STEP_COMMON = ["id", "title", "spotlight", "hints", "feedback", "permissions", "success"];
const BLIND: BlindItem[] = ["readouts", "traces", "animation"];
const PANELS: PanelName[] = ["palette", "chart", "inspector", "status", "topbar"];
const TOOLS: ToolName[] = ["select", "wire", "probe-v", "place"];
const QUANTITIES: Quantity[] = ["voltage", "current", "power"];
const TOP_KEYS = ["lesson", "title", "time", "objectives", "concepts", "circuit", "permissions", "steps", "summary", "$schema", "version"];
export const MAX_HINTS = 3;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isAmount = (v: unknown): v is Amount => (typeof v === "number" || typeof v === "string") && amount(v as Amount) !== null;

class Collector {
  problems: LessonProblem[] = [];
  error(path: Path, message: string): void {
    this.problems.push({ path, message, severity: "error" });
  }
  warn(path: Path, message: string): void {
    this.problems.push({ path, message, severity: "warning" });
  }
  str(o: Obj, key: string, path: Path, required = false): string | undefined {
    const v = o[key];
    if (v === undefined || v === null) {
      if (required) this.error([...path, key], `"${key}" is required.`);
      return undefined;
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v !== "string") {
      this.error([...path, key], `"${key}" must be text.`);
      return undefined;
    }
    return v;
  }
  strList(o: Obj, key: string, path: Path): string[] {
    const v = o[key];
    if (v === undefined || v === null) return [];
    const list = typeof v === "string" ? [v] : v;
    if (!Array.isArray(list)) {
      this.error([...path, key], `"${key}" must be a list.`);
      return [];
    }
    return list.flatMap((x, i) => {
      if (typeof x === "string" || typeof x === "number") return [String(x)];
      this.error([...path, key, i], `Each item of "${key}" must be text.`);
      return [];
    });
  }
  bool(o: Obj, key: string, path: Path, dflt: boolean): boolean {
    const v = o[key];
    if (v === undefined) return dflt;
    if (typeof v !== "boolean") {
      this.error([...path, key], `"${key}" must be true or false.`);
      return dflt;
    }
    return v;
  }
  unknownKeys(o: Obj, allowed: readonly string[], path: Path): void {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) this.warn([...path, k], `Unknown field "${k}" is ignored.`);
  }
  oneOf<T extends string>(v: unknown, list: readonly T[], path: Path, what: string): T | undefined {
    if (typeof v === "string" && (list as readonly string[]).includes(v)) return v as T;
    this.error(path, `${what} must be one of: ${list.join(", ")}.`);
    return undefined;
  }
}

export interface ValidationResult {
  lesson?: Lesson;
  problems: LessonProblem[];
}

/** Validate a parsed lesson object. A lesson is returned only when there are no errors. */
export function validateLesson(raw: unknown): ValidationResult {
  const v = new Collector();
  if (!isObj(raw)) {
    v.error([], "A lesson file must be a YAML mapping with lesson, title and steps.");
    return { problems: v.problems };
  }
  v.unknownKeys(raw, TOP_KEYS, []);
  const id = v.str(raw, "lesson", [], true);
  if (id !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(id)) v.error(["lesson"], `"lesson" must be a kebab-case id such as "ohms-law".`);
  const title = v.str(raw, "title", [], true);
  const lesson: Lesson = {
    id: id ?? "",
    title: title ?? "",
    time: v.str(raw, "time", []),
    objectives: v.strList(raw, "objectives", []),
    concepts: v.strList(raw, "concepts", []),
    circuit: circuitSource(v, raw.circuit),
    permissions: permissions(v, raw.permissions, ["permissions"]),
    steps: [],
    summary: v.str(raw, "summary", []),
  };
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    v.error(["steps"], `"steps" must be a list with at least one step.`);
  } else {
    raw.steps.forEach((s, i) => {
      const step = parseStep(v, s, ["steps", i]);
      if (step) lesson.steps.push(step);
    });
    const ids = new Set<string>();
    lesson.steps.forEach((s, i) => {
      if (!s.id) return;
      if (ids.has(s.id)) v.error(["steps", i, "id"], `Step id "${s.id}" is used twice.`);
      ids.add(s.id);
    });
    lesson.steps.forEach((s, i) => {
      if (s.type !== "observe" || s.compareWith === undefined) return;
      const target = findStep(lesson.steps, s.compareWith);
      if (target < 0) v.error(["steps", i, "observe", "compare-with"], `compare-with names no step: ${s.compareWith}.`);
      else if (target >= i) v.error(["steps", i, "observe", "compare-with"], `compare-with must name an earlier step.`);
      else if (!lesson.steps[target].type.startsWith("predict")) v.warn(["steps", i, "observe", "compare-with"], `Step ${target + 1} is not a prediction.`);
    });
  }
  const errors = v.problems.some((p) => p.severity === "error");
  return { lesson: errors ? undefined : lesson, problems: v.problems };
}

/** Index of a step named by 1-based number or id; -1 when none. */
export function findStep(steps: readonly Step[], ref: string | number): number {
  if (typeof ref === "number") return Number.isInteger(ref) && ref >= 1 && ref <= steps.length ? ref - 1 : -1;
  const byId = steps.findIndex((s) => s.id === ref);
  if (byId >= 0) return byId;
  const n = Number(ref);
  return Number.isInteger(n) && n >= 1 && n <= steps.length ? n - 1 : -1;
}

function circuitSource(v: Collector, c: unknown): CircuitSource | undefined {
  if (c === undefined || c === null) return undefined;
  if (typeof c === "string") {
    if (/^(javascript|data):/i.test(c.trim())) {
      v.error(["circuit"], "The circuit must be a file address, not a script or data URL.");
      return undefined;
    }
    return { url: c };
  }
  if (isObj(c)) {
    if (typeof c.example === "string") return { example: c.example };
    if (c.format === "circuit-simulator") return { inline: c };
    if (isObj(c.inline)) return { inline: c.inline };
  }
  v.error(["circuit"], `"circuit" must be a file address, { example: name }, or an inline circuit with format: circuit-simulator.`);
  return undefined;
}

function permissions(v: Collector, raw: unknown, path: Path): Permissions {
  if (raw === undefined) return {};
  if (!isObj(raw)) {
    v.error(path, "permissions must be a mapping.");
    return {};
  }
  v.unknownKeys(raw, ["edit", "palette", "tools", "locked", "panels"], path);
  const p: Permissions = {};
  if (raw.edit !== undefined) p.edit = v.oneOf(raw.edit, ["full", "values", "none"] as const, [...path, "edit"], "edit");
  if (raw.palette !== undefined) p.palette = raw.palette === "all" ? "all" : v.strList(raw, "palette", path);
  if (raw.locked !== undefined) p.locked = raw.locked === "all" ? "all" : v.strList(raw, "locked", path);
  if (raw.tools !== undefined) {
    p.tools = v.strList(raw, "tools", path).flatMap((t, i) => v.oneOf(t, TOOLS, [...path, "tools", i], "A tool") ?? []);
  }
  if (raw.panels !== undefined) {
    p.panels = v.strList(raw, "panels", path).flatMap((t, i) => v.oneOf(t, PANELS, [...path, "panels", i], "A panel") ?? []);
  }
  return p;
}

function parseStep(v: Collector, raw: unknown, path: Path): Step | undefined {
  if (!isObj(raw)) {
    v.error(path, `A step must be a mapping such as "- read: Some text".`);
    return undefined;
  }
  const types = Object.keys(raw).filter((k) => (STEP_TYPES as string[]).includes(k));
  if (types.length !== 1) {
    v.error(path, types.length ? `A step has exactly one type; found ${types.join(" and ")}.` : `A step needs a type: one of ${STEP_TYPES.join(", ")}.`);
    return undefined;
  }
  const type = types[0] as StepType;
  v.unknownKeys(raw, [type, ...STEP_COMMON], path);
  const body: Obj = typeof raw[type] === "string" ? { prompt: raw[type] } : isObj(raw[type]) ? (raw[type] as Obj) : {};
  if (!isObj(raw[type]) && typeof raw[type] !== "string") v.error([...path, type], `"${type}" must be text or a mapping.`);
  const bp = [...path, type];
  const hints = v.strList(raw, "hints", path);
  if (hints.length > MAX_HINTS) v.error([...path, "hints"], `A step can have at most ${MAX_HINTS} hints.`);
  const base = {
    id: raw.id === undefined ? undefined : v.str(raw, "id", path),
    title: v.str(raw, "title", path),
    text: v.str(body, "prompt", bp) ?? v.str(body, "text", bp) ?? "",
    spotlight: v.strList(raw, "spotlight", path),
    hints: hints.slice(0, MAX_HINTS),
    feedback: feedbackList(v, raw.feedback, [...path, "feedback"]),
    permissions: raw.permissions === undefined ? undefined : permissions(v, raw.permissions, [...path, "permissions"]),
    success: v.str(raw, "success", path) ?? v.str(body, "success", bp),
  };
  const blind = (): BlindItem[] => v.strList(body, "blind", bp).flatMap((b, i) => v.oneOf(b, BLIND, [...bp, "blind", i], "A blind item") ?? []);
  switch (type) {
    case "read":
      v.unknownKeys(body, ["prompt", "text"], bp);
      return { ...base, type };
    case "predict-number":
      v.unknownKeys(body, ["prompt", "text", "unit", "blind", "lock-run"], bp);
      return { ...base, type, unit: v.str(body, "unit", bp), blind: blind(), lockRun: v.bool(body, "lock-run", bp, true) };
    case "predict-choice": {
      v.unknownKeys(body, ["prompt", "text", "options", "answer", "blind", "lock-run"], bp);
      const options = v.strList(body, "options", bp);
      if (options.length < 2) v.error([...bp, "options"], "A choice needs at least two options.");
      let answer: number | undefined;
      if (body.answer !== undefined) {
        const a = typeof body.answer === "number" ? body.answer - 1 : options.indexOf(String(body.answer));
        if (!Number.isInteger(a) || a < 0 || a >= options.length) v.error([...bp, "answer"], "answer must be one of the options (or its 1-based number).");
        else answer = a;
      }
      return { ...base, type, options, answer, blind: blind(), lockRun: v.bool(body, "lock-run", bp, true) };
    }
    case "do": {
      v.unknownKeys(body, ["prompt", "text", "check", "success"], bp);
      if (body.check === undefined) v.error([...bp, "check"], "A do step needs a check.");
      const check = body.check === undefined ? undefined : parseCheck(v, body.check, [...bp, "check"]);
      return check ? { ...base, type, check } : undefined;
    }
    case "observe": {
      v.unknownKeys(body, ["prompt", "text", "run-for", "compare-with", "show", "unit"], bp);
      const runFor = amount(body["run-for"] as Amount);
      if (runFor === null || runFor < 0) v.error([...bp, "run-for"], `"run-for" must be a time such as "0.5 s".`);
      const cw = body["compare-with"];
      if (cw !== undefined && typeof cw !== "string" && typeof cw !== "number") v.error([...bp, "compare-with"], "compare-with must be a step number or id.");
      return {
        ...base,
        type,
        runFor: runFor ?? 0,
        compareWith: typeof cw === "string" || typeof cw === "number" ? cw : undefined,
        show: body.show === undefined ? undefined : valueRef(v, body.show, [...bp, "show"]),
        unit: v.str(body, "unit", bp),
      };
    }
    case "measure": {
      v.unknownKeys(body, ["prompt", "text", "value", "unit", "tolerance"], bp);
      const value = valueRef(v, body.value, [...bp, "value"]);
      const tolerance = body.tolerance ?? "2%";
      if (!isTolerance(tolerance)) v.error([...bp, "tolerance"], `tolerance must be such as "2%" or "0.05 V".`);
      return value ? { ...base, type, value, unit: v.str(body, "unit", bp), tolerance: tolerance as Amount } : undefined;
    }
    case "explain": {
      v.unknownKeys(body, ["prompt", "text", "options", "report-text"], bp);
      const options = body.options === undefined ? undefined : v.strList(body, "options", bp);
      return { ...base, type, options, reportText: v.bool(body, "report-text", bp, false) };
    }
    case "troubleshoot": {
      v.unknownKeys(body, ["prompt", "text", "faults"], bp);
      if (!Array.isArray(body.faults) || body.faults.length === 0) {
        v.error([...bp, "faults"], "A troubleshoot step lists at least one fault.");
        return undefined;
      }
      const faults = body.faults.flatMap((f, i) => fault(v, f, [...bp, "faults", i]) ?? []);
      return { ...base, type, faults };
    }
  }
}

function fault(v: Collector, raw: unknown, path: Path): Fault | undefined {
  // Short form: "R2 open".
  if (typeof raw === "string") {
    const m = /^\s*(\S+)\s+(open|short|shorted)\s*$/i.exec(raw);
    if (m) return { part: m[1], kind: m[2].toLowerCase() === "open" ? "open" : "short" };
    v.error(path, `A fault is written "R2 open", "C1 short", or { part, kind: value, props }.`);
    return undefined;
  }
  if (!isObj(raw)) {
    v.error(path, "A fault must be text or a mapping.");
    return undefined;
  }
  v.unknownKeys(raw, ["part", "kind", "props"], path);
  const part = v.str(raw, "part", path, true);
  const kind = v.oneOf(raw.kind, ["open", "short", "value"] as const, [...path, "kind"], "kind");
  let props: Fault["props"];
  if (kind === "value") {
    if (!isObj(raw.props)) v.error([...path, "props"], "A value fault needs props, such as { resistance: 100k }.");
    else props = raw.props as Fault["props"];
  }
  return part && kind ? { part, kind, props } : undefined;
}

function feedbackList(v: Collector, raw: unknown, path: Path): Feedback[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    v.error(path, "feedback must be a list.");
    return [];
  }
  return raw.flatMap((f, i): Feedback[] => {
    const p = [...path, i];
    if (!isObj(f) || typeof f.say !== "string") {
      v.error(p, `Each feedback item needs "say" text and either "diagnostic" or "when".`);
      return [];
    }
    v.unknownKeys(f, ["say", "diagnostic", "when"], p);
    if (typeof f.diagnostic === "string") return [{ diagnostic: f.diagnostic, say: f.say }];
    if (f.when !== undefined) {
      const when = parseCheck(v, f.when, [...p, "when"]);
      return when ? [{ when, say: f.say }] : [];
    }
    v.error(p, `A feedback item needs "diagnostic" (an id) or "when" (a check).`);
    return [];
  });
}

function valueRef(v: Collector, raw: unknown, path: Path): ValueRef | undefined {
  if (isObj(raw)) {
    if (typeof raw.probe === "string") return { probe: raw.probe };
    if (typeof raw.part === "string") {
      const q = v.oneOf(raw.quantity ?? "voltage", QUANTITIES, [...path, "quantity"], "quantity");
      return q ? { part: raw.part, quantity: q } : undefined;
    }
  }
  v.error(path, "A value is { part: R1, quantity: current } or { probe: name }.");
  return undefined;
}

function compareFields(v: Collector, o: Obj, path: Path, need: boolean): Compare | undefined {
  const c: Compare = {};
  for (const k of ["equals", "above", "below"] as const) {
    if (o[k] === undefined) continue;
    if (!isAmount(o[k])) v.error([...path, k], `${k} must be a number, optionally with units ("2.5 V").`);
    else c[k] = o[k] as Amount;
  }
  if (o.tolerance !== undefined) {
    if (!isTolerance(o.tolerance)) v.error([...path, "tolerance"], `tolerance must be such as "2%" or "0.05 V".`);
    else c.tolerance = o.tolerance as Amount;
  }
  if (o.within !== undefined) {
    if (!Array.isArray(o.within) || o.within.length !== 2 || !o.within.every(isAmount)) v.error([...path, "within"], "within must be [min, max].");
    else c.within = o.within as [Amount, Amount];
  }
  if (need && c.equals === undefined && c.above === undefined && c.below === undefined && c.within === undefined) {
    v.error(path, "Give equals (with tolerance), above, below, or within.");
    return undefined;
  }
  return c;
}

const ONE_KEY = (o: Obj): string | undefined => {
  const keys = Object.keys(o);
  return keys.length === 1 ? keys[0] : undefined;
};

/** A check is a mapping with exactly one key from the check vocabulary (LES-06). */
export function parseCheck(v: Collector, raw: unknown, path: Path): Check | undefined {
  if (!isObj(raw)) {
    v.error(path, `A check is a mapping such as "part: { type: resistor }".`);
    return undefined;
  }
  const kind = ONE_KEY(raw);
  if (!kind || !(CHECK_KINDS as readonly string[]).includes(kind)) {
    v.error(path, `A check has exactly one of: ${CHECK_KINDS.join(", ")}.`);
    return undefined;
  }
  const body = raw[kind];
  const p = [...path, kind];
  const obj = (): Obj | undefined => {
    if (isObj(body)) return body;
    v.error(p, `"${kind}" must be a mapping.`);
    return undefined;
  };
  switch (kind) {
    case "all":
    case "any": {
      if (!Array.isArray(body) || body.length === 0) {
        v.error(p, `"${kind}" must be a non-empty list of checks.`);
        return undefined;
      }
      const list = body.map((c, i) => parseCheck(v, c, [...p, i]));
      return list.every(Boolean) ? ({ [kind]: list as Check[] } as Check) : undefined;
    }
    case "not": {
      const c = parseCheck(v, body, p);
      return c ? { not: c } : undefined;
    }
    case "part": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["type", "label", "exists"], p);
      if (o.type === undefined && o.label === undefined) v.error(p, "A part check names a type, a label, or both.");
      return { part: { type: v.str(o, "type", p), label: v.str(o, "label", p), exists: v.bool(o, "exists", p, true) } };
    }
    case "property": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["part", "prop", "equals", "tolerance", "above", "below", "within"], p);
      const part = v.str(o, "part", p, true);
      const prop = v.str(o, "prop", p, true);
      const c = compareFields(v, o, p, true);
      return part && prop && c ? { property: { part, prop, ...c } } : undefined;
    }
    case "switch": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["part", "closed"], p);
      const part = v.str(o, "part", p, true);
      if (typeof o.closed !== "boolean") v.error([...p, "closed"], "closed must be true or false.");
      return part && typeof o.closed === "boolean" ? { switch: { part, closed: o.closed } } : undefined;
    }
    case "connected": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["a", "b", "connected"], p);
      const a = v.str(o, "a", p, true);
      const b = v.str(o, "b", p, true);
      return a && b ? { connected: { a, b, connected: v.bool(o, "connected", p, true) } } : undefined;
    }
    case "probe": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["quantity", "part", "exists"], p);
      let quantity: Quantity | "logic" | undefined;
      if (o.quantity !== undefined) quantity = v.oneOf(o.quantity, [...QUANTITIES, "logic"] as const, [...p, "quantity"], "quantity");
      return { probe: { quantity, part: v.str(o, "part", p), exists: v.bool(o, "exists", p, true) } };
    }
    case "value": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["of", "equals", "tolerance", "above", "below", "within"], p);
      const of = valueRef(v, o.of, [...p, "of"]);
      const c = compareFields(v, o, p, true);
      return of && c ? { value: { of, ...c } } : undefined;
    }
    case "measurement": {
      const o = obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["probe", "kind", "over", "equals", "tolerance", "above", "below", "within"], p);
      const probe = v.str(o, "probe", p, true);
      const mk = v.str(o, "kind", p, true);
      if (o.over !== undefined && !isAmount(o.over)) v.error([...p, "over"], `over must be a time such as "1 s".`);
      const c = compareFields(v, o, p, true);
      return probe && mk && c ? { measurement: { probe, kind: mk, over: isAmount(o.over) ? o.over : undefined, ...c } } : undefined;
    }
    case "diagnostic": {
      const o = typeof body === "string" ? { id: body } : obj();
      if (!o) return undefined;
      v.unknownKeys(o, ["id", "present"], p);
      const id = v.str(o, "id", p, true);
      return id ? { diagnostic: { id, present: v.bool(o, "present", p, true) } } : undefined;
    }
    case "sim-time": {
      if (!isAmount(body)) {
        v.error(p, `sim-time must be a time such as "1 s".`);
        return undefined;
      }
      return { "sim-time": body };
    }
    case "run-state": {
      const s = v.oneOf(body, ["running", "paused"] as const, p, "run-state");
      return s ? { "run-state": s } : undefined;
    }
  }
  return undefined;
}

export type { Collector };
