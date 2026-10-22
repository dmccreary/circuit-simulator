import type { Netlist, PropValue } from "@cs/model";
import type { ParamRef } from "./types";

export interface PropOverride extends ParamRef {
  value: PropValue;
}

/** A copy of the netlist with some element props replaced (the original is untouched). */
export function withProps(netlist: Netlist, overrides: readonly PropOverride[]): Netlist {
  return {
    ...netlist,
    nodeNames: netlist.nodeNames.slice(),
    settings: { ...netlist.settings },
    elements: netlist.elements.map((el) => {
      const mine = overrides.filter((o) => o.element === el.id);
      if (mine.length === 0) return { ...el, nodes: el.nodes.slice(), props: { ...el.props } };
      const props = { ...el.props };
      for (const o of mine) props[o.key] = o.value;
      return { ...el, nodes: el.nodes.slice(), props };
    }),
  };
}
