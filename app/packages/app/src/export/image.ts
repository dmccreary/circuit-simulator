// Schematic export (FIL-11): SVG from the same views that draw the canvas
// (render/svg-graphics-export.ts), and PNG by rasterizing that SVG.

import type { Box } from "@cs/elements";
import { getDescriptor, localToDocument, terminalPositions } from "@cs/elements";
import { getView } from "@cs/elements/views";
import { schematicToSvg, type ElementAccess } from "@cs/render";
import type { AppController } from "../controller";

const elementAccess: ElementAccess = { getView, getDescriptor, terminalPositions, localToDocument };

export interface ExportOptions {
  /** Only what is visible now, instead of the whole circuit fitted. */
  currentView?: boolean;
  /** Color wires by the latest voltages (default: when there is a display state). */
  voltageColors?: boolean;
  values?: boolean;
}

export function schematicSvg(c: AppController, opts: ExportOptions = {}): string {
  const r = c.schematic;
  const area: Box | undefined = opts.currentView && r ? r.view.visibleBox() : undefined;
  const display = opts.voltageColors === false ? undefined : r?.displayState;
  return schematicToSvg(c.edits.doc, elementAccess, c.theme(), {
    style: r?.symbolStyle ?? "ansi",
    display,
    compiled: c.compiled,
    values: opts.values,
    area,
    padding: area ? 0 : 2,
  });
}

/** Rasterize an SVG document to PNG at `scale` × its own pixel size. */
export function svgToPng(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2-D canvas"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("the SVG could not be drawn"));
    };
    img.src = url;
  });
}

/** Offer a file to the student as a download. */
export function download(data: Blob, name: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "My circuit" → "my-circuit". */
export function fileBase(title: string): string {
  return (title || "circuit").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "circuit";
}
