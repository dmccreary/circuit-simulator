import type { ElementView } from "../api";
import { chipView } from "../chip-kit/view";
import { RING_COUNTER_VARIANTS } from "./descriptor";

export const RING_COUNTER_VIEWS: Record<string, ElementView> = Object.fromEntries(
  RING_COUNTER_VARIANTS.map((v) => [v.type, chipView(v.spec)]),
);
