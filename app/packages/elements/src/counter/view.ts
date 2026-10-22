import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { COUNTER_VARIANTS } from "./descriptor";

export const COUNTER_VIEWS: Record<string, ElementView> = Object.fromEntries(COUNTER_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
