// Main-thread registry for ./analog2-descriptors.ts. Must not import models.
import type { ElementView } from "../api";
import { antennaView } from "../antenna/view";
import { crystalView } from "../crystal/view";
import { diacView } from "../diac/view";
import { polarCapacitorView } from "../polar-capacitor/view";
import { scrView } from "../scr/view";
import { sparkGapView } from "../spark-gap/view";
import { triacView } from "../triac/view";
import { triodeView } from "../triode/view";
import { tunnelDiodeView } from "../tunnel-diode/view";
import { unijunctionView } from "../unijunction/view";
import { varactorView } from "../varactor/view";

export const ANALOG2_VIEWS: Record<string, ElementView> = {
  "tunnel-diode": tunnelDiodeView,
  varactor: varactorView,
  "polar-capacitor": polarCapacitorView,
  "spark-gap": sparkGapView,
  crystal: crystalView,
  scr: scrView,
  triac: triacView,
  diac: diacView,
  triode: triodeView,
  unijunction: unijunctionView,
  antenna: antennaView,
};
