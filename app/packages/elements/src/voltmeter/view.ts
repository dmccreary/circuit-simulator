import { drawMeter } from "../ammeter/view";
import { twoTerminalView } from "../shared/viewKit";

export const voltmeterView = twoTerminalView(drawMeter("V"));
