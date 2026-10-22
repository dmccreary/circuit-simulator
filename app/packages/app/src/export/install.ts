// Export and print commands (FIL-11, FIL-12), hooked onto a controller with
// one call from its constructor. The ids start with "view." so every embed
// mode may export and print (embed/capabilities.ts); they sit in the File menu.

import type { AppController } from "../controller";
import { t } from "../messages";
import { download, fileBase, schematicSvg, svgToPng } from "./image";
import { printCircuit } from "./print";

const report = (c: AppController, e: unknown) =>
  c.store.set({ workerError: t({ key: "export.failed", values: { reason: (e as Error)?.message ?? String(e) } }) });

export function installExport(c: AppController): void {
  const r = c.commands;
  r.register({
    id: "view.exportSvg",
    label: { key: "cmd.exportSvg" },
    run: (ctl) => {
      try {
        download(new Blob([schematicSvg(ctl)], { type: "image/svg+xml" }), `${fileBase(ctl.edits.doc.meta.title)}.svg`);
      } catch (e) {
        report(ctl, e);
      }
    },
  });
  r.register({
    id: "view.exportPng",
    label: { key: "cmd.exportPng" },
    run: async (ctl) => {
      try {
        download(await svgToPng(schematicSvg(ctl), 2), `${fileBase(ctl.edits.doc.meta.title)}.png`);
      } catch (e) {
        report(ctl, e);
      }
    },
  });
  r.register({
    id: "view.print",
    label: { key: "cmd.print" },
    defaultKeys: ["Mod+P"],
    run: (ctl) => {
      try {
        printCircuit(ctl);
      } catch (e) {
        report(ctl, e);
      }
    },
  });
}
