import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { DAC_VARIANTS } from "./descriptor";

export const DAC_VIEWS: Record<string, ElementView> = Object.fromEntries(DAC_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
