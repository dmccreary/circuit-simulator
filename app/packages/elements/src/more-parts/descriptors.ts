// Parts added for Falstad compatibility (rails, readouts, switches, chips...).
// Pure data: no models or views. Spread into the main registries.
import type { ElementDescriptor } from "../api";
import { analogSwitch2Descriptor, analogSwitchDescriptor } from "../analog-switch/descriptor";
import { currentConveyorDescriptor } from "../current-conveyor/descriptor";
import { expressionSourceDescriptor } from "../expression-source/descriptor";
import { memristorDescriptor } from "../memristor/descriptor";
import { numberDisplayDescriptor } from "../number-display/descriptor";
import { sevenSegmentDescriptor } from "../seven-segment/descriptor";
import { railDescriptor } from "../rail/descriptor";
import { RELAY_DESCRIPTORS } from "../relay/descriptor";
import { spdtSwitchDescriptor } from "../spdt-switch/descriptor";
import { timer555Descriptor } from "../timer-555/descriptor";
import { transmissionLineDescriptor } from "../transmission-line/descriptor";
import { voltageReadoutDescriptor } from "../voltage-readout/descriptor";
import { waveformSourceDescriptor } from "../waveform-source/descriptor";

export const MORE_DESCRIPTORS: readonly ElementDescriptor[] = [
  railDescriptor,
  waveformSourceDescriptor,
  voltageReadoutDescriptor,
  spdtSwitchDescriptor,
  analogSwitchDescriptor,
  analogSwitch2Descriptor,
  ...RELAY_DESCRIPTORS,
  timer555Descriptor,
  memristorDescriptor,
  transmissionLineDescriptor,
  currentConveyorDescriptor,
  expressionSourceDescriptor,
  sevenSegmentDescriptor,
  numberDisplayDescriptor,
];
