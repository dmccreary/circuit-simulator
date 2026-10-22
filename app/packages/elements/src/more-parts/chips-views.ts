// Main-thread registry of the chip families. Must not import models.
import type { ElementView } from "../api";
import { ADC_VIEWS } from "../adc/view";
import { BUS_INPUT_VIEWS } from "../bus-input/view";
import { INSTRUCTION_DISPLAY_VIEWS } from "../instruction-display/view";
import { COUNTER_VIEWS } from "../counter/view";
import { CUSTOM_LOGIC_VIEWS } from "../custom-logic/view";
import { DAC_VIEWS } from "../dac/view";
import { DEMUX_VIEWS } from "../demultiplexer/view";
import { ADDER_VIEWS } from "../full-adder/view";
import { LATCH_VIEWS } from "../latch/view";
import { LED_ARRAY_VIEWS } from "../led-array/view";
import { MUX_VIEWS } from "../multiplexer/view";
import { RING_COUNTER_VIEWS } from "../ring-counter/view";
import { ROM_VIEWS } from "../rom/view";
import { DECODER_VIEWS } from "../seven-seg-decoder/view";
import { TFF_VIEWS } from "../t-flip-flop/view";

export const CHIP_VIEWS: Record<string, ElementView> = {
  ...TFF_VIEWS,
  ...LATCH_VIEWS,
  ...COUNTER_VIEWS,
  ...RING_COUNTER_VIEWS,
  ...MUX_VIEWS,
  ...DEMUX_VIEWS,
  ...ADDER_VIEWS,
  ...DECODER_VIEWS,
  ...ROM_VIEWS,
  ...CUSTOM_LOGIC_VIEWS,
  ...DAC_VIEWS,
  ...ADC_VIEWS,
  ...LED_ARRAY_VIEWS,
  ...BUS_INPUT_VIEWS,
  ...INSTRUCTION_DISPLAY_VIEWS,
};
