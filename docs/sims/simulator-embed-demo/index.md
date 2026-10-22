---
title: Embedding the Simulator
description: How to place a working circuit simulation on any page of this book, with two live examples and a reference for every embed parameter and host message.
status: built
---

# Embedding the Simulator

Any page in this book can hold a working circuit right next to the text that
explains it. You write a short `<div>`, and the book's helper script
(`docs/js/circuit-embed.js`, loaded on every page) turns it into a sized
simulator iframe.

## Example 1: The Built-In RC Circuit

With no circuit named, the simulator shows its built-in RC charging circuit.
This embed uses `run` mode, so you can run it, flip the switch, change values
in the inspector, and add probes, but you cannot add, delete, or rewire parts.

<div class="circuit-embed" data-id="demo-rc" data-mode="run" data-title="RC charging circuit"></div>

```html
<div class="circuit-embed" data-id="demo-rc" data-mode="run"
     data-title="RC charging circuit"></div>
```

Like every simulation, it loads **paused** at t = 0. Press **Run** to start
it. Close the switch S1 and watch the capacitor voltage rise with a time
constant of RC = 1 s.

## Example 2: A Series LRC Circuit From the Example Library

Set `data-example` to a file name from the example library to load one of Paul
Falstad's classic circuits. This one shows only the chart and status bar
around the circuit, and is view-only.

<div class="circuit-embed" data-id="demo-lrc" data-example="lrc.txt" data-mode="view" data-panels="topbar,chart,status" data-title="Series LRC circuit"></div>

```html
<div class="circuit-embed" data-id="demo-lrc" data-example="lrc.txt"
     data-mode="view" data-panels="topbar,chart,status"
     data-title="Series LRC circuit"></div>
```

Every embed shows **Reset to original**, which restores the circuit as the page
published it, and **Open in full simulator**, which opens the circuit, with
your changes, in a new tab where you can edit everything.

## Embed Parameters

Each `data-` attribute becomes a URL parameter of the same name on the
simulator iframe. You can also write the iframe yourself, as
`<iframe class="circuit-sim" src="../../simulator/?example=lrc.txt&mode=run&id=ch3-lrc">`;
the helper script still sizes it.

| Attribute | Values | Default | Effect |
|---|---|---|---|
| `data-example` | File name in the example library, such as `lrc.txt` | none | Loads a library circuit |
| `data-circuit` | URL of a circuit file (native or Falstad text) | none | Loads that circuit |
| `data-c` | Native share-link payload | none | Loads a shared circuit |
| `data-ctz` | Falstad compressed circuit text | none | Loads a Falstad link's circuit |
| `data-mode` | `edit`, `run`, `view` | `edit` | What the reader may do (see below) |
| `data-panels` | Comma list of `topbar`, `palette`, `inspector`, `chart`, `status` | all the mode allows | Shows only these panels |
| `data-layout` | `auto`, `side`, `stacked`, `circuit`, `chart` | `auto` | Forces an arrangement |
| `data-lock` | Comma list of part labels, or `all` | none | Locks those parts against editing |
| `data-speed` | 1 to 100 | from the circuit | Simulation speed setting |
| `data-theme` | `auto`, `light`, `dark` | follows the page | Color theme |
| `data-id` | Short name | generated | Names the embed for messages and xAPI |
| `data-xapi` | `1`, `0` | `0` | Allows xAPI reporting once the page configures it |
| `data-allow` | Comma list of origins | none | Other page origins allowed to send messages |
| `data-height` | Pixels | from the simulator | Fixes the iframe height |
| `data-title` | Text | "Circuit simulation" | The iframe's accessible title |

The modes:

| Mode | The reader can |
|---|---|
| `edit` | Do everything the full simulator allows |
| `run` | Run, pause, reset, flip switches, change values of unlocked parts, add probes; not add, delete, or rewire parts |
| `view` | Watch, pause, and step; no changes |

Parameters the simulator does not know are ignored, and invalid values fall
back to their defaults with a warning (shown as a small ⚠ count in the embed
bar). The `autorun` parameter is read but has no effect: every simulation
starts paused. An embed scrolled out of view, or in a hidden tab, stops drawing
and pauses its simulation until it comes back.

## Controlling an Embed From the Page

The helper script exposes `CircuitEmbed.get(id)` for page scripts. Messages are
accepted only from a page with the same origin as the simulator, or from an
origin named in `data-allow`.

```js
const sim = CircuitEmbed.get("demo-rc");
sim.setSwitch("S1", true);
sim.setValue("R1", "resistance", 4700);
sim.run();
sim.getState().then((state) => console.log(state.probes));
sim.on("runStateChanged", (p) => console.log(p.runState));
```

| Page to simulator | Payload |
|---|---|
| `run`, `pause`, `step` | none |
| `reset` | `{ original: true }` restores the published circuit |
| `setValue` | `{ part, prop, value }` (part by label or id) |
| `setSwitch` | `{ part, closed }` |
| `addProbe` | `{ part }` adds a voltage probe across it |
| `loadCircuit` | `{ example }`, `{ url }`, `{ c }`, or `{ text, name }` |
| `configureXapi` | `{ transport: "relay" }` or `{ transport: "direct", endpoint, auth }`, optional `actor` |
| `getState` | none; replies with the circuit, run state, time, and probe values |

| Simulator to page | Payload |
|---|---|
| `ready` | mode, edit level, panels |
| `preferredHeight` | `{ height }`; the helper resizes the iframe |
| `runStateChanged` | `{ runState }` |
| `circuitChanged` | `{ source, changes }` |
| `xapiStatement` | `{ statement }`, also dispatched as a `circuit-embed:xapi` DOM event |
| `reply` | `{ ok, result }` or `{ ok: false, error }` for requests |

Every message uses the envelope
`{ protocol: "circuit-simulator", version: 1, embedId, type, requestId?, payload }`.
The full design is in
[Embedding, Lessons, and xAPI](../../design/embedding-lessons-xapi.md).

## Recording Learning Activity

xAPI reporting is off unless the embed has `data-xapi="1"` **and** the page
sends `configureXapi`. With the relay transport, each statement comes back to
the page as a `circuit-embed:xapi` event, so the page's own learning record
store connection can forward it; credentials never enter the simulator. While
reporting is on, the embed shows an **Activity recording on** indicator that
explains what is recorded.

## Credits

The series LRC example, `lrc.txt`, is one of the example circuits from Paul
Falstad's [CircuitJS1](https://github.com/pfalstad/circuitjs1) simulator, from
the folder
[`src/com/lushprojects/circuitjs1/public/circuits/`](https://github.com/pfalstad/circuitjs1/tree/master/src/com/lushprojects/circuitjs1/public/circuits).
The book's build downloads that folder unchanged into the simulator's example
library and opens the file through the simulator's Falstad importer. The
example circuits are by Paul Falstad and are used under the
[CircuitJS1 license](https://github.com/pfalstad/circuitjs1/blob/master/README.md#license);
see also Falstad's [licensing terms](https://www.falstad.com/licensing.html).
The built-in RC circuit and the simulator itself are part of this book.
