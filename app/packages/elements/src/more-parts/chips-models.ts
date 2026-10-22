// Worker-side registry of the chip families. Must not import views.
import type { ModelFactory } from "../api";
import { ADC_MODELS } from "../adc/model";
import { BUS_INPUT_MODELS } from "../bus-input/model";
import { INSTRUCTION_DISPLAY_MODELS } from "../instruction-display/model";
import { COUNTER_MODELS } from "../counter/model";
import { CUSTOM_LOGIC_MODELS } from "../custom-logic/model";
import { DAC_MODELS } from "../dac/model";
import { DEMUX_MODELS } from "../demultiplexer/model";
import { ADDER_MODELS } from "../full-adder/model";
import { LATCH_MODELS } from "../latch/model";
import { LED_ARRAY_MODELS } from "../led-array/model";
import { MUX_MODELS } from "../multiplexer/model";
import { RING_COUNTER_MODELS } from "../ring-counter/model";
import { ROM_MODELS } from "../rom/model";
import { DECODER_MODELS } from "../seven-seg-decoder/model";
import { TFF_MODELS } from "../t-flip-flop/model";

export const CHIP_MODELS: Record<string, ModelFactory> = {
  ...TFF_MODELS,
  ...LATCH_MODELS,
  ...COUNTER_MODELS,
  ...RING_COUNTER_MODELS,
  ...MUX_MODELS,
  ...DEMUX_MODELS,
  ...ADDER_MODELS,
  ...DECODER_MODELS,
  ...ROM_MODELS,
  ...CUSTOM_LOGIC_MODELS,
  ...DAC_MODELS,
  ...ADC_MODELS,
  ...LED_ARRAY_MODELS,
  ...BUS_INPUT_MODELS,
  ...INSTRUCTION_DISPLAY_MODELS,
};
