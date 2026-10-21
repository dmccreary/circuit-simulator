---
title: Simulation Engine Design
description: Design of the circuit simulator's numerical engine — method, linear solver, mixed-signal kernel, element model interface, run loop, and the protocol between the worker and the interface.
---

# Simulation Engine

The engine turns a netlist into voltages and currents over time. It runs
in a web worker ([Overview §4](index.md#4-threads-and-timing)), has no
access to the page, and talks to the rest of the application only through
the [worker protocol](#7-the-worker-protocol). Because it depends on
nothing but the element models, the `units` package, and `dmath`, the
same code runs headless in Node for the acceptance tests.

## 1. Responsibilities and boundaries

| The engine does | The engine does not |
|---|---|
| Solve the circuit at each time step (transient analysis) | Know anything about geometry, wires as drawn, or the screen |
| Run the digital event kernel and couple it to the analog solver | Decide what a probe looks like or which lane it goes in |
| Choose and adapt the time step (SIM-07, SIM-08) | Keep the undo history |
| Find the DC operating point (SIM-12, ANL-03) and run small-signal analyses (in the analysis worker) | Format numbers or write messages in English |
| Track heating, ratings, and failure (RLM-04–06) | Store probe traces long-term (the [History Store](history-and-analysis.md#2-the-history-store) does) |
| Keep a ring buffer of full circuit states for scrubbing (CHT-23) | |
| Report numerical problems as diagnostics tied to elements (SIM-14, SIM-16) | |

## 2. Numerical method

### 2.1 Formulation: modified nodal analysis

The engine uses **modified nodal analysis** (MNA), the formulation used by
SPICE and by Falstad's simulator. The unknowns are every node voltage
(ground excluded) plus one current for each element that needs one
(voltage sources, inductors, ideal op-amp outputs, controlled voltage
sources). Each element *stamps* its contribution into the matrix `A` and
right-hand side `b`, and the engine solves `A x = b`.

MNA was chosen without serious competition: it handles every element in
Section 9, it is the standard formulation in the literature, and it lets
elements be written independently as plug-ins
([§5](#5-the-element-model-interface)).

### 2.2 Time integration

Capacitors, inductors, and other elements with memory are replaced at each
step by a **companion model** (a conductance in parallel with a current
source) derived from an integration rule. The choice of rule decides
whether SIM-22 ("no invented damping") can be met.

| Option | Behavior | Verdict |
|---|---|---|
| **A. Backward Euler, fixed step** | Very robust; never rings | Rejected as the default. It adds numerical damping: an ideal LC circuit loses amplitude every cycle. At 50 steps per period the amplitude falls far below 99% after 100 cycles, failing SIM-22 and acceptance test 6. |
| **B. Trapezoidal rule, adaptive step, with backward-Euler restarts** | Second-order accurate and energy-conserving on ideal LC circuits; can show a small false "ringing" just after a sudden jump | **Chosen.** The ringing is removed the standard way: the first one or two steps after any discontinuity (a switch, a source edge, a digital event) use backward Euler, then trapezoidal resumes. |
| **C. Gear's second-order method (BDF2) or TR-BDF2** | Never rings; well suited to stiff circuits | Rejected as the default. Like backward Euler it damps oscillations slightly, which accumulates over 100 cycles. It remains available as a per-circuit option for very stiff circuits. |

### 2.3 Choosing the time step

SIM-07 asks for the fastest important behavior to span at least 50 steps,
with the step shrinking around sudden events. The step is chosen as the
smallest of four limits:

1. **Accuracy limit.** After each step, each reactive element estimates
   its local truncation error. If the largest estimate exceeds the
   tolerance, the step is rejected and retried with a smaller one;
   otherwise the next step may grow by at most a factor of two.
2. **Time-scale limit.** The circuit's fastest time scale divided by 50
   (see [§2.5](#25-estimating-the-circuits-time-scales)).
3. **Breakpoints.** The step is shortened to land exactly on the next
   known event: a source's edge, a scheduled switch action (CTL-08), a
   digital event, or a chart time the run loop must reach.
4. **Manual limit.** The student's maximum time step (SIM-08), when set.
   If it is larger than the time-scale limit, the engine emits the
   "step too large" diagnostic.

**Crossings that are not known in advance** — an analog voltage crossing
a logic threshold, a trigger level, a pause condition (SIM-04), a part
reaching its failure temperature — are located by checking for a sign
change across each accepted step, then shortening the step so it lands
within a small tolerance of the crossing.

### 2.4 Non-linear elements: Newton–Raphson

Diodes, transistors, lamps with realistic filaments, and other
non-linear elements are handled by Newton–Raphson iteration at each step.
The engine uses the standard aids that make Newton reliable on
semiconductor circuits:

- **Voltage limiting** on each p-n junction between iterations, so the
  exponential cannot overflow;
- a **minimum conductance** (`gmin`) across every junction;
- **step halving**: if Newton fails to converge in its iteration limit,
  the step is retried at half the size, up to eight times, before the
  engine reports SIM-16 ("Could not find a solution at t = …");
- for the DC operating point, **gmin stepping** and then **source
  stepping** (ramping all sources up from zero) when plain Newton fails.

### 2.5 Estimating the circuit's time scales

Fit to circuit (SIM-10, CHT-07), the AC slow-down notice (ANI-08), and the
time-step limit all need to know how fast the circuit is. The engine
computes a `TimeScales` record whenever the netlist or a value changes:

```ts
interface TimeScales {
  fastest: number;      // seconds; drives the step limit
  dominant: number;     // seconds; drives Fit to circuit
  sourcePeriods: number[];   // from every periodic source
  kind: "transient" | "periodic" | "static";
}
```

Time constants come from the **open-circuit time-constant method**: for
each capacitor (and, dually, each inductor) the engine finds the
resistance it sees with every other reactive element frozen, which costs
one linear solve per element. The products give a list of time constants;
the smallest is `fastest`, the largest is `dominant`. Source periods come
straight from the source settings. This is approximate for coupled
circuits but more than good enough for choosing a speed and a window, and
it is cheap enough to recompute on every slider movement.

## 3. The linear solver

Every step solves at least one linear system. The `LinearSolver`
interface hides how:

```ts
interface LinearSolver {
  /** Called when the topology changes: decide the pivot order and fill-in. */
  analyze(pattern: SparsityPattern): void;
  /** Factor the current numeric values. Throws SingularError with the failing row. */
  factor(values: Float64Array): void;
  /** Solve in place using the latest factorization. */
  solve(rhs: Float64Array): void;
}
```

| Option | Verdict |
|---|---|
| **Dense LU with partial pivoting** | Used for small systems (fewer than about 40 unknowns), where it is fastest and simplest. Most first-course circuits fall here. |
| **Sparse LU with Markowitz ordering** (a KLU-style design written in TypeScript) | **Used for larger systems.** The pivot order is worked out once per topology (`analyze`) and reused for every step, so only the numeric factorization repeats. |
| Iterative solvers (conjugate gradient, GMRES) | Rejected. MNA matrices are non-symmetric and often badly conditioned; direct factorization is more reliable and fast enough at this size. |

Two further savings matter for smooth animation. If the circuit is linear
and the step has not changed, the matrix has not changed either, so the
engine **reuses the last factorization** and only re-solves; most
classroom circuits spend nearly all their time in this fast path. And
elements mark their matrix entries as static or per-step at setup, so a
per-step restamp touches only the entries that change.

**Singular matrices** become diagnostics, not crashes. When factorization
fails at a row, the engine looks up which node or branch current that row
belongs to and which elements stamp into it, and reports them (SIM-14).
The [netlist compiler](circuit-model.md#4-the-netlist-compiler) catches
most structural causes earlier (sources in parallel, loops of ideal
inductors), so the engine's report is a fallback for the rest.

## 4. Mixed signal: the digital event kernel

Section 17 asks for a full digital library that mixes freely with analog
parts, with four logic states (DIG-02) and propagation delays as short as
10 ns (acceptance test 18).

| Option | Description | Verdict |
|---|---|---|
| **A. Everything analog** | Each gate is a behavioral voltage source whose output follows a threshold function of its inputs, solved inside the analog matrix (Falstad's approach). | Rejected. A 10 ns delay would force 10 ns steps for the whole circuit, even when the digital part is idle; four-state logic (X and Z) has no natural analog meaning. |
| **B. Separate event-driven kernel with bridges** | Digital parts are evaluated by a classic event queue. Bridges convert at the boundaries. | **Chosen.** |
| C. Everything digital, analog parts approximated | — | Not considered further: the course is mostly analog. |

How option B works:

- **The event queue** holds pending changes `(time, net, newState)`.
  Evaluating a gate whose input changed schedules its output change after
  its propagation delay. Zero-delay gates use **delta cycles** at the same
  time, so ordering is still correct and glitches appear when delays are
  set (DIG-05).
- **Digital-to-analog bridges.** Where a digital output drives an analog
  node, the bridge stamps a voltage source with an output resistance
  (DIG-04) into the analog matrix. Its voltage changes only when the
  digital state changes, and each change is a **breakpoint** for the
  analog step.
- **Analog-to-digital bridges.** Where an analog node drives a digital
  input, the bridge watches for threshold crossings (with hysteresis for
  Schmitt inputs) using the crossing detector in [§2.3](#23-choosing-the-time-step),
  and posts an event at the crossing time.
- **Synchronization.** Each analog step runs to the earliest of its own
  limit and the next digital event, processes all events at that time,
  re-stamps changed bridges, and continues. A purely digital circuit
  advances event to event without solving any matrix at all.

Nets that connect only digital pins never enter the analog matrix. A net
with both kinds of pin is an analog node with bridges on it.

## 5. The element model interface

Every part type in Section 9 is a plug-in with three parts: a descriptor,
a model, and a view ([Circuit Model §5](circuit-model.md#5-the-element-plug-in-interface)).
The **model** is the engine's half. It is the only place where a part's
physics lives.

```ts
interface ElementModel {
  /** Called once per netlist. Declare extra unknowns, matrix entries, digital pins, state size. */
  setup(ctx: SetupContext): void;

  /** Entries that never change while the topology and values are unchanged. */
  stampStatic?(s: Stamper): void;

  /** Entries that depend on the step: companion models, time-varying sources. */
  stampStep?(s: Stamper, step: StepInfo): void;

  /** Linearized entries at the present Newton guess (non-linear elements only). */
  stampNewton?(s: Stamper, x: SolutionView): void;
  hasConverged?(x: SolutionView, previous: SolutionView): boolean;

  /** Called once a step is accepted: update internal state (charge, flux, temperature). */
  accept(x: SolutionView, step: StepInfo): void;

  /** Local truncation error estimate, to choose the next step. */
  truncationError?(step: StepInfo): number;

  /** Known events between t0 and t1 (source edges, scheduled actions). */
  breakpoints?(t0: number, t1: number, out: number[]): void;

  /** Digital behavior: called by the event kernel when an input pin changes. */
  evaluateDigital?(ctx: DigitalContext): void;

  /** Values for hover cards, probes, and Explain (CAN-17, PRB-21). */
  readouts(x: SolutionView, out: ReadoutSink): void;

  /** Current along each drawn segment, for the dots (ANI-01). */
  segmentCurrents(x: SolutionView, out: Float64Array): void;

  /** Heating and rating checks when realistic ratings are on (RLM-05). */
  stress?(x: SolutionView, step: StepInfo): StressReport | undefined;

  /** Serialize and restore internal state, for re-mapping and history. */
  saveState(out: Float64Array): void;
  loadState(from: Float64Array): void;
}
```

Design notes:

- **Models are written once and used everywhere.** Transient, DC,
  small-signal (AC), and sweep analyses all use the same model. For
  frequency response the engine asks the model for its small-signal
  stamps at the operating point through `stampStep` with a
  `StepInfo.kind` of `"ac"` and a complex frequency.
- **Failure is a model state, not a different element.** When `stress`
  reports that a part has passed its limit, the model switches into its
  failure mode (open, short) and the engine emits a `partFailed` event.
  The part's identity, label, and probes stay the same (RLM-06). Lamp
  filament temperature (ANI-17) uses the same heating machinery with
  ratings turned off.
- **Subcircuits are flattened** before they reach the engine, with
  hierarchical identifiers (`U1/R3`), so the engine never sees hierarchy.
  See [Circuit Model §6](circuit-model.md#6-subcircuits).

## 6. The engine host and run loop

The **engine host** wraps the engine inside the worker. It owns the run
state, turns real time into simulated time, applies commands at safe
points between steps, and batches results into frames.

### 6.1 Run states

```text
           load / reset
               |
               v
  +-------> PAUSED <----------- pause / pause condition met
  |          |   ^ \
  |      run |   |  \ step / stepToEvent
  |          v   |   v
  |        RUNNING   STEPPING --(done)--> PAUSED
  |          |
  |   solver error
  |          v
  +--- STOPPED (error) ---- edit makes circuit solvable ---> previous state (SIM-15)
```

Every circuit loads **paused at t = 0** (SIM-01a). Even so, the host
computes the solution at t = 0 straight away, so the schematic shows
correct wire colors and the hover readouts work before the student
presses Run.

### 6.2 The loop

The worker has no `requestAnimationFrame`, so the host drives itself with
a message-channel tick. Each tick:

1. **Apply pending commands** (value changes, switch flips, topology
   swaps) in the order they arrived. These are the only moments the
   netlist can change, so a step never sees half an edit.
2. **Compute the budget.** Simulated time owed = speed × real time since
   the last tick, capped so that no more than about 8 ms of computing is
   spent per tick.
3. **Step** the engine until the budget is used, the 8 ms limit is hit,
   or an event (pause condition, error) stops it.
4. **Emit a frame** if at least 16 ms have passed since the last one and
   the main thread has acknowledged the previous frame.

If step 3 hits the 8 ms limit before the budget is used, the circuit is
too slow for the requested speed. The host then lowers the effective
speed rather than letting debt pile up, and sets `slowerThanRequested` in
the next frame (PRF-09).

**Back-pressure.** The host never has more than two unacknowledged frames
in flight. If the main thread falls behind (a busy laptop, a background
tab), the host merges results into the pending frame instead of posting
more, so memory cannot grow without bound.

### 6.3 Live edits and topology changes

Value changes (SIM-18) arrive as `setParams` and are applied at the next
tick; the matrix entries are marked dirty and refactored. Topology
changes (SIM-19) arrive as a complete new netlist plus an **identity
map**. The host builds the new engine structures, then copies the saved
state of every element whose identifier survived (capacitor voltage,
inductor current, flip-flop state, temperature) into its new slot. New
elements start from their initial conditions. Then it continues from the
same simulated time.

## 7. The worker protocol

All communication with the live worker and the analysis worker goes
through typed messages. The protocol is versioned with the application
and validated at the boundary in development builds.

### 7.1 Commands (main thread to worker)

| Command | Payload | Requirement |
|---|---|---|
| `load` | Netlist, circuit settings, initial states | FIL-02 |
| `replaceNetlist` | New netlist plus identity map | SIM-19 |
| `setParams` | List of `(elementId, param, value)` | SIM-18, CTL-06 |
| `setChannels` | The list of probe channels to record (see §7.3) | PRB-01 |
| `run`, `pause` | — | SIM-01 |
| `step`, `stepToEvent` | — | SIM-02 |
| `reset` | Starting mode (zero or steady state) | SIM-03, SIM-12 |
| `setSpeed` | Simulated seconds per real second, or `"fit"` | SIM-09, SIM-10 |
| `setPauseConditions` | List of conditions | SIM-04 |
| `getStateAt` | A simulated time | CHT-22 |
| `restartFrom` | A simulated time | CHT-22 |
| `setVisibility` | Visible or hidden | EMB-07 |
| `ackFrame` | Frame number | Back-pressure (§6.2) |

### 7.2 Messages (worker to main thread)

| Message | Contents |
|---|---|
| `frame` | Simulated time range, the new samples for every channel, the latest display state, run state, effective speed, events since the last frame |
| `stateAt` | The full display state at the requested time, or "not available" (CHT-23) |
| `diagnostics` | The current list of numerical diagnostics (§3, SIM-14, SIM-16) |
| `timeScales` | The latest [`TimeScales`](#25-estimating-the-circuits-time-scales) |
| `audio` | Sample blocks for speakers, only when sound is on and running in real time (ANI-20) |

### 7.3 Channels and the frame layout

A **channel** is one recorded quantity: a node voltage, a voltage between
two nodes, a branch or segment current, a power, a logic state. Probes,
meters, the Loop and Junction tools, lesson checks, and pause conditions
all ask for channels. The main thread deduplicates them, so ten consumers
of one node voltage cost one channel.

A frame is packed into a single `ArrayBuffer` and transferred, not
copied:

```text
FrameHeader   frame number, t0, t1, sample count n, channel count k, flags
times         Float64Array[n]          variable-step sample times
samples       Float64Array[n * k]      channel-major
display       Float64Array[nodes + segments]   latest node voltages and segment currents
discrete      Uint8Array[...]          switch positions, logic states, failure flags
events        JSON-encoded tail        switch flips, failures, crossings (CHT-24)
```

Every step is a sample; nothing is thinned out in the worker, so the
History Store can keep full resolution (PRF-04) and measurements are
exact. At the time steps typical of classroom circuits this is a few
hundred samples per frame.

### 7.4 The full-state history ring

Scrubbing (CHT-22) needs *every* node voltage and segment current at any
of the last 20,000 steps (CHT-23), not just the probed channels. Sending
all of that to the main thread every frame would cost tens of megabytes
per second. Instead, the history ring lives **in the worker**:

| Option | Verdict |
|---|---|
| **A. Ring buffer of display states in the worker, queried with `getStateAt`** | **Chosen.** A scrub costs one small request and reply, well under a frame. |
| B. Ring buffer on the main thread, filled by frames | Rejected: the transfer volume described above. |
| C. Periodic checkpoints in the worker, re-simulating forward to the requested time | Kept as the fallback for very large circuits (below), since it uses far less memory. |

The ring stores the display state as `Float32` (single precision is
plenty for colors, dots, and hover cards; probed traces keep full
precision in the History Store). For a 150-part circuit this is about
20 MB for 20,000 steps. Above a memory budget (default 64 MB), the ring
switches to option C: it keeps a full engine checkpoint every 256 steps
and re-simulates forward from the nearest one. Determinism
([Overview §5.1](index.md#51-why-typescript-for-the-engine-not-webassembly))
makes the replay exact.

A pleasant consequence: when a probe is added while paused, the host can
**back-fill** its trace from the ring, so the new trace shows the last
20,000 steps of history at once instead of starting empty.

## 8. Starting state and the DC operating point

- **Start from zero** (SIM-12, the default) sets every capacitor voltage
  and inductor current to its initial condition (SIM-13), usually zero,
  and solves the circuit at t = 0 with all sources switched on.
- **Start from steady state** runs the DC operating point first
  (capacitors open, inductors shorted, with the Newton aids in §2.4) and
  uses it as the initial state.
- The **DC tab** (ANL-03) uses the same routine in the analysis worker.

## 9. Open questions

1. **Accuracy tolerances.** The default relative and absolute tolerances
   for the truncation-error check need tuning against acceptance tests
   4–9 and against frame-rate targets. A starting point is SPICE's
   defaults (relative 0.001, absolute 1 µV and 1 pA).
2. **Device models.** Which published equations (for example, the
   Ebers–Moll or Gummel–Poon transistor models, and the Shichman–Hodges
   MOSFET model) to use for each semiconductor in Section 9.6, and where
   their default parameters come from, belongs in a later, component-level
   pass.
