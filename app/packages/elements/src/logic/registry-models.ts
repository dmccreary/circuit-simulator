// Worker-side logic registry. Must not import views.
import type { ModelFactory } from "../api";
import { clockModel } from "./clock/model";
import { dFlipFlopModel } from "./d-flip-flop/model";
import { andGateModel, nandGateModel, norGateModel, notGateModel, orGateModel, wideGateModels, xorGateModel } from "./gates/model";
import { WIDE_GATE_INPUTS } from "./gates/geometry";
import { logicInputModel } from "./input/model";
import { jkFlipFlopModel } from "./jk-flip-flop/model";
import { logicOutputModel } from "./output/model";

export const LOGIC_MODELS: Record<string, ModelFactory> = {
  "logic-input": logicInputModel,
  "logic-output": logicOutputModel,
  clock: clockModel,
  "and-gate": andGateModel,
  "or-gate": orGateModel,
  "not-gate": notGateModel,
  "nand-gate": nandGateModel,
  "nor-gate": norGateModel,
  "xor-gate": xorGateModel,
  "d-flip-flop": dFlipFlopModel,
  "jk-flip-flop": jkFlipFlopModel,
  ...wideGateModels(WIDE_GATE_INPUTS),
};
