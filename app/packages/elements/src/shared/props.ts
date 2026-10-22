import type { PropValue } from "@cs/model";

export type Props = Record<string, PropValue>;

export function num(props: Props, key: string, fallback: number): number {
  const v = props[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) return n;
  }
  return fallback;
}

export function bool(props: Props, key: string, fallback: boolean): boolean {
  const v = props[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

export function str(props: Props, key: string, fallback: string): string {
  const v = props[key];
  return typeof v === "string" ? v : fallback;
}

/** Smallest resistance a model will stamp, to keep the matrix finite (CMP-06 lower bound). */
export const R_MIN = 1e-6;
/** Resistance of an open contact. */
export const R_OPEN = 1e12;
