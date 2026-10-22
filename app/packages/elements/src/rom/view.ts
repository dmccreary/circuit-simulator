import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { ROM_VARIANTS } from "./descriptor";

export const ROM_VIEWS: Record<string, ElementView> = Object.fromEntries(ROM_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
