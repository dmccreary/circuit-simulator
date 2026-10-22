import type { ColorToken } from "@cs/elements";

export type ThemeName = "light" | "dark" | "high-contrast";

/** Interface colors, published to CSS as custom properties so panels and canvases agree (ACC-11/12). */
export interface UiTokens {
  bg: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  focus: string;
}

/** Every color the renderers use (CAN-15). Views name tokens, never raw colors. */
export interface Theme {
  name: ThemeName;
  ui: UiTokens;
  /** Keyboard focus ring on the canvas (ACC-03). */
  focus: string;
  tokens: Record<ColorToken, string>;
  grid: string;
  selection: string;
  hover: string;
  preview: string;
  junction: string;
  dot: string;
  /** Voltage scale end points: negative, zero, positive (ANI-12). */
  voltNeg: [number, number, number];
  voltZero: [number, number, number];
  voltPos: [number, number, number];
  probes: string[];
  chart: { background: string; axis: string; gridline: string; text: string; playhead: string; laneBorder: string };
  font: string;
}

/**
 * Probe colors after Okabe & Ito (2008): distinguishable with the common
 * forms of color blindness, in an order that keeps neighbours far apart.
 */
const probes = ["#0072b2", "#d55e00", "#009e73", "#cc79a7", "#e69f00", "#56b4e9", "#1d2430", "#8a6d1f"];
const probesOnDark = ["#56b4e9", "#e69f00", "#2fc79a", "#e397c4", "#f0e442", "#4d9de0", "#e6e6e6", "#d55e00"];

export const lightTheme: Theme = {
  name: "light",
  ui: {
    bg: "#f4f6f9",
    panel: "#ffffff",
    border: "#d5dae1",
    text: "#1d2430",
    muted: "#5a6372",
    accent: "#1565c0",
    accentText: "#ffffff",
    danger: "#c62828",
    focus: "#1565c0",
  },
  focus: "#7b1fa2",
  tokens: {
    symbol: "#1d2430",
    "symbol.selected": "#1565c0",
    label: "#3b4452",
    value: "#5a6372",
    wire: "#3b4452",
    terminal: "#1d2430",
    glow: "#ffcc33",
    "charge.plus": "#d32f2f",
    "charge.minus": "#1976d2",
    background: "#ffffff",
  },
  grid: "#c9ced6",
  selection: "#1e88e5",
  hover: "#ff9800",
  preview: "#1e88e5",
  junction: "#1d2430",
  dot: "#f5b800",
  voltNeg: [211, 47, 47],
  voltZero: [128, 134, 142],
  voltPos: [46, 158, 68],
  probes,
  chart: {
    background: "#ffffff",
    axis: "#5a6372",
    gridline: "#e6e9ee",
    text: "#3b4452",
    playhead: "#1e88e5",
    laneBorder: "#d5dae1",
  },
  font: "system-ui, -apple-system, Segoe UI, sans-serif",
};

export const darkTheme: Theme = {
  ...lightTheme,
  name: "dark",
  ui: {
    bg: "#0f1216",
    panel: "#161a20",
    border: "#2c333d",
    text: "#d8dee9",
    muted: "#9aa4b2",
    accent: "#64b5f6",
    accentText: "#0f1216",
    danger: "#ef5350",
    focus: "#64b5f6",
  },
  focus: "#ce93d8",
  probes: probesOnDark,
  tokens: {
    symbol: "#d8dee9",
    "symbol.selected": "#64b5f6",
    label: "#b6bfcc",
    value: "#9aa4b2",
    wire: "#b6bfcc",
    terminal: "#d8dee9",
    glow: "#ffd54f",
    "charge.plus": "#ef5350",
    "charge.minus": "#42a5f5",
    background: "#161a20",
  },
  grid: "#353c47",
  junction: "#d8dee9",
  dot: "#ffd54f",
  voltNeg: [239, 83, 80],
  voltZero: [120, 128, 140],
  voltPos: [102, 187, 106],
  chart: {
    background: "#161a20",
    axis: "#9aa4b2",
    gridline: "#262c35",
    text: "#b6bfcc",
    playhead: "#64b5f6",
    laneBorder: "#2c333d",
  },
};

/** Black ground, white ink, saturated accents; contrast ≥ 7:1 for text (ACC-12). */
export const highContrastTheme: Theme = {
  name: "high-contrast",
  ui: {
    bg: "#000000",
    panel: "#000000",
    border: "#ffffff",
    text: "#ffffff",
    muted: "#e0e0e0",
    accent: "#ffff00",
    accentText: "#000000",
    danger: "#ff6e6e",
    focus: "#00ffff",
  },
  focus: "#00ffff",
  tokens: {
    symbol: "#ffffff",
    "symbol.selected": "#ffff00",
    label: "#ffffff",
    value: "#e0e0e0",
    wire: "#ffffff",
    terminal: "#ffffff",
    glow: "#ffff00",
    "charge.plus": "#ff6e6e",
    "charge.minus": "#6ec6ff",
    background: "#000000",
  },
  grid: "#5c5c5c",
  selection: "#ffff00",
  hover: "#00ffff",
  preview: "#00ffff",
  junction: "#ffffff",
  dot: "#ffff00",
  // Blue–gray–orange rather than red–green, so the scale survives color blindness.
  voltNeg: [77, 166, 255],
  voltZero: [160, 160, 160],
  voltPos: [255, 160, 0],
  probes: ["#ffff00", "#00ffff", "#ff80ff", "#80ff80", "#ffa040", "#ffffff", "#8080ff", "#ff6e6e"],
  chart: {
    background: "#000000",
    axis: "#ffffff",
    gridline: "#404040",
    text: "#ffffff",
    playhead: "#00ffff",
    laneBorder: "#ffffff",
  },
  font: lightTheme.font,
};

export const THEMES: Record<ThemeName, Theme> = { light: lightTheme, dark: darkTheme, "high-contrast": highContrastTheme };

/** `themeFor(true)` is dark, `themeFor(false)` light; a name picks any theme. */
export function themeFor(dark: boolean | ThemeName): Theme {
  if (typeof dark === "string") return THEMES[dark] ?? lightTheme;
  return dark ? darkTheme : lightTheme;
}

/** The UI tokens as CSS custom properties ("--bg", "--accent-text", ...). */
export function themeCssVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.ui)) out[`--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = v;
  return out;
}

const mix = (a: number[], b: number[], t: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/** Voltage color: red–gray–green through `range` volts either side of zero (ANI-12). */
export function voltageColor(theme: Theme, v: number, range: number): string {
  if (!Number.isFinite(v) || range <= 0) return mix(theme.voltZero, theme.voltZero, 0);
  const t = Math.max(-1, Math.min(1, v / range));
  return t >= 0 ? mix(theme.voltZero, theme.voltPos, t) : mix(theme.voltZero, theme.voltNeg, -t);
}
