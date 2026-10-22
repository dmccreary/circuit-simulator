import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { LATCH_VARIANTS } from "./descriptor";

export const LATCH_VIEWS: Record<string, ElementView> = Object.fromEntries(LATCH_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
