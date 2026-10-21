---
title: Circuit Simulator Architecture
description: An interactive architecture diagram of the circuit simulator. Click any of its twenty components to see its role, or step through what happens when a student drags a slider.
image: /sims/simulator-architecture/simulator-architecture.png
og:image: /sims/simulator-architecture/simulator-architecture.png
twitter:image: /sims/simulator-architecture/simulator-architecture.png
social:
   cards: false
status: built
quality_score: 100
---

# Circuit Simulator Architecture

<iframe src="main.html" height="557px" width="100%" scrolling="no"></iframe>

[Run the Circuit Simulator Architecture MicroSim Fullscreen](./main.html){ .md-button .md-button--primary }
<br/>
[Edit in the p5.js Editor](https://editor.p5js.org/)

## About This MicroSim

This MicroSim is the interactive version of the architecture diagram in
the [Circuit Simulator Design](../../design/index.md#3-architecture-at-a-glance).
It shows the twenty components of the simulator, which thread each one
runs on, and the data that flows between them.

- The **main thread** holds everything the reader sees and touches: the
  interface, the circuit model, the results and drawing components, and
  storage and reporting.
- The **worker threads** hold the numerical work: the live simulation
  worker (the engine and its run loop) and the analysis worker, which is
  started only when an analysis tab is opened.
- The **Element Library** straddles the boundary, because each part
  type's plug-in is split into pieces that load on one thread or the
  other.
- **Dashed arrows** are data that crosses between threads as worker
  messages.

## How to Use

1. **Click any component** (or choose it from the **Component** list) to
   open an info box with its role, what it owns, what it connects to, and
   the specification requirements it serves. Its connections are
   highlighted and labelled; everything else fades.
2. Use **Read about the …** to jump to that component's section of the
   design.
3. Press **Next step** to trace one edit through the system: a student
   dragging a slider that changes a resistor while the circuit runs. Each
   of the seven steps highlights the components and data flows involved.
   **Back** steps backward.
4. Click empty space or press Esc to close the info box.

## Iframe Embed Code

You can add this MicroSim to any web page by adding this to your HTML:

```html
<iframe src="https://dmccreary.github.io/circuit-simulator/sims/simulator-architecture/main.html"
        height="557px"
        width="100%"
        scrolling="no"></iframe>
```

## Lesson Plan

### Grade Level

Undergraduate, and contributors to the simulator project

### Duration

10–15 minutes

### Prerequisites

- What a web browser's main thread and a web worker are
- The idea of a circuit simulation that steps through time

### Learning Objective

Students will be able to **explain** the role of each major component of
the circuit simulator and **trace** how a single edit moves from the
interface, through the circuit model and the simulation worker, and back
to the screen.

### Activities

1. **Exploration** (5 min): Click each component in the main thread, then
   each one in the worker threads. For each, say in one sentence what it
   owns.
2. **Guided practice** (5 min): Step through **Trace an edit**. Before
   pressing Next each time, predict which component acts next.
3. **Assessment** (5 min): Without the MicroSim, sketch the path of a
   *wiring* change instead of a value change. Which step differs? (Answer:
   in step 3 the Netlist Compiler must recompile and send a new netlist
   with an identity map, so the engine can carry capacitor charge across.)

### Assessment

- Can the student name the three kinds of state (document, simulation,
  session) and which component owns each?
- Can the student explain why the simulation runs in a worker and not on
  the main thread?
- Can the student explain why scrubbing publishes historical frames on the
  Frame Bus?

## Source

The components, their roles, and the seven-step trace are taken from
[Circuit Simulator Design §3](../../design/index.md#3-architecture-at-a-glance),
specifically the component table in §3.1 and the walk-through in §3.2.
Each component's info box summarizes its own design page.

## References

1. [Circuit Simulator Design](../../design/index.md) — the architecture
   this MicroSim illustrates.
2. [Circuit Simulator Specification](../../specifications/index.md) — the
   requirements each component serves.
3. [Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
   — MDN, on running scripts in background threads.
