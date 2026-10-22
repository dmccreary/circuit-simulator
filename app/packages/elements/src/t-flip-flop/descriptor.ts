import { chipVariant, DIGITAL_CHIP_PROPS, type ChipVariant } from "../chip-kit/descriptor";
import type { ChipPin, ChipSpec } from "../chip-kit/layout";

export type TffPins = "plain" | "reset" | "set-reset";
export const TFF_FORMS: readonly TffPins[] = ["plain", "reset", "set-reset"];

/**
 * CircuitJS1 TFlipFlopElm: T and the clock on the left, Q and Q̄ on the right;
 * FLAG_RESET adds R below the clock, FLAG_SET puts S there and R under Q̄.
 */
export function tffSpec(form: TffPins): ChipSpec {
  const set = form === "set-reset";
  const pins: ChipPin[] = [
    { name: "T", side: "W", pos: 0, dir: "in" },
    { name: "Q", side: "E", pos: 0, dir: "out" },
    { name: "Q", side: "E", pos: set ? 1 : 2, dir: "out", bar: true },
    { name: "", side: "W", pos: 1, dir: "in", clock: true },
  ];
  if (form === "reset") pins.push({ name: "R", side: "W", pos: 2, dir: "in" });
  if (set) pins.push({ name: "R", side: "E", pos: 2, dir: "in" }, { name: "S", side: "W", pos: 2, dir: "in" });
  return { title: "", sizeX: 2, sizeY: 3, pins };
}

export const tffType = (form: TffPins) => (form === "plain" ? "t-flip-flop" : form === "reset" ? "t-flip-flop-r" : "t-flip-flop-sr");

export const TFF_VARIANTS: ChipVariant[] = TFF_FORMS.map((f) =>
  chipVariant(tffType(f), tffSpec(f), {
    aliases: ["t flip-flop", "t flip flop", "toggle flip-flop", "tff"],
    props: DIGITAL_CHIP_PROPS,
    readouts: [{ key: "q", unit: "" }],
  }),
);
