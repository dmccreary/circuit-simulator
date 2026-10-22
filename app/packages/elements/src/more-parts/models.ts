// Worker-side registry for the parts in ./descriptors.ts. Must not import views.
import type { ModelFactory } from "../api";
import { analogSwitch2Model, analogSwitchModel } from "../analog-switch/model";
import { currentConveyorModel } from "../current-conveyor/model";
import { expressionSourceModel } from "../expression-source/model";
import { memristorModel } from "../memristor/model";
import { numberDisplayModel } from "../number-display/model";
import { sevenSegmentModel } from "../seven-segment/model";
import { railModel } from "../rail/model";
import { RELAY_POLES } from "../relay/descriptor";
import { relayModel } from "../relay/model";
import { spdtSwitchModel } from "../spdt-switch/model";
import { timer555Model } from "../timer-555/model";
import { transmissionLineModel } from "../transmission-line/model";
import { voltageReadoutModel } from "../voltage-readout/model";
import { waveformSourceModel } from "../waveform-source/model";

export const MORE_MODELS: Record<string, ModelFactory> = {
  rail: railModel,
  "waveform-source": waveformSourceModel,
  "voltage-readout": voltageReadoutModel,
  "spdt-switch": spdtSwitchModel,
  "analog-switch": analogSwitchModel,
  "analog-switch-2": analogSwitch2Model,
  ...Object.fromEntries(RELAY_POLES.map((n) => [n === 1 ? "relay" : `relay-${n}`, relayModel])),
  "timer-555": timer555Model,
  memristor: memristorModel,
  "transmission-line": transmissionLineModel,
  "current-conveyor": currentConveyorModel,
  "expression-source": expressionSourceModel,
  "seven-segment": sevenSegmentModel,
  "number-display": numberDisplayModel,
};
