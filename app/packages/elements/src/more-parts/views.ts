// Main-thread registry for the parts in ./descriptors.ts. Must not import models.
import type { ElementView } from "../api";
import { analogSwitch2View, analogSwitchView } from "../analog-switch/view";
import { currentConveyorView } from "../current-conveyor/view";
import { expressionSourceView } from "../expression-source/view";
import { memristorView } from "../memristor/view";
import { numberDisplayView } from "../number-display/view";
import { sevenSegmentView } from "../seven-segment/view";
import { railView } from "../rail/view";
import { RELAY_POLES } from "../relay/descriptor";
import { relayView } from "../relay/view";
import { spdtSwitchView } from "../spdt-switch/view";
import { timer555View } from "../timer-555/view";
import { transmissionLineView } from "../transmission-line/view";
import { voltageReadoutView } from "../voltage-readout/view";
import { waveformSourceView } from "../waveform-source/view";

export const MORE_VIEWS: Record<string, ElementView> = {
  rail: railView,
  "waveform-source": waveformSourceView,
  "voltage-readout": voltageReadoutView,
  "spdt-switch": spdtSwitchView,
  "analog-switch": analogSwitchView,
  "analog-switch-2": analogSwitch2View,
  ...Object.fromEntries(RELAY_POLES.map((n) => [n === 1 ? "relay" : `relay-${n}`, relayView])),
  "timer-555": timer555View,
  memristor: memristorView,
  "transmission-line": transmissionLineView,
  "current-conveyor": currentConveyorView,
  "expression-source": expressionSourceView,
  "seven-segment": sevenSegmentView,
  "number-display": numberDisplayView,
};
