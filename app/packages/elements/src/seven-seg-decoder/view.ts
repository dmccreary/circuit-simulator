import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { DECODER_VARIANTS } from "./descriptor";

export const DECODER_VIEWS: Record<string, ElementView> = Object.fromEntries(DECODER_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
