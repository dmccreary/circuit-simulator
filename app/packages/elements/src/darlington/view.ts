import type { ElementView } from "../api";
import { npnView, pnpView } from "../bjt/view";
import { BJT_LENGTH } from "../bjt/descriptor";
import { stretchOf } from "../shared/stretch";
import { describePart, line } from "../shared/viewKit";

/** A transistor symbol with a doubled collector lead, as DarlingtonElm draws it. */
function darlingtonView(pnp: boolean): ElementView {
  const bjt = pnp ? pnpView : npnView;
  const s = pnp ? -1 : 1;
  return {
    ...bjt,
    drawSymbol(g, part, style) {
      bjt.drawSymbol(g, part, style);
      const e = stretchOf(part, BJT_LENGTH);
      line(g, BJT_LENGTH - 1 + e, -s * 0.15, BJT_LENGTH + e - 0.3, -s * 0.75);
    },
    describe: (part, live) => describePart(part, { key: "beta", unit: "", fallback: 100 }, live),
  };
}

export const npnDarlingtonView = darlingtonView(false);
export const pnpDarlingtonView = darlingtonView(true);
