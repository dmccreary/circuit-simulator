// The "advanced" part group: analog parts beyond Essentials (controlled
// sources, transformer, zener, transistors, op-amp). Pure data: no models or
// views. Loaded lazily with its models and views (circuit-model.md §5.4);
// see ../descriptors.ts for how groups work.
import type { ElementDescriptor } from "../api";
import { npnDescriptor, pnpDescriptor } from "../bjt/descriptor";
import { cccsDescriptor, ccvsDescriptor, vccsDescriptor, vcvsDescriptor } from "../controlled-source/descriptor";
import { nMosfetDescriptor, pMosfetDescriptor } from "../mosfet/descriptor";
import { opAmpDescriptor } from "../op-amp/descriptor";
import { transformerDescriptor } from "../transformer/descriptor";
import { zenerDiodeDescriptor } from "../zener-diode/descriptor";

/** In palette order. */
export const ADVANCED_DESCRIPTORS: readonly ElementDescriptor[] = [
  vcvsDescriptor,
  vccsDescriptor,
  ccvsDescriptor,
  cccsDescriptor,
  transformerDescriptor,
  zenerDiodeDescriptor,
  npnDescriptor,
  pnpDescriptor,
  nMosfetDescriptor,
  pMosfetDescriptor,
  opAmpDescriptor,
];
