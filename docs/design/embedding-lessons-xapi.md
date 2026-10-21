---
title: Embedding, Lessons, and xAPI Design
description: Design of textbook embedding (parameters, modes, the host message bridge), the guided lesson engine, and the xAPI learning-event reporter.
---

# Embedding, Lessons, and xAPI

These three features connect the simulator to the textbook around it.
They are designed together because they share two mechanisms: the
**capability set** that decides what the reader may do
([Application Shell §6](app-shell.md#6-capabilities)), and the **host
bridge** that carries messages between the simulator and the chapter
page.

## 1. Components

| Component | Responsibility |
|---|---|
| **Embed loader** | Reads the URL parameters, chooses what code to load, computes the starting capability set (Section 19.1–19.2) |
| **Host bridge** | The `postMessage` channel to the page that embeds the simulator (Section 19.4) |
| **Host helper script** | A small script that chapter pages include to size iframes and relay messages (EMB-08, XAP-01) |
| **Lesson engine** | Loads lesson files, runs the step machine, evaluates checks, stores predictions and progress (Section 20) |
| **xAPI reporter** | Turns learner actions into xAPI statements, throttles them, queues them, and sends them (Section 21) |

## 2. Embedding

### 2.1 Start-up for an embed

PRF-03 gives an embed two seconds to show its circuit, and a chapter may
hold several. The embed start-up is ordered to show something useful as
early as possible:

1. **Parse the parameters** into an `EmbedConfig`. Unknown parameters are
   ignored; invalid values fall back to their defaults and add a warning
   (EMB-01).
2. **Load only what the mode needs.** `view` and `run` embeds load a
   smaller entry bundle without the palette, the wiring tools, the
   inspector's editors, subcircuit editing, or the lesson author tools.
   `edit` mode and the full simulator load everything. Element plug-ins
   load by category on demand
   ([Circuit Model §5.4](circuit-model.md#54-the-registry-and-lazy-loading)).
3. **Fetch and decode the circuit** (from `circuit`, `example`, `ctz`, or
   `c`).
4. **Draw the schematic at once**, before the worker is ready, using the
   document alone (no voltage colors yet).
5. **Start the worker**, load the netlist, and compute the t = 0
   solution. The circuit stays **paused** (SIM-01a); colors and readouts
   appear.
6. **Post `ready`** and the preferred height to the host.

### 2.2 Modes become capabilities

Each mode (EMB-02) is a preset capability set; the `panels`, `lock`, and
`layout` parameters then narrow it:

| Mode | `edit` | Tools | Notes |
|---|---|---|---|
| `edit` | `"full"` | All | The full simulator |
| `run` | `"values"` | Select, probes, Loop, Junction | Values of unlocked parts can change; no adding, deleting, or rewiring |
| `view` | `"none"` | Select (hover only), pause, scrub | No changes at all |
| `lesson` | From the lesson file | From the lesson file | Recomputed at each step (§4.2) |

**Recommended chapter default.** Most chapter embeds should use
`mode=run&panels=chart,status`. This hides the palette, inspector, and
top-bar editing menus, keeps Run/Pause, switches, sliders, probes, and
the chart, and keeps the reader's attention on the circuit the text is
discussing. The **Open in full simulator** control that every embed
shows (EMB-03) is the reader's way into full editing.

### 2.3 Embed controls

- **Open in full simulator** (EMB-03) encodes the current document,
  including the reader's changes, as a share link
  ([Files §3](files-and-persistence.md#3-share-links)) and opens it in a
  new tab in `edit` mode.
- **Reset to original** (EMB-04) re-loads the document as published, as
  one undoable transaction, and clears the reader's saved changes for
  this embed.

### 2.4 The host helper script and markup

Chapter authors embed a simulator with an ordinary iframe plus one
script include:

```html
<iframe class="circuit-sim"
        src="../../simulator/?example=lrc.txt&mode=run&panels=chart,status&id=ch3-lrc"
        title="Series LRC circuit simulation"
        width="100%" height="480"></iframe>
<script src="../../simulator/embed.js"></script>
```

`embed.js` (a few kilobytes, no dependencies) finds every
`iframe.circuit-sim` on the page, listens for `preferredHeight` messages
and resizes each iframe so it has no inner scrollbar (EMB-08), and, when
the page has configured xAPI, relays statements to the page's learning
record store connection. Without the script, embeds still work at the
iframe's given height (EMB-08, last sentence).

## 3. The host bridge

### 3.1 Message envelope

Every message, in both directions, uses one envelope:

```ts
interface BridgeMessage<T extends string, P> {
  protocol: "circuit-simulator";
  version: 1;
  embedId: string;          // the `id` parameter, so a page with many embeds can tell them apart
  type: T;                  // "ready", "loadCircuit", "setValue", ...
  requestId?: string;       // set on requests that expect a reply, such as getState
  payload: P;
}
```

| Direction | Types (EMB-10, EMB-11) |
|---|---|
| Simulator to host | `ready`, `preferredHeight`, `runStateChanged`, `circuitChanged`, `lessonProgress`, `xapiStatement`, `reply` |
| Host to simulator | `loadCircuit`, `setValue`, `setSwitch`, `run`, `pause`, `reset`, `addProbe`, `configureXapi`, `getState` |

### 3.2 Trust rules (EMB-12)

- A message is accepted only if its `source` is the simulator's own
  parent window **and** its origin equals the parent's origin, which the
  bridge records at start-up (from `location.ancestorOrigins` where the
  browser provides it, otherwise from `document.referrer`).
- The envelope and payload are validated against a schema. Anything
  malformed is ignored without error.
- Host commands go through the **command registry** and the **capability
  set** like any reader action: a host cannot make a `view` embed edit
  its circuit. `setValue` may target any part's property, or a
  **host input** part (Section 9.3), which is how a page drives a circuit
  from its own controls.
- Outgoing messages are posted to the recorded parent origin, never to
  `"*"`, so circuit data never leaks to an unexpected page.

## 4. The lesson engine

### 4.1 The lesson file

| Option | For | Against | Verdict |
|---|---|---|---|
| **YAML with a published JSON Schema** | Pleasant to write by hand; comments allowed; teachers can copy a step and edit it; the schema gives editor autocompletion and validation (LES-16) | Parser size (loaded only in lesson mode); YAML's implicit typing, which the schema catches | **Chosen** |
| Markdown with directive blocks | Feels like the textbook's own pages | Step structure, checks, and permissions are data, not prose; hard to validate reliably | Rejected |
| JSON | Same format as circuits | No comments; unpleasant to write by hand | Rejected |

A short example:

```yaml
lesson: current-is-not-used-up
title: Is current used up by a bulb?
time: 10 min
objectives: [Predict and measure current on both sides of a lamp]
concepts: [Electric Current, Series Circuit]          # learning-graph concept names
circuit: circuits/one-lamp.circuit.json
permissions:
  palette: [ammeter]
  tools: [select, probe-i]
  locked: [V1, L1]
steps:
  - read: "A 9 V battery lights one lamp. We will compare the current before and after the lamp."
    spotlight: [L1]
  - predict-choice:
      prompt: "Compared with the current entering L1, the current leaving it is..."
      options: [larger, the same, smaller]
      blind: [readouts, animation]                     # LES-03
  - do:
      prompt: "Place a current probe on each side of L1."
      check:
        all:
          - probe: { quantity: current, on: wire, touching: L1.1 }
          - probe: { quantity: current, on: wire, touching: L1.2 }
  - observe: { run-for: 0.5 s, compare-with: 2 }        # shows step 2's prediction beside the result
  - explain: { prompt: "Why are the two currents equal?", report-text: false }   # XAP-05
```

**A lesson file cannot run code** (LES-02). Every field is data from a
closed vocabulary of step types and check types; there is no expression
language beyond comparison operators and tolerances. The loader
validates the schema, then checks the lesson against its circuit
(unknown labels, impossible checks) and lists every problem for the
author (LES-16).

### 4.2 The step machine

```ts
interface LessonEngine {
  load(lesson: LessonFile, circuit: CircuitDocument): LessonValidation;
  readonly step: { index: number; count: number; status: "active" | "complete" };
  next(): void;
  back(): void;
  resetStep(): void;              // restores the document snapshot taken when the step began (LES-12)
  revealHint(): void;             // LES-10
  showMe(): void;                 // performs the step as a document transaction
  submit(answer: Answer): void;   // predictions, measurements, explanations
}
```

On entering a step the engine:

1. snapshots the document (for Reset Step);
2. computes the step's **capability set** — including `hidden` for
   blind predictions and disabling Run when the step requires a
   prediction first (LES-03) — and hands it to the shell;
3. sets spotlights (LES-09);
4. subscribes the step's checks to the data they need.

### 4.3 Checks

Each check type in LES-06 compiles to a predicate over a read-only
**lesson context**:

```ts
interface LessonContext {
  doc: CircuitDocument;
  compiled: CompiledCircuit;      // nodes and connectivity
  live: LiveValues;               // latest frame
  history: HistoryStore;          // for "within tolerance over a time span"
  measure: MeasurementLibrary;    // for RMS, frequency, and the rest
  analysesRun: AnalysisKind[];
  simTimeRun: number;             // for "has run for at least"
}
```

Checks are re-evaluated whenever a patch or frame could change their
answer, at most ten times a second, so a Do step completes the moment
the change is made (LES-08). Targeted feedback (LES-11) is attached
either to a check that is *true* in a wrong state or to a diagnostic by
its `id` (for example, `ammeter-in-parallel`). Test-bench checks run a
truth-table job in the analysis worker
([History §5.2](history-and-analysis.md#52-the-job-interface)).

### 4.4 Random faults

A Troubleshoot step with random faults (LES-07) picks one fault with a
generator seeded by the learner's identifier and the lesson id, so the
choice is stable for one learner and differs between classmates. The
fault is applied as a **hidden overlay in the netlist compiler** (for
example, "treat R2 as open"), not as a change to the document. It
therefore cannot be undone, does not appear in the inspector, and is not
written to saved files or share links, so the answer cannot leak.

### 4.5 Predictions and progress

Predictions are stored with the step that made them and shown by later
Observe steps (LES-04). Sketch predictions are stored in the lane's own
units and time scale and drawn as a sketch lane
([Rendering §5.6](rendering.md#56-other-lane-kinds)). Progress and
predictions are saved to the `lessons` store after every step
(LES-13).

### 4.6 Author mode

Author mode (LES-15, a SHOULD) is deferred to a later design pass. The
check vocabulary is designed so that each check type can be generated
from a selection ("Check this value" on a selected part), which is what
author mode will need.

## 5. The xAPI reporter

### 5.1 Turning reporting on

Reporting is off unless both the embed URL has `xapi=1` **and** the host
sends `configureXapi` (XAP-01). The configuration chooses one of two
transports:

| Transport | How it works |
|---|---|
| **Relay** (recommended for the book) | Statements go to the host page through the bridge; the page's own learning-record-store connection sends them. Credentials never enter the simulator. |
| **Direct** | The simulator posts statements to the named LRS endpoint with the credentials from the `configureXapi` message. Credentials in the URL are refused (XAP-02). |

While reporting is on, the status bar shows "Activity recording on",
which explains in plain words what is recorded (XAP-03).

### 5.2 From actions to statements

The reporter does not watch the user interface. It listens to three
streams that already exist:

- **executed commands** from the command registry (run, pause, reset,
  analyses);
- **document patches** from the edit system (parts added or removed,
  values changed, switches flipped, probes placed);
- **lesson events** from the lesson engine (predictions, checks, hints,
  progress, completion).

A mapping table turns each event into a statement with the verb, object,
and result data from Section 21.2. A **coalescer** merges continuous
actions (slider drags, repeated running) so that no single continuous
action produces more than one statement per second, and a slider drag
produces exactly one statement when it ends (XAP-08).

### 5.3 Identity and identifiers

- The **actor** comes only from the host's `configureXapi`; without one,
  the reporter uses an anonymous random identifier kept in this browser
  (XAP-04).
- **Activity identifiers** are built from the page address (without query
  or fragment), the embed id, and the circuit or lesson id, so the same
  activity on the same page always has the same identifier (XAP-07).
- Free-text answers are included only when the lesson marks them for
  reporting (XAP-05).

### 5.4 Never in the way

Statements are built and queued in idle time, never on the frame path.
Unsent statements wait in the `xapiQueue` store, are retried with
back-off, and are dropped after seven days (XAP-06).

## 6. Open questions

1. **The book's existing xAPI convention.** This book's MicroSims already
   have an "instrumented" status in `mkdocs.yml`, using a shared
   `lrs-sim.js` script and an `?xapi=teaching` URL switch. Should the
   simulator's relay transport and `embed.js` reuse that script and
   convention, so that MicroSims and simulator embeds report the same
   way? This design recommends it, once the two conventions have been
   compared in detail.
2. **Lesson file location.** Should lesson files live beside the chapter
   that uses them (`docs/chapters/…/lessons/`) or in one shared folder?
