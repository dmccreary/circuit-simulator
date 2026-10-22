import type { PartResolver, PartTraits, PropValue } from "@cs/model";
import { getDescriptor } from "./descriptors";
import { terminalPositions } from "./geometry";
import { isIdealShort } from "./shared/switchState";

const SWITCH_TYPES = new Set(["switch", "push-button"]);

function traitsFor(type: string): PartTraits {
  const d = getDescriptor(type);
  if (!d) return { known: false };
  const t = d.traits ?? {};
  const out: PartTraits = { known: true };
  if (t.netName !== undefined) out.netName = t.netName;
  if (t.voltageSource) out.voltageSource = true;
  if (t.currentSource) out.currentSource = true;
  if (t.ammeter) out.ammeter = true;
  if (t.voltmeter) out.voltmeter = true;
  if (SWITCH_TYPES.has(type)) {
    out.shorts = (props: Record<string, PropValue>) => (isIdealShort(type, props) ? [[0, 1]] : []);
  } else if (t.shortWhenProp) {
    const key = t.shortWhenProp;
    out.shorts = (props: Record<string, PropValue>) => (props[key] === true ? [[0, 1]] : []);
  }
  return out;
}

export function createPartResolver(): PartResolver {
  const cache = new Map<string, PartTraits>();
  return {
    terminals(part) {
      const d = getDescriptor(part.type);
      return d ? terminalPositions(part, d) : [];
    },
    traits(type) {
      let t = cache.get(type);
      if (!t) {
        t = traitsFor(type);
        cache.set(type, t);
      }
      return t;
    },
  };
}
