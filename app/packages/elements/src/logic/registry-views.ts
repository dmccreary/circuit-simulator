// Main-thread logic registry. Must not import models.
import type { ElementView } from "../api";
import { clockView } from "./clock/view";
import { dFlipFlopView } from "./d-flip-flop/view";
import { WIDE_GATE_INPUTS } from "./gates/geometry";
import { andGateView, nandGateView, norGateView, notGateView, orGateView, xorGateView } from "./gates/view";
import { logicInputView } from "./input/view";
import { jkFlipFlopView } from "./jk-flip-flop/view";
import { logicOutputView } from "./output/view";

export const LOGIC_VIEWS: Record<string, ElementView> = {
  "logic-input": logicInputView,
  "logic-output": logicOutputView,
  clock: clockView,
  "and-gate": andGateView,
  "or-gate": orGateView,
  "not-gate": notGateView,
  "nand-gate": nandGateView,
  "nor-gate": norGateView,
  "xor-gate": xorGateView,
  "d-flip-flop": dFlipFlopView,
  "jk-flip-flop": jkFlipFlopView,
  ...Object.fromEntries(
    WIDE_GATE_INPUTS.flatMap((n) => [
      [`and-gate-${n}`, andGateView],
      [`or-gate-${n}`, orGateView],
      [`nand-gate-${n}`, nandGateView],
      [`nor-gate-${n}`, norGateView],
    ]),
  ),
};
