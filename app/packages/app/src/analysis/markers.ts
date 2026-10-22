// Automatic Bode markers (ANL-11), found on the main thread from an AC result.

export interface BodePoint {
  freq: number;
  db: number;
  deg: number;
}

export interface BodeMarker {
  kind: "peak" | "cutoff" | "unity" | "phase";
  freq: number;
  /** Gain (dB) for gain markers, phase (degrees) for phase markers. */
  value: number;
  label: string;
}

/** Magnitude (dB) and unwrapped phase (degrees) per frequency. */
export function bodePoints(freqs: readonly number[], re: readonly number[], im: readonly number[]): BodePoint[] {
  const out: BodePoint[] = [];
  let prev: number | undefined;
  for (let i = 0; i < freqs.length; i++) {
    let deg = (Math.atan2(im[i], re[i]) * 180) / Math.PI;
    if (prev !== undefined && Number.isFinite(deg)) {
      while (deg - prev > 180) deg -= 360;
      while (deg - prev < -180) deg += 360;
    }
    if (Number.isFinite(deg)) prev = deg;
    out.push({ freq: freqs[i], db: 20 * Math.log10(Math.hypot(re[i], im[i])), deg });
  }
  return out;
}

/** Frequency where y crosses `level` between points i-1 and i, interpolated on log f. */
function cross(p: BodePoint[], i: number, y: (q: BodePoint) => number, level: number): number {
  const a = p[i - 1];
  const b = p[i];
  const u = (level - y(a)) / (y(b) - y(a));
  if (a.freq > 0 && b.freq > 0) return Math.exp(Math.log(a.freq) + u * (Math.log(b.freq) - Math.log(a.freq)));
  return a.freq + u * (b.freq - a.freq);
}

function crossings(p: BodePoint[], y: (q: BodePoint) => number, level: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < p.length; i++) {
    const ya = y(p[i - 1]) - level;
    const yb = y(p[i]) - level;
    if (Number.isFinite(ya) && Number.isFinite(yb) && ya !== yb && ya * yb <= 0 && !(ya === 0 && i > 1)) out.push(cross(p, i, y, level));
  }
  return out;
}

const fmtF = (f: number) => (f >= 1e6 ? `${(f / 1e6).toPrecision(3)} MHz` : f >= 1e3 ? `${(f / 1e3).toPrecision(3)} kHz` : `${f.toPrecision(3)} Hz`);

export function bodeMarkers(p: BodePoint[]): BodeMarker[] {
  const out: BodeMarker[] = [];
  const finite = p.filter((q) => Number.isFinite(q.db));
  if (finite.length < 2) return out;
  let peak = finite[0];
  for (const q of finite) if (q.db > peak.db) peak = q;
  const interior = peak !== finite[0] && peak !== finite[finite.length - 1];
  if (interior) out.push({ kind: "peak", freq: peak.freq, value: peak.db, label: `peak ${peak.db.toFixed(1)} dB at ${fmtF(peak.freq)}` });
  const ref = peak.db;
  const cut = crossings(p, (q) => q.db, ref - 3);
  for (const f of cut) out.push({ kind: "cutoff", freq: f, value: ref - 3, label: `−3 dB at ${fmtF(f)}` });
  if (cut.length >= 2) out.push({ kind: "cutoff", freq: Math.sqrt(cut[0] * cut[cut.length - 1]), value: ref - 3, label: `bandwidth ${fmtF(cut[cut.length - 1] - cut[0])}` });
  for (const f of crossings(p, (q) => q.db, 0)) out.push({ kind: "unity", freq: f, value: 0, label: `0 dB at ${fmtF(f)}` });
  for (const level of [-45, -90, -180]) {
    const fs = crossings(p, (q) => q.deg, level);
    if (fs.length) out.push({ kind: "phase", freq: fs[0], value: level, label: `${level}° at ${fmtF(fs[0])}` });
  }
  return out;
}
