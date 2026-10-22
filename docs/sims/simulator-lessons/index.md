---
title: Guided Simulator Lessons
description: How a short YAML file turns a circuit into a guided predict, observe, explain activity, with a live Ohm's law lesson and a reference for every step type and check.
status: built
---

# Guided Simulator Lessons

A lesson turns a circuit into a short guided activity. The learner reads a
step, commits to a prediction, changes the circuit, runs it, and types what
the meters show. A panel beside the schematic shows **Step n of N**, enables
**Next** only when the step is done, and offers hints and a **Reset step**
button that puts the circuit back the way the step found it.

## Try It: Ohm's Law

This lesson asks you to measure the current through a 1 kΩ resistor at three
voltages and to predict the current before you measure it. Your progress is
saved in this browser, so you can leave and come back.

<div class="circuit-embed" data-id="lesson-ohms-law" data-lesson="ohms-law.yaml" data-height="640" data-title="Ohm's law lesson"></div>

```html
<div class="circuit-embed" data-id="lesson-ohms-law"
     data-lesson="ohms-law.yaml" data-height="640"></div>
```

A second lesson, `rc-charging.yaml`, asks you to predict the capacitor voltage
after one time constant, then pauses the simulation at t = τ so you can check
the 63% rule. Open either lesson full-size with
[`simulator/?lesson=ohms-law`](../../simulator/?lesson=ohms-law) or
[`simulator/?lesson=rc-charging`](../../simulator/?lesson=rc-charging).

## The Lesson File

A lesson is one YAML file. It cannot run code: every field comes from the
fixed vocabulary below, and the simulator checks the file when it loads and
lists any problem with its line number. Here is a shortened version of the
Ohm's law lesson:

```yaml
lesson: ohms-law                    # kebab-case id, used for saved progress
title: Ohm's law
time: 10 min
objectives: [Measure the current through a resistor]
concepts: [Ohm's Law, Electric Current]   # names from the learning graph
circuit: circuits/ohms-law.circuit.json   # relative to the lesson file

permissions:
  edit: values                      # full, values, or none
  palette: []                       # part types offered; [] hides the palette
  tools: [select]
  locked: [R1, A1]                  # labels the learner cannot change

steps:
  - read: |
      A DC source **V1** pushes current through R1. Ohm's law: `I = V / R`.
    spotlight: [R1, A1]

  - id: predict-10v
    predict-number:
      prompt: If you double V1 to 10 V, what current will A1 read?
      unit: A
      blind: [readouts, traces]     # hide values until the prediction is in

  - do:
      prompt: Set V1 to 10 V in the Inspector.
      check:
        property: { part: V1, prop: voltage, equals: 10 V, tolerance: 1% }
    hints: [Click V1, then type 10 into its Voltage field.]

  - observe:
      prompt: Press Run and compare.
      run-for: 0.2 s
      compare-with: predict-10v     # shows the prediction beside the result
      show: { part: A1, quantity: current }

  - measure:
      prompt: Type the current A1 reads.
      value: { part: A1, quantity: current }
      tolerance: 2%
```

The full lessons are in the repository at
[`app/public/lessons/`](https://github.com/dmccreary/circuit-simulator/tree/main/app/public/lessons),
and the JSON Schema that editors use for autocompletion is
[`lesson-v1.schema.json`](https://github.com/dmccreary/circuit-simulator/blob/main/app/packages/lesson/src/schema/lesson-v1.schema.json).
Add this first line to a lesson file to get autocompletion in VS Code:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/dmccreary/circuit-simulator/main/app/packages/lesson/src/schema/lesson-v1.schema.json
```

## Step Types

Each step has exactly one type key. Step text is Markdown-lite: paragraphs,
`**bold**`, `*italic*`, `` `code` ``, and bulleted or numbered lists.

| Step | What the learner does | When it is complete |
|---|---|---|
| `read` | Reads the text | At once; Next is enabled |
| `predict-number` | Types a value with units, such as `2.5 mA` | When a value is submitted |
| `predict-choice` | Picks one of the `options` | When a choice is submitted |
| `do` | Changes the circuit | The moment its `check` passes |
| `observe` | Runs the circuit for `run-for` simulated seconds | When that time has run; the simulation pauses |
| `measure` | Types a reading | When it is within `tolerance` of the true value |
| `explain` | Writes a sentence or picks one of the `options` | When an answer is submitted |
| `troubleshoot` | Selects the faulty part | When the right part is chosen |

Every step can also carry:

- `spotlight`: part labels to outline on the schematic, or controls such as
  `command:sim.runPause` and `palette:resistor`
- `hints`: up to three, revealed one at a time; hint use is recorded
- `feedback`: messages shown while a wrong state lasts, attached to a
  simulator warning (`diagnostic: ammeter-in-parallel`) or to a check
  (`when: { sim-time: 1.2 s }`)
- `permissions`: changes to the lesson's permissions for this step only
- `success`: the confirmation shown when the step completes

A `troubleshoot` step lists possible faults, such as `"R2 open"`,
`"C1 short"`, or `{ part: R1, kind: value, props: { resistance: 100k } }`.
Each learner gets one fault, chosen by a generator seeded from the learner and
the lesson, so classmates usually get different faults. The fault is hidden
from the inspector, saved files, and share links.

## Checks

A `do` step's `check` (and a feedback item's `when`) is one of these, and
checks combine with `all`, `any`, and `not`:

| Check | Example |
|---|---|
| `part` | `part: { type: ammeter, label: A1 }`, or `exists: false` |
| `property` | `property: { part: R1, prop: resistance, equals: 2.2k, tolerance: 5% }` |
| `switch` | `switch: { part: S1, closed: true }` |
| `connected` | `connected: { a: R1.2, b: GND }` (terminal numbers start at 1) |
| `probe` | `probe: { quantity: current, part: R1 }` |
| `value` | `value: { of: { part: C1, quantity: voltage }, equals: 6.32 V, tolerance: 4% }` |
| `measurement` | `measurement: { probe: V(C1), kind: rms, over: 1 s, above: 3 }` |
| `diagnostic` | `diagnostic: { id: no-ground, present: false }` |
| `sim-time` | `sim-time: 1 s` |
| `run-state` | `run-state: running` |

Comparisons accept `equals` with a `tolerance` (absolute such as `0.05 V`, or
relative such as `2%`), `above`, `below`, and `within: [min, max]`. Part
voltages and currents are magnitudes, so a check does not depend on which way
a part was drawn. Checks are re-evaluated only when the circuit changes or a
new frame of results arrives, at most ten times a second.

## Progress and Reporting

Progress, predictions, and hints are saved in the browser after every step and
restored when the learner returns to the same page. The last step shows a
summary of steps completed, predictions next to results, and hints used. When
the page enables xAPI, the simulator reports `attempted`, `answered`,
`progressed`, and `completed` statements, and the page receives a
`lessonProgress` message after every step:

```js
CircuitEmbed.get("lesson-ohms-law").on("lessonProgress", (p) => {
  console.log(`step ${p.step} of ${p.of}: ${p.status}`);
});
```

## Writing a Lesson

1. Build the circuit in the simulator and save it as a `.circuit.json` file
   next to the lesson file.
2. Open the lesson with `?lesson=` and expand **Author tools** in the lesson
   panel. Any problems in the file are listed there with line numbers.
3. Set up the circuit the way a step should end, select the parts that
   matter, and press **Copy step snapshot as YAML**. Paste the copied `do`
   step into the lesson and delete the checks you do not need.

The design behind this page is in
[Embedding, Lessons, and xAPI](../../design/embedding-lessons-xapi.md), and
the requirements are in Section 20 of the
[specification](../../specifications/index.md).
