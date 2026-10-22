// Chip families (CircuitJS1 ChipElm subclasses), one part type per size.
// Pure data: shared by the descriptor registry and the logic pin table.
import type { ChipVariant } from "../chip-kit/descriptor";
import { ADC_VARIANTS } from "../adc/descriptor";
import { COUNTER_VARIANTS } from "../counter/descriptor";
import { CUSTOM_LOGIC_VARIANTS } from "../custom-logic/descriptor";
import { DAC_VARIANTS } from "../dac/descriptor";
import { DEMUX_VARIANTS } from "../demultiplexer/descriptor";
import { ADDER_VARIANTS } from "../full-adder/descriptor";
import { LATCH_VARIANTS } from "../latch/descriptor";
import { LED_ARRAY_VARIANTS } from "../led-array/descriptor";
import { MUX_VARIANTS } from "../multiplexer/descriptor";
import { RING_COUNTER_VARIANTS } from "../ring-counter/descriptor";
import { ROM_VARIANTS } from "../rom/descriptor";
import { DECODER_VARIANTS } from "../seven-seg-decoder/descriptor";
import { TFF_VARIANTS } from "../t-flip-flop/descriptor";

export const CHIP_VARIANTS: readonly ChipVariant[] = [
  ...TFF_VARIANTS,
  ...LATCH_VARIANTS,
  ...COUNTER_VARIANTS,
  ...RING_COUNTER_VARIANTS,
  ...MUX_VARIANTS,
  ...DEMUX_VARIANTS,
  ...ADDER_VARIANTS,
  ...DECODER_VARIANTS,
  ...ROM_VARIANTS,
  ...CUSTOM_LOGIC_VARIANTS,
  ...DAC_VARIANTS,
  ...ADC_VARIANTS,
  ...LED_ARRAY_VARIANTS,
];
