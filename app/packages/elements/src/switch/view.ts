import type { Part } from "@cs/model";
import type { ControlRegion, SymbolGraphics } from "../api";
import { isClosed } from "../shared/switchState";
import { centreBox, circle, leads, line, twoTerminalView } from "../shared/viewKit";

function drawSwitch(g: SymbolGraphics, part: Part): void {
  const c = leads(g, part, 1);
  circle(g, c - 1, 0, 0.12);
  circle(g, c + 1, 0, 0.12);
  if (isClosed(part.type, part.props)) line(g, c - 1, 0, c + 1, 0);
  else line(g, c - 1, 0, c + 0.85, -0.8);
}

export function switchState(part: Part): "open" | "closed" {
  return isClosed(part.type, part.props) ? "closed" : "open";
}

export const switchView = twoTerminalView(drawSwitch, undefined, {
  controls: (part): ControlRegion[] => [{ id: "toggle", shape: centreBox(part, 1.2, 1.1) }],
  describe: (part) => ({ key: "element.switch.describe", values: { label: part.label, state: switchState(part) } }),
});
