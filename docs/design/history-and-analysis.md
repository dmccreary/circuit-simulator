---
title: History and Analyses Design
description: Design of the trace history store, scrubbing through time, chart measurements and math traces, and the analysis service for DC, frequency response, sweeps, and spectra.
---

# History and Analyses

This page covers what happens to results after the engine produces them:
how traces are stored, how the student moves back through time, how
measurements are computed, and how the analysis views (Section 14) run
without disturbing the live simulation.

## 1. Where each kind of result lives

| Data | Where | Precision | How long |
|---|---|---|---|
| Probed traces (and math traces) | History Store, main thread | Times `Float64`, values `Float32` | At least 100,000 samples per trace (PRF-04); default 500,000 |
| Full circuit state for scrubbing | State ring, live worker ([Engine §7.4](simulation-engine.md#74-the-full-state-history-ring)) | `Float32` | The most recent 20,000 steps (CHT-23) |
| Ghost copies | History Store | Shared with the trace they copy | Up to eight per trace (CHT-17) |
| Event markers | History Store event log | — | As long as the trace history |
| Energy totals (PRB-20) | Engine, accumulated each step | `Float64` | Since reset |
| Analysis results | Analysis Service results cache | `Float64` | Until the circuit changes, then kept as one ghost (ANL-12) |

Single precision is enough for drawing and for every chart measurement
at the tolerances in Section 26 (about seven significant digits). The two
quantities where rounding would accumulate over many steps — energy
totals and running integrals — are computed in double precision.

## 2. The history store

```ts
interface HistoryStore {
  /** Append one frame's samples (called by the Frame Bus). */
  append(frame: Frame): void;

  /** A read-only view of a trace between two times, with its level-of-detail index. */
  view(trace: TraceId, t0: number, t1: number): TraceView;

  /** Keep a copy of the visible or full trace as a ghost (CHT-17). Cheap: shares storage. */
  keepGhost(trace: TraceId, label: MessageRef): GhostId;

  /** Events for markers on the time axis (CHT-24). */
  events(t0: number, t1: number): SimEvent[];

  /** Discard history after a time (Restart from here, CHT-22) or all of it (Reset, SIM-03). */
  truncateAfter(t: number): void;
  clear(): void;
}
```

### 2.1 Storage layout

All channels in a run share one **time column**, because the engine
reports every channel at every step. Each column is stored as a list of
fixed-size **chunks** of 4,096 samples. A chunk is mutable only while it
is the newest; once full it never changes. That gives three cheap
operations:

- **Appending** writes into the newest chunk.
- **Ghosts** keep references to existing chunks rather than copying them.
- **Dropping old history** frees whole chunks from the front.

### 2.2 The summary pyramid

Alongside each value column, the store keeps a pyramid of block
summaries. Every block of 64 samples records its **minimum, maximum,
sum, and sum of squares**; every 64 blocks are summarized again, and so
on. The pyramid serves two clients:

- the **Chart Renderer** draws each pixel column from the minimum and
  maximum at the right level, so spikes never disappear and drawing cost
  depends on chart width, not sample count
  ([Rendering §5.3](rendering.md#53-drawing-a-trace-fast));
- the **Measurement Library** computes minimum, maximum, peak-to-peak,
  average, and RMS over any span from a handful of summaries plus the
  raw samples at the two ends, so live measurements on a 500,000-sample
  trace cost microseconds (CHT-30).

Because time steps vary, sums used for averages are time-weighted (each
sample weighted by its step), so an average is a true time average and
not biased toward moments where the step was small.

### 2.3 Memory budget

At the default limit of 500,000 samples per trace, 16 probes use about
36 MB (32 MB of values plus 4 MB for the shared time column). When a trace passes its limit, the oldest chunks are dropped
but their pyramid summaries are kept, so the chart can still draw the
distant past at coarse detail. This is the answer proposed to
[Rendering open question 1](rendering.md#6-open-questions); the author
may prefer old history to drop off entirely.

## 3. Moving through time

Scrubbing (CHT-22) touches every component, so it follows one path:

1. The student drags the playhead or presses an arrow key. The chart sets
   `ChartModel.playhead = t`.
2. The app sends `getStateAt(t)` to the live worker. The reply arrives
   within a frame and is published on the Frame Bus as a **historical
   frame**, marked with its time.
3. Every subscriber treats a historical frame exactly like a live one:
   wire colors, dots, lamp brightness, charge marks, switch positions,
   hover cards, pinned meters, and the Loop and Junction tools all show
   that moment (PRN-04).
4. If `t` is older than the state ring, the reply is "not available".
   The chart still moves its readouts, and the schematic shows "Circuit
   history not available this far back" (CHT-23).
5. **Run** resumes from the latest moment. **Restart from here** sends
   `restartFrom(t)`; the worker restores the state at `t`, and the History
   Store truncates everything after `t`.

## 4. Measurements and math traces

### 4.1 The measurement library

Measurements are **pure functions** over a `TraceView` and a span, in
their own package with no knowledge of the chart. The chart's
measurement table, the cursor readouts, the multimeter's AC and DC
readings, lesson checks (LES-06), and the parameter sweep's "measurement
versus parameter" (ANL-18) all call the same functions.

```ts
interface Measurement<R> {
  id: MeasurementId;                      // "rms", "rise-time", "time-constant", ...
  needs: "any" | "periodic" | "step";     // CHT-31
  compute(v: TraceView, span: Span, opts: Options): Result<R>;
}

type Result<R> =
  | { ok: true; value: R; provenance: MessageRef }   // CHT-32: "RMS over 3 whole periods from ..."
  | { ok: false; reason: MessageRef };               // "fewer than two periods visible"
```

| Group | Method |
|---|---|
| Value, minimum, maximum, peak-to-peak, average, RMS, AC RMS, area | Summary pyramid (§2.2), time-weighted |
| Frequency, period, duty cycle | Rising crossings of the average (or a chosen level), located by linear interpolation between samples; whole periods only |
| Rise time, fall time, overshoot, settling time | Find the step's initial and final levels, then the crossing times of the chosen percentages |
| Time constant | Least-squares fit of an exponential to the step, reported with its fit quality |
| Phase difference, gain | Against a second trace, over whole periods of the first |
| Slope at a cursor (CHT-27) | Local derivative from the samples either side |
| Cursor snap points (CHT-26) | Peaks, valleys, zero crossings, edges, and the 63.2% point, found by the same crossing and extremum routines |

### 4.2 Math traces

A math trace (CHT-33) is defined by an expression such as `V1 − V2` or
`integral(I1)`.

- The expression is parsed by a small, safe parser into a syntax tree.
  It cannot run code (this matters because math traces travel inside
  shared files and lesson files).
- **Units** are derived by walking the tree with the `units` package's
  dimensional algebra, so volts times amps is watts and `d/dt` of volts
  is volts per second.
- Because every channel shares the same time column, evaluation is a
  straight pass over aligned samples. Derivatives use the variable step;
  integrals use the trapezoidal rule.
- Math traces are stored in the History Store like any other trace, so
  they get the pyramid, ghosts, and measurements for free.

### 4.3 Tools for the circuit laws

The Loop tool (PRB-16), the Junction tool (PRB-18), and the potential
profile (PRB-17) request **channels** for the voltages and currents they
need, like probes do, but they do not create traces or lanes. The energy
panel (PRB-20) reads per-element energy totals that the engine
accumulates in double precision each step, which is the only way to
guarantee the 0.1% balance.

## 5. Analyses

### 5.1 Where analyses run

| Option | Verdict |
|---|---|
| In the live worker, pausing the transient run | Rejected. ANL-12 asks the frequency response to redraw within half a second while a slider moves C1, and the live animation must not hitch while it does. |
| **In a separate analysis worker** | **Chosen.** It loads the same engine code, receives the same netlist, and runs jobs without touching the live simulation. It starts the first time an analysis tab opens and stops after a minute idle. |
| A pool of analysis workers | Deferred. Parameter sweeps are naturally parallel, so a pool sized to the processor count could speed them up; it can be added behind the same job interface. |

### 5.2 The job interface

```ts
interface AnalysisService {
  submit<J extends AnalysisJob>(job: J): JobHandle<ResultOf<J>>;
}

interface JobHandle<R> {
  progress: Observable<number>;            // 0 to 1, for long sweeps (ANL-20)
  partial: Observable<R>;                  // partial results, kept if cancelled
  result: Promise<R>;
  cancel(): void;
}

type AnalysisJob =
  | { kind: "dc"; netlist: Netlist }                                       // ANL-03
  | { kind: "snapshot"; netlist: Netlist; state: DisplayState }            // ANL-07
  | { kind: "ac"; netlist: Netlist; input: Id; outputs: ChannelSpec[]; freqs: FreqRange }  // ANL-08–13
  | { kind: "phasor"; netlist: Netlist; frequency: number }                // ANL-16
  | { kind: "sweep"; netlist: Netlist; param: ParamRef; values: number[];
      sweep: "transient" | "measurement" | "dc"; outer?: ParamSweep }      // ANL-17–19
  | { kind: "spectrum"; samples: TraceSlice; window: WindowShape }         // ANL-22–25
  | { kind: "thevenin"; netlist: Netlist; a: NodeRef; b: NodeRef; frequency?: number }  // PRB-19
  | { kind: "truthTable"; netlist: Netlist; inputs: Id[]; outputs: Id[] }; // DIG-10, LES-06
```

**Stale jobs are cancelled.** When the circuit changes while a frequency
response is open, the app cancels the running AC job and submits a new
one after a 100 ms pause in edits. The previous result is kept as a ghost
(ANL-12).

### 5.3 How each analysis works

| Analysis | Method |
|---|---|
| DC operating point | The engine's DC routine ([Engine §8](simulation-engine.md#8-starting-state-and-the-dc-operating-point)): capacitors open, inductors shorted, Newton with gmin and source stepping. Returns node and part tables and the power balance. |
| Frequency response | Find the DC operating point, ask every element for its small-signal stamps, then solve the complex-valued system once per frequency. The sparsity pattern is analyzed once and reused for all 300 frequencies of the default sweep. Markers (−3 dB points, peak, crossings; ANL-11) are found on the main thread from the result. |
| Impedance | The same, with a 1 A test source at the chosen port (ANL-13). |
| Phasors | One frequency of the same solve, returned as magnitudes and angles (ANL-16). |
| Parameter sweep | For each value, apply the parameter as a `setParams` override and run the requested routine: a transient run from reset for the chosen duration, a transient run followed by a measurement from the [measurement library](#41-the-measurement-library), or a DC solve. |
| Spectrum | Resample the variable-step trace onto a uniform grid by interpolation, apply the window (Hann by default), take a real FFT, and find the fundamental and harmonics for THD (ANL-24). The resolution is reported with the result (ANL-25). |
| Thévenin and Norton | Two solves at the chosen pair of nodes: open-circuit voltage, then the impedance seen with independent sources zeroed. |
| Truth table | Step a purely digital copy of the selection through every input combination with the event kernel. Also used by lesson test benches. |

Every result is shown in the chart renderer with a non-time horizontal
axis, which gives every analysis cursors, hover readouts, ghosts, and
export (ANL-01).

## 6. Open questions

1. **Sweep cost.** A transient-family sweep of 20 values on a large
   circuit could take many seconds in one worker. Should the first
   release include the worker pool (§5.1), or is a progress bar enough?
