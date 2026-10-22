import type { ColorToken } from "@cs/elements";

/** Every color the renderers use (CAN-15). Views name tokens, never raw colors. */
export interface Theme {
  name: "light" | "dark";
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

const probes = ["#e6194b", "#3c78d8", "#2e9e44", "#f58231", "#911eb4", "#00a3a3", "#c0399f", "#8a6d1f"];

export const lightTheme: Theme = {
  name: "light",
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

export function themeFor(dark: boolean): Theme {
  return dark ? darkTheme : lightTheme;
}

const mix = (a: number[], b: number[], t: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

/** Voltage color: red–gray–green through `range` volts either side of zero (ANI-12). */
export function voltageColor(theme: Theme, v: number, range: number): string {
  if (!Number.isFinite(v) || range <= 0) return mix(theme.voltZero, theme.voltZero, 0);
  const t = Math.max(-1, Math.min(1, v / range));
  return t >= 0 ? mix(theme.voltZero, theme.voltPos, t) : mix(theme.voltZero, theme.voltNeg, -t);
}
