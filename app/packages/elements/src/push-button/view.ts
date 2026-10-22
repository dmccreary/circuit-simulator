import type { Part } from "@cs/model";
import type { ControlRegion, SymbolGraphics } from "../api";
import { isClosed } from "../shared/switchState";
import { switchState } from "../switch/view";
import { centreBox, circle, leads, line, twoTerminalView } from "../shared/viewKit";

/** Two contacts with a bridging bar on a plunger; the bar touches the contacts when closed. */
function drawButton(g: SymbolGraphics, part: Part): void {
  const c = leads(g, part, 1);
  circle(g, c - 1, 0, 0.12);
  circle(g, c + 1, 0, 0.12);
  const y = isClosed(part.type, part.props) ? -0.15 : -0.6;
  line(g, c - 1.1, y, c + 1.1, y);
  line(g, c, y, c, y - 0.6);
  line(g, c - 0.35, y - 0.6, c + 0.35, y - 0.6);
}

export const pushButtonView = twoTerminalView(drawButton, undefined, {
  controls: (part): ControlRegion[] => [{ id: "press", shape: centreBox(part, 1.2, 1.4) }],
  describe: (part) => ({ key: "element.push-button.describe", values: { label: part.label, state: switchState(part) } }),
});
