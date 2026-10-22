import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { str, type Props } from "../shared/props";
import { CUSTOM_LOGIC_SIZES, customLogicType } from "./descriptor";

interface Rule {
  left: string;
  right: string;
}

/** CustomLogicModel.parseRules(): invalid lines are skipped; a letter's second use is upper-cased (compare). */
export function parseRules(text: string, inputs: number, outputs: number): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split("\n")) {
    const s = line.toLowerCase().trim();
    if (!s || s.startsWith("#")) continue;
    const parts = s.replace(/ /g, "").split("=");
    if (parts.length !== 2) continue;
    const [l, r] = parts;
    if (l.length < inputs || l.length > inputs + outputs || r.length !== outputs) continue;
    const used = new Set<string>();
    let left = "";
    let ok = true;
    for (const c of l) {
      if ("?+-01".includes(c)) left += c;
      else if (c >= "a" && c <= "z") {
        left += used.has(c) ? c.toUpperCase() : c;
        used.add(c);
      } else ok = false;
    }
    if (ok) rules.push({ left, right: r });
  }
  return rules;
}

/** CircuitJS1 CustomLogicElm.execute(): the first matching rule sets the outputs; none matching keeps them. */
class CustomLogicModel extends ChipModel {
  private rules: Rule[] = [];
  private prev: boolean[] = [];

  constructor(el: NetlistElement, private readonly inputs: number, private readonly outputs: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.rules = parseRules(str(p, "rules", ""), this.inputs, this.outputs);
  }

  protected execute(): void {
    const v = this.v;
    const last = this.prev.length === v.length ? this.prev : v.map(() => false);
    const pattern = new Map<string, boolean>();
    for (const { left, right } of this.rules) {
      let j = 0;
      for (; j < left.length; j++) {
        const c = left[j];
        if (c === "0" || c === "1") {
          if (v[j] !== (c === "1")) break;
        } else if (c === "+") {
          if (!(v[j] && !last[j])) break;
        } else if (c === "-") {
          if (!(!v[j] && last[j])) break;
        } else if (c >= "a" && c <= "z") pattern.set(c, v[j]);
        else if (c >= "A" && c <= "Z") {
          if (pattern.get(c.toLowerCase()) !== v[j]) break;
        }
      }
      if (j !== left.length) continue;
      for (let k = 0; k < right.length; k++) {
        const c = right[k];
        const pin = this.inputs + k;
        this.z[pin] = c === "_";
        if (c >= "a" && c <= "z") v[pin] = pattern.get(c) ?? false;
        else if (c !== "_") v[pin] = c === "1";
      }
      break;
    }
    this.prev = v.slice();
  }

  override loadState(from: Float64Array): void {
    super.loadState(from);
    this.prev = this.v.slice();
  }

  override initialize(): void {
    super.initialize();
    this.prev = this.v.slice();
  }
}

export const CUSTOM_LOGIC_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  CUSTOM_LOGIC_SIZES.map(([i, o]) => [customLogicType(i, o), chipFactory(CustomLogicModel, i, o)]),
);
