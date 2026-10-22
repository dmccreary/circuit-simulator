import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { ADC_VARIANTS } from "./descriptor";

export const ADC_VIEWS: Record<string, ElementView> = Object.fromEntries(ADC_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
