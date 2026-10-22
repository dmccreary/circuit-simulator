// Logic descriptors in palette order. Pure data: no models or views.
import type { ElementDescriptor } from "../api";
import { clockDescriptor } from "./clock/descriptor";
import { dFlipFlopDescriptor } from "./d-flip-flop/descriptor";
import {
  andGateDescriptor,
  nandGateDescriptor,
  norGateDescriptor,
  notGateDescriptor,
  orGateDescriptor,
  xorGateDescriptor,
  WIDE_GATE_DESCRIPTORS,
} from "./gates/descriptor";
import { logicInputDescriptor } from "./input/descriptor";
import { jkFlipFlopDescriptor } from "./jk-flip-flop/descriptor";
import { logicOutputDescriptor } from "./output/descriptor";

export const LOGIC_DESCRIPTORS: readonly ElementDescriptor[] = [
  logicInputDescriptor,
  logicOutputDescriptor,
  clockDescriptor,
  andGateDescriptor,
  orGateDescriptor,
  notGateDescriptor,
  nandGateDescriptor,
  norGateDescriptor,
  xorGateDescriptor,
  dFlipFlopDescriptor,
  jkFlipFlopDescriptor,
  ...WIDE_GATE_DESCRIPTORS,
];
