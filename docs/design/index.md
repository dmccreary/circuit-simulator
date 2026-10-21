---
title: Circuit Simulator Design
description: First-pass architecture for the browser-based circuit simulator — the major components, how they talk to each other, and why each key design option was chosen.
---

# Circuit Simulator Design

| | |
|---|---|
| Status | Design draft 1, for author review |
| Date | 2026-10-21 |
| Implements | [Circuit Simulator Specification](../specifications/index.md), draft 1 |
| Focus of this pass | Architectural components and the interfaces between them |

The [specification](../specifications/index.md) says **what** the simulator
must do and deliberately says nothing about how. This document is the
first answer to "how". It names the major components, draws the lines
between them, defines the interfaces that cross those lines, and records
why each significant option was chosen over its alternatives.

It is a first pass. Data structures inside a component, file-by-file code
layout, and visual design are left for later passes. Where this document
cites a requirement, the identifier (such as SIM-07) refers to the
specification.

## 1. Pages in this design

| Page | What it covers |
|---|---|
| This page | Goals, the overall architecture, threads, data flow, repository layout, and the summary of decisions |
| [Simulation Engine](simulation-engine.md) | Numerical method, mixed-signal kernel, time stepping, the engine's command and output interfaces |
| [Circuit Model](circuit-model.md) | The circuit document, edits and undo, the netlist compiler, the element plug-in interface, subcircuits |
| [Rendering and Animation](rendering.md) | The schematic renderer, current dots, voltage color, and the time-series chart |
| [History and Analyses](history-and-analysis.md) | Time history, scrubbing, measurements, math traces, DC, frequency, sweep, and spectrum |
| [Application Shell](app-shell.md) | UI framework, layout and responsiveness, tools and input, accessibility, settings |
| [Files and Persistence](files-and-persistence.md) | The circuit file, share links, Falstad import, browser storage, offline operation |
| [Embedding, Lessons, and xAPI](embedding-lessons-xapi.md) | Embed parameters and modes, the host message bridge, the lesson engine, learning events |

## 2. Design goals

These goals come from the specification. When two design options both
work, these settle the choice.

1. **The animation never stutters.** The schematic and chart must stay
   smooth at 30–60 frames per second (PRF-01) and respond to a switch
   within 100 ms (PRF-02), even while the solver is working hard.
2. **The engine is testable without a browser.** The 22 acceptance
   circuits (Section 26) and the 366 Falstad examples (FIL-18) must run
   as automated tests on every change, headless and fast.
3. **One source of truth per kind of state.** The circuit document, the
   simulation state, and the user-interface state each have exactly one
   owner. Everything else is a view or a copy that can be rebuilt.
4. **Embeds are cheap.** A chapter page may hold several embedded
   simulators. Each must show its circuit within two seconds (PRF-03),
   so code that a `view` or `run` embed never uses must not be loaded.
5. **Static hosting only.** The book is published to GitHub Pages with
   `mkdocs gh-deploy`. There is no server, no custom HTTP headers, and no
   database. Everything runs in the reader's browser.
6. **Durable and open.** Files are documented text, the app works offline,
   and nothing depends on a service that could close (PRN-12).

## 3. Architecture at a glance

The simulator is a single-page TypeScript application. It runs on two
kinds of thread: the browser's **main thread**, which owns everything the
reader sees and touches, and one or more **web workers**, which own the
numerical work.

```text
 MAIN THREAD                                          WORKER THREADS
+-----------------------------------------------+    +-------------------------------+
|                                               |    |  Live Simulation Worker       |
|  Application Shell (React + React Aria)       |    |  +-------------------------+  |
|   menus, panels, inspector, dialogs, lesson   |    |  | Simulation Engine       |  |
|                     |                         |    |  |  MNA solver, Newton,    |  |
|                     v                         |    |  |  integrator, digital    |  |
|  App Store (UI state, settings, selection)    |    |  |  kernel, state ring     |  |
|                     |                         |    |  +-----------^-------------+  |
|                     v                         |    |              |                |
|  Circuit Document --edits--> Netlist Compiler +--->|  Engine Host (run loop,      |
|   (+ undo history)           (topology)       |cmd |  speed control, batching)    |
|                                               |    |              |                |
|  Frame Bus  <----------------------------------+----+  frames: samples, display   |
|   |        |              |                   |frm |  state, events, errors       |
|   v        v              v                   |    +-------------------------------+
|  Schematic  Chart        History Store        |
|  Renderer   Renderer     (probe traces,       |    +-------------------------------+
|  (Canvas2D) (Canvas2D)    ghosts, events)     |--->|  Analysis Worker (on demand)  |
|                                               |<---|  same engine: DC, AC, sweeps  |
|  Host Bridge (postMessage)   Lesson Engine    |    +-------------------------------+
|  Persistence (IndexedDB)     xAPI Reporter    |
+-----------------------------------------------+
```

### 3.1 The components

| # | Component | Thread | Owns | Main requirements |
|---|---|---|---|---|
| 1 | [Circuit Document](circuit-model.md#2-the-circuit-document) | Main | Parts, wires, labels, probes, lanes, sliders, settings: everything saved in a file | FIL-02, EDT-31 |
| 2 | [Edit and Undo System](circuit-model.md#3-edits-transactions-and-undo) | Main | The undo and redo stacks; turns gestures into transactions | EDT-31–33, PRN-05 |
| 3 | [Netlist Compiler](circuit-model.md#4-the-netlist-compiler) | Main | Nothing persistent; turns geometry into nodes and a netlist | CAN-10–12, EDT-14, EDT-39 |
| 4 | [Element Library](circuit-model.md#5-the-element-plug-in-interface) | Both | One plug-in per part type: descriptor, model, view | Section 9 |
| 5 | [Simulation Engine](simulation-engine.md) | Worker | Matrix, solver, element state, simulated time, the full-state history ring | Section 10, Section 17, CHT-23 |
| 6 | [Engine Host](simulation-engine.md#6-the-engine-host-and-run-loop) | Worker | The run loop, speed control, frame batching | SIM-01–11, PRF-09 |
| 7 | [Frame Bus](simulation-engine.md#7-the-worker-protocol) | Main | Fan-out of each incoming frame to its subscribers | PRN-04 |
| 8 | [History Store](history-and-analysis.md#2-the-history-store) | Main | Probe traces at full resolution, ghosts, the event log | CHT-17, CHT-24, PRF-04 |
| 9 | [Schematic Renderer](rendering.md#2-the-schematic-renderer) | Main | Canvas layers, view transform, hit testing | Section 6, Section 11 |
| 10 | [Current Animator](rendering.md#3-the-current-animator) | Main | Dot phases along every wire and part | ANI-01–10 |
| 11 | [Chart Renderer](rendering.md#5-the-chart-renderer) | Main | Lanes, axes, traces, cursors, playhead | Section 12 |
| 12 | [Measurement Library](history-and-analysis.md#4-measurements-and-math-traces) | Main | Pure functions over trace data | CHT-26–33 |
| 13 | [Analysis Service](history-and-analysis.md#5-analyses) | Analysis worker | DC, AC, sweep, spectrum jobs | Section 14 |
| 14 | [Application Shell](app-shell.md) | Main | Layout, panels, menus, tools, focus, settings | Sections 4, 5, 7, 8, 22, 24 |
| 15 | [Tool Controller](app-shell.md#5-tools-and-input) | Main | The active tool and its state machine | Sections 7, 8, 13 |
| 16 | [Persistence Service](files-and-persistence.md#5-browser-storage) | Main | IndexedDB stores, autosave, recovery | FIL-04–09, PRF-06 |
| 17 | [Format Codecs](files-and-persistence.md#2-the-circuit-file) | Main | Native file, share link, Falstad text and XML | FIL-01–03, FIL-14–19 |
| 18 | [Host Bridge](embedding-lessons-xapi.md#3-the-host-bridge) | Main | Embed parameters, capabilities, host messages | Section 19 |
| 19 | [Lesson Engine](embedding-lessons-xapi.md#4-the-lesson-engine) | Main | Lesson state, step progression, checks | Section 20 |
| 20 | [xAPI Reporter](embedding-lessons-xapi.md#5-the-xapi-reporter) | Main | Statement building, throttling, queue | Section 21 |

### 3.2 How a change flows through the system

Following one edit end to end shows how the components fit together.
The student drags a slider that changes R1 from 1 kΩ to 2 kΩ while the
circuit runs:

1. The **Application Shell** turns the slider drag into a gesture and
   hands it to the **Edit and Undo System**, which opens a transaction.
2. Each pointer move updates the **Circuit Document** inside that open
   transaction. The document emits a *patch*: "R1.resistance = 1.37 kΩ".
3. The **Netlist Compiler** classifies the patch. A value change does not
   alter topology, so no recompile is needed. It forwards a
   `setParam` command to the worker.
4. The **Engine Host** applies the change before the next time step
   (SIM-18), adds an event marker (SIM-20), and keeps running.
5. Within about 16 ms the worker posts a **frame**: new samples for every
   probe, the latest display state (node voltages and branch currents),
   and the event.
6. The **Frame Bus** delivers the frame to the **History Store** (which
   appends it), the **Schematic Renderer** (wire colors), the **Current
   Animator** (dot speeds), the **Chart Renderer** (traces), and the
   **Lesson Engine** (checks).
7. When the student releases the slider, the transaction closes as one
   undo step (EDT-32), the **Persistence Service** autosaves (PRF-06),
   and the **xAPI Reporter** sends one statement for the whole drag
   (XAP table, XAP-08).

A topology change (adding a part, rewiring) follows the same path, except
that in step 3 the compiler produces a new netlist and the engine
**re-maps** its state onto it by stable element identifiers, so that
capacitors keep their charge (SIM-19). See
[Circuit Model §4](circuit-model.md#4-the-netlist-compiler).

### 3.3 Three kinds of state

| State | Owner | Saved in file? | Undoable? | Examples |
|---|---|---|---|---|
| **Document** | Circuit Document | Yes | Yes | Parts, values, wires, probes, lanes, sliders, circuit settings |
| **Simulation** | Engine (worker), mirrored by History Store | Only part states at save time (FIL-17) | No (EDT-33) | Simulated time, node voltages, capacitor charge, logic states, failure status |
| **Session** | App Store | No | No | Selection, zoom, active tool, open panels, chart cursors, learner settings |

Keeping these three apart is the single most important structural rule
in the design. It is what lets undo apply to a running circuit without
rewinding time (EDT-33), lets the same document be shown in several
embeds, and lets the engine run headless in tests.

!!! note "Two exceptions that are deliberate"
    Failure state (RLM-07) is simulation state, but **Repair** is an
    undoable document edit that clears it. The view (zoom and center) is
    session state, but it is written into the file on save (FIL-02) and
    read back on open.

## 4. Threads and timing

### 4.1 Where the simulation runs

The most consequential decision in this design is where the numerical
work happens.

| Option | Description | Verdict |
|---|---|---|
| **A. Main thread** | The solver runs between animation frames, as in Falstad's simulator. | Rejected. A stiff circuit, a Newton iteration that needs many passes, or a 500-part matrix stalls the whole interface. PRF-02 and PRF-01 cannot be guaranteed. |
| **B. Dedicated worker, messages with transferable buffers** | The solver runs in a web worker. Each frame of results is packed into an `ArrayBuffer` and *transferred* (not copied) to the main thread. | **Chosen.** |
| **C. Dedicated worker, `SharedArrayBuffer` ring buffers** | Worker and main thread share memory; no messages for data. | Rejected for now. `SharedArrayBuffer` requires cross-origin isolation (COOP and COEP headers). GitHub Pages cannot set headers, and an embedded iframe can only be isolated if the hosting chapter page is isolated too, which would break other content on the page. |

Option B keeps the interface responsive no matter what the solver is
doing, costs one small transfer per frame (a few kilobytes), and works on
plain static hosting. The worker protocol is written so that option C can
be added later behind the same interface if the book ever moves to a host
that allows isolation.

### 4.2 The two clocks

Two clocks run independently, and keeping them separate is what makes
ANI-03 true ("dot speed never depends on simulation speed"):

- **Simulated time** advances in the worker. The Engine Host converts
  real elapsed time into a simulated-time budget using the speed setting
  (SIM-09), then steps the engine until the budget is used up or a
  frame deadline arrives.
- **Animation time** advances on the main thread with
  `requestAnimationFrame`. The Current Animator moves dots using the
  *latest known currents* and *real* elapsed time. It never looks at the
  simulation speed.

If the worker cannot keep up, the Engine Host shrinks the budget rather
than queueing work, and reports `slowerThanRequested` (PRF-09). The
interface keeps animating at full frame rate with the most recent values.

### 4.3 Workers per page

Each simulator instance (each iframe) has one **live simulation worker**,
created at startup. An **analysis worker** is created only the first time
an analysis tab is opened, and is shut down after a minute of idleness.
A chapter page with four embeds therefore runs four live workers, which
is acceptable because EMB-07 pauses embeds that are scrolled out of view.

## 5. Technology choices

| Area | Chosen | Main alternatives considered | Why |
|---|---|---|---|
| Language | TypeScript (strict) everywhere | Rust compiled to WebAssembly for the engine; C++ with Emscripten | See §5.1 |
| UI framework | React 19 with React Aria Components | Svelte 5; Lit web components | See §5.2 |
| Schematic drawing | Canvas 2D, layered | SVG; WebGL | See [Rendering §2.1](rendering.md#21-drawing-technology) |
| Chart drawing | Custom Canvas 2D renderer | uPlot; Plotly; a WebGL plot library | See [Rendering §5.1](rendering.md#51-build-or-borrow) |
| Numerical method | Modified nodal analysis, Newton–Raphson, trapezoidal with backward-Euler restarts, adaptive step | Fixed-step backward Euler (Falstad); Gear/BDF2 | See [Engine §2](simulation-engine.md#2-numerical-method) |
| Digital logic | Event-driven kernel coupled to the analog solver | All gates as analog behavioral models | See [Engine §4](simulation-engine.md#4-mixed-signal-the-digital-event-kernel) |
| Undo | Transactions of forward and inverse patches | Command objects; full snapshots | See [Circuit Model §3](circuit-model.md#3-edits-transactions-and-undo) |
| Circuit file | Versioned JSON with a published JSON Schema | YAML; a SPICE-like line format | See [Files §2](files-and-persistence.md#2-the-circuit-file) |
| Lesson file | YAML with a published JSON Schema | Markdown with directives; JSON | See [Embedding §4.1](embedding-lessons-xapi.md#41-the-lesson-file) |
| Browser storage | IndexedDB (through a thin wrapper); `localStorage` only for learner settings | Origin Private File System; `localStorage` for everything | See [Files §5](files-and-persistence.md#5-browser-storage) |
| Build | Vite, ES modules, code splitting | Webpack; esbuild alone | Fast development server, first-class workers, simple code splitting for embeds |
| Tests | Vitest (engine and model, run in Node), Playwright (user stories in real browsers) | Jest; Cypress | Vitest shares Vite's configuration; Playwright covers Chrome, Firefox, and Safari (PRF-08) |

### 5.1 Why TypeScript for the engine, not WebAssembly

| Option | For | Against |
|---|---|---|
| **TypeScript** (chosen) | One language for the whole project; the engine runs unchanged in Node for tests; easy to debug in browser tools; small download; modern JavaScript engines are fast enough for the matrix sizes this course needs (a 500-part circuit gives a sparse matrix of a few hundred to a thousand unknowns) | Floating-point transcendental functions (`Math.exp`, `Math.sin`) are not guaranteed to give bit-identical results across browsers |
| Rust to WebAssembly | Fastest solver; bit-identical math everywhere | Two languages and two toolchains; harder for textbook contributors; a crossing cost on every call between the engine and element models; larger download |
| C++ with Emscripten (for example, wrapping ngspice) | Professional-grade device models for free | Very large download (several megabytes), poor fit for live editing and state re-mapping, and ngspice's license and batch-oriented design fight the "everything is live" principle |

The engine is designed so that the hot inner kernel (sparse LU
factorization and solve) sits behind a small interface,
`LinearSolver`. If profiling on the reference laptop (open question 10)
shows the solver is the bottleneck, that one kernel can be replaced with a
WebAssembly build without touching anything else.

**Determinism (PRN-09, SIM-23).** Basic arithmetic in JavaScript is
IEEE 754 and identical everywhere, but `Math.exp`, `Math.log`,
`Math.sin`, and `Math.pow` may differ in the last bit between browsers.
The engine therefore never calls them directly. It uses a small
`dmath` module of deterministic implementations. Results are then
identical in every supported browser, not only on repeated runs in one
browser. Noise sources use a seeded generator (xoshiro128\*\*) whose seed
is stored in the file.

### 5.2 Why React with React Aria

The interface has many conventional pieces — menus, dialogs, the
inspector's forms, the lesson panel, tables — and it must meet WCAG 2.2 AA
(ACC-01). The hot paths (schematic, dots, chart) are drawn on canvases and
do **not** go through the framework at all, so framework speed matters
little. What matters is accessibility, responsive layout, and how many
people can contribute.

| Option | For | Against |
|---|---|---|
| **React 19 + React Aria Components** (chosen) | React Aria provides tested, accessible menus, dialogs, comboboxes, sliders, tabs, tables, and focus management, which covers most of Section 22; the largest pool of contributors and examples | Larger runtime (about 45 kB compressed); needs care to keep frame-rate data out of React renders |
| Svelte 5 | Smaller output; fine-grained updates | Its accessible-component libraries are younger; fewer contributors; we would hand-build more of ACC-02 to ACC-08 |
| Lit web components | Standards-based; tiny runtime; usable from any page | No accessible component set of comparable depth; most WCAG work would be ours |

The rule that keeps React fast here: **frame-rate data never enters
React state.** Renderers subscribe to the Frame Bus directly. React
components that show live numbers (hover cards, the legend's live values,
the multimeter) subscribe through a hook that samples the bus at most ten
times a second.

## 6. Code organization

The application lives in a new top-level `app/` folder, separate from the
MkDocs content in `docs/`. It is a single npm workspace with packages
whose dependencies point one way only, so the engine can never
accidentally depend on the interface:

```text
app/
  packages/
    units/         number parsing and formatting (EDT-26), unit algebra (CHT-33)
    dmath/         deterministic math functions and seeded random numbers
    model/         circuit document, patches, undo, netlist compiler   -> units
    elements/      one folder per part type: descriptor, model, view   -> model, units
    engine/        solver, integrator, digital kernel, analyses        -> elements (models only), dmath
    worker/        engine host and run loop; worker entry points       -> engine
    formats/       native file, share link, Falstad codecs             -> model, elements
    render/        schematic renderer, animator, chart renderer        -> model, elements (views only)
    lesson/        lesson schema, loader, checks, step machine         -> model
    xapi/          statement builder, queue                            -> (none)
    app/           React shell, stores, tools, host bridge, persistence -> everything
  tests/
    acceptance/    the 22 circuits of Section 26, run headless in Node
    library/       opens all 366 Falstad examples (test 20)
    stories/       Playwright walk-throughs of the Section 25 user stories
```

**Dependency rule.** `engine` and everything it depends on must run in
Node with no DOM. A lint rule enforces it. This is what makes design
goal 2 possible.

### 6.1 Where the built app lives on the site

`vite build` writes the finished simulator into `docs/simulator/`, so
that `mkdocs build` copies it into the site and the book can link to
`https://dmccreary.github.io/circuit-simulator/simulator/?example=lrc.txt`
(FIL-19). Embeds in chapters are then **same-origin** with the book,
which simplifies the host bridge's origin check (EMB-12) and lets the
browser share one cached copy of the simulator across every chapter.

Whether `docs/simulator/` is committed or built just before each publish
is an open question for the author (§8, question 1).

## 7. Cross-cutting concerns

### 7.1 Errors and diagnostics

Every component reports problems as structured **diagnostics**, never as
bare strings, so that the interface can highlight parts and offer fixes
(PRN-06, EDT-39, SIM-14):

```ts
interface Diagnostic {
  id: string;                 // stable kind, such as "sources-in-parallel"
  severity: "info" | "warning" | "error";
  message: MessageRef;        // a translation key plus values, never English text
  elements: ElementId[];      // parts and wires to highlight
  nodes?: NodeId[];
  fixes?: FixAction[];        // each fix is a document transaction the user can apply
  simTime?: number;           // for solver errors (SIM-16)
}
```

The netlist compiler produces structural diagnostics (no ground, floating
sections, sources in parallel). The engine produces numerical ones
(singular matrix, failure to converge), which it maps back to the parts
involved by inspecting the matrix row or column that failed. Lessons
attach their own feedback to diagnostics by `id` (LES-11).

### 7.2 Internationalization

All interface and diagnostic text goes through message keys and ICU
message formatting. Number formatting with units (EDT-26) is in the
`units` package and is locale-aware for the decimal separator, while unit
symbols and metric prefixes stay in SI form in every language.

### 7.3 Theming

Colors are design tokens defined once per theme (light, dark, high
contrast). Canvas renderers read the same tokens as the CSS, so the
schematic, chart, and panels always agree (CAN-15). Voltage color scales
and the probe palette are token sets with a separate set per theme, chosen
for contrast and color-blind safety (ACC-11, ACC-12).

### 7.4 Testing strategy

| Layer | What is tested | How |
|---|---|---|
| `units`, `dmath`, `model`, `formats` | Parsing, patches, undo, netlist compilation, round-trip of files | Vitest unit tests in Node |
| `engine` | Every acceptance circuit in Section 26 with its tolerance; determinism (same input, bit-identical output) | Vitest in Node; a golden-file test per circuit |
| Library | All 366 Falstad examples open; 20 author-chosen examples match Falstad's waveforms within 1% (test 21) | Vitest in Node, using reference waveforms captured once from Falstad's simulator |
| Rendering | Visual regression of the schematic and chart | Playwright screenshots |
| Whole app | Each user story in Section 25, as written | Playwright in Chrome, Firefox, and WebKit |
| Performance | 150-part circuit at 30 fps or better (test 22) | Playwright with a trace, on the reference laptop |
| Accessibility | WCAG 2.2 AA rules | axe-core in Playwright, plus manual screen-reader passes |

## 8. Open questions for the author

1. **Committing the build.** Should `docs/simulator/` (the built app) be
   committed so that the existing "publish" routine (commit, push,
   `mkdocs gh-deploy`) always ships the latest simulator, or should it be
   ignored by git and built by a script just before publishing?
   *Recommendation:* ignore it in git and add one `npm run build` step to
   the publish routine, so the repository does not fill up with build
   output.
2. **Reference laptop.** Specification question 10 matters directly here:
   it decides whether the TypeScript solver is fast enough or whether the
   WebAssembly kernel (§5.1) is needed for the first release.
3. **License.** Specification question 2 decides which third-party code
   the engine may borrow (for example, device model equations from
   GPL-licensed sources).

## Credits

This design builds on the [Circuit Simulator
Specification](../specifications/index.md), which in turn draws on Paul
Falstad's [CircuitJS1](https://github.com/pfalstad/circuitjs1) and the
other sources listed in its [Sources](../specifications/index.md#sources)
section. Specific ideas borrowed from other projects are credited on the
page where they are used.
