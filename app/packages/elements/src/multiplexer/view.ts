import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { MUX_VARIANTS } from "./descriptor";

export const MUX_VIEWS: Record<string, ElementView> = Object.fromEntries(MUX_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
