// Print (FIL-12): a page with the title, the description, the schematic (as
// SVG, so it prints sharp) and the chart, laid out for paper. A print-only
// container is added for the duration of the print; the screen is untouched.

import type { AppController } from "../controller";
import { schematicSvg } from "./image";

export const PRINT_ID = "cs-print";

export const PRINT_CSS = `
#${PRINT_ID} { display: none; }
@media print {
  body > *:not(#${PRINT_ID}) { display: none !important; }
  #${PRINT_ID} { display: block; color: #000; background: #fff; font: 11pt system-ui, sans-serif; }
  #${PRINT_ID} h1 { font-size: 16pt; margin: 0 0 4pt; }
  #${PRINT_ID} .desc { margin: 0 0 8pt; white-space: pre-wrap; }
  #${PRINT_ID} .schematic svg { width: 100%; height: auto; max-height: 60vh; }
  #${PRINT_ID} .chart img { width: 100%; height: auto; margin-top: 8pt; page-break-inside: avoid; }
  @page { margin: 12mm; }
}`;

/** Build the print container's markup (exported for tests). */
export function printMarkup(title: string, description: string, svg: string, chartPng?: string): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!);
  return [
    `<h1>${esc(title || "Circuit")}</h1>`,
    description ? `<p class="desc">${esc(description)}</p>` : "",
    `<div class="schematic">${svg}</div>`,
    chartPng ? `<div class="chart"><img alt="Chart" src="${chartPng}"></div>` : "",
  ].join("\n");
}

export function printCircuit(c: AppController): void {
  const doc = c.edits.doc;
  // Print on white whatever the screen theme, with the light theme's ink.
  const svg = schematicSvg(c, { voltageColors: true });
  let chart: string | undefined;
  try {
    chart = c.chart?.element.toDataURL("image/png");
  } catch {
    chart = undefined; // tainted or unavailable canvas: print without it
  }
  let style = document.getElementById(`${PRINT_ID}-style`);
  if (!style) {
    style = document.createElement("style");
    style.id = `${PRINT_ID}-style`;
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
  }
  document.getElementById(PRINT_ID)?.remove();
  const box = document.createElement("div");
  box.id = PRINT_ID;
  box.innerHTML = printMarkup(doc.meta.title, doc.meta.description, svg, chart);
  document.body.appendChild(box);
  const done = () => {
    box.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
