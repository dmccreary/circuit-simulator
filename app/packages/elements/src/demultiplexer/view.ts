import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { DEMUX_VARIANTS } from "./descriptor";

export const DEMUX_VIEWS: Record<string, ElementView> = Object.fromEntries(DEMUX_VARIANTS.map((v) => [v.type, chipView(v.spec)]));
