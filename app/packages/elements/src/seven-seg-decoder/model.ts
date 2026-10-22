import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { bool, type Props } from "../shared/props";
import { decoderType } from "./descriptor";

/** Segments a..g per hex digit, bit 6 = a (CircuitJS1 SevenSegDecoderElm.symbols). */
const SYMBOLS = [0x7e, 0x30, 0x6d, 0x79, 0x33, 0x5b, 0x5f, 0x70, 0x7f, 0x73, 0x77, 0x1f, 0x4e, 0x3d, 0x4f, 0x47];

/** CircuitJS1 SevenSegDecoderElm.execute(). */
class DecoderModel extends ChipModel {
  private blankOnF = false;

  constructor(el: NetlistElement, private readonly blank: boolean) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.blankOnF = bool(p, "blankOnF", false);
  }

  protected execute(): void {
    const input = this.word(7, 4, true);
    const off = (this.blank && !this.v[11]) || (input === 15 && this.blankOnF);
    for (let i = 0; i < 7; i++) this.v[i] = !off && ((SYMBOLS[input] >> (6 - i)) & 1) === 1;
  }
}

export const DECODER_MODELS: Record<string, ModelFactory> = Object.fromEntries(
  [false, true].map((b) => [decoderType(b), chipFactory(DecoderModel, b)]),
);
