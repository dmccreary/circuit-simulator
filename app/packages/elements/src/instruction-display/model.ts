import type { ModelFactory } from "../api";
import { SensingModel } from "../shared/sensingModel";
import { INSTRUCTION_DISPLAY_WIDTHS, instructionDisplayType } from "./descriptor";

export const INSTRUCTION_DISPLAY_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  INSTRUCTION_DISPLAY_WIDTHS.map((w) => [instructionDisplayType(w), (el) => new SensingModel(el)]),
);
