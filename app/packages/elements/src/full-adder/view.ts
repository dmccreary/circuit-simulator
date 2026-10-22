import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { ADDER_VARIANTS } from "./descriptor";

export const ADDER_VIEWS: Record<string, ElementView> = Object.fromEntries(ADDER_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
