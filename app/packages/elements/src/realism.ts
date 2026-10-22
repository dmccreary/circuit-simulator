// Pure helpers for realism and the symbol styles, shared by the worker and the
// main thread: ratings, heating, realistic defaults, color bands, and the
// optional raw-color graphics extension. No models or views.
export * from "./shared/ratings";
export * from "./shared/thermal";
export * from "./shared/realistic";
export * from "./shared/color-bands";
export { isRich, fillCss, strokeCss, type RichGraphics } from "./shared/graphics-ext";
export { LED_CSS } from "./shared/symbols-lifelike";
export { LED_FORWARD_VOLTAGE } from "./led/descriptor";
