import type { NetlistElement } from "@cs/model";
import type { ModelFactory } from "../api";
import { ChipModel, chipFactory } from "../chip-kit/model";
import { bool, str, type Props } from "../shared/props";
import { parseRomContents, ROM_BUS_SIZES, ROM_SIZES, romType } from "./descriptor";

/** CircuitJS1 ROMElm.doStep(): D = contents[A] while OE̅ is low, high impedance otherwise. */
class RomModel extends ChipModel {
  private data = new Map<number, number>();

  constructor(el: NetlistElement, private readonly ab: number, private readonly db: number) {
    super(el);
  }

  protected override applyProps(p: Props): void {
    this.data = parseRomContents(str(p, "contents", ""), bool(p, "hex", false));
  }

  protected execute(): void {
    const enabled = !this.v[0];
    const word = this.data.get(this.word(1, this.ab, true)) ?? 0;
    const first = 1 + this.ab;
    this.setWord(first, this.db, word, true);
    for (let i = 0; i < this.db; i++) this.z[first + i] = !enabled;
  }
}

export const ROM_MODELS: Record<string, ModelFactory> = Object.fromEntries([
  ...ROM_SIZES.map(([ab, db]) => [romType(ab, db), chipFactory(RomModel, ab, db)]),
  ...ROM_BUS_SIZES.map(([ab, db]) => [romType(ab, db, true), chipFactory(RomModel, ab, db)]),
]);
