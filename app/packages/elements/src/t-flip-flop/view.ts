import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { TFF_VARIANTS } from "./descriptor";

export const TFF_VIEWS: Record<string, ElementView> = Object.fromEntries(TFF_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
