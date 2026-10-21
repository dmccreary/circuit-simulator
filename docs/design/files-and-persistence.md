---
title: Files and Persistence Design
description: Design of the native circuit file format, share links, Falstad import, the built-in example library, browser storage and recovery, and offline operation.
---

# Files and Persistence

There are no accounts and no server (Section 18). A student's work lives
in three places: **files** they save, **links** they share, and their
own **browser storage**. This page designs all three, plus the Falstad
importer that opens the book's example library.

## 1. Components

| Component | Responsibility |
|---|---|
| **Format codecs** (`formats` package) | Pure functions that convert between a `CircuitDocument` and the native file, a share link, Falstad text, Falstad XML, and Falstad links. No browser APIs, so they run in the Node test suite. |
| **File service** | Opening and saving files with the browser's file APIs, drag-and-drop, and the unsaved-work guard (FIL-04). |
| **Persistence service** | Everything in IndexedDB: My circuits, autosave and recovery, My parts, lesson progress, the xAPI queue (FIL-08, FIL-09, PRF-06). |
| **Service worker** | Offline operation and the cached example library (PRF-07). |

## 2. The circuit file

### 2.1 Options considered

FIL-01 asks for a documented, versioned, human-readable text format in
which a reader can see each part, its value, and its connections.

| Option | For | Against | Verdict |
|---|---|---|---|
| **JSON with a published JSON Schema** | Unambiguous; parsed natively and fast; the schema validates files and documents the format at once; the same structure feeds share links | Wordier than the alternatives; no comments | **Chosen** |
| YAML | Easier to read and edit by hand; allows comments | Parsing surprises (implicit typing of values such as `no` or `1e3`); a parser adds roughly 40 kB; files are written by the program, so hand-editing matters less | Rejected for circuits; used for lessons, which people do write by hand ([Embedding §4.1](embedding-lessons-xapi.md#41-the-lesson-file)) |
| A SPICE-like line format | Very compact; familiar to engineers | Needs its own documented grammar and hand-written parser; awkward for probes, lanes, sliders, and settings | Rejected |

### 2.2 Shape of a file

Files use the extension `.circuit.json` and are pretty-printed with one
part per line, so a file opened in a text editor reads like a parts list:

```json
{
  "format": "circuit-simulator",
  "formatVersion": 1,
  "meta": { "title": "RC charging", "description": "Close S1 and watch C1 charge." },
  "settings": { "realisticParts": false, "realisticRatings": false, "start": "zero", "seed": 1 },
  "parts": [
    { "id": "p1", "type": "battery",   "label": "V1", "at": [0, 0],  "rot": 90, "props": { "voltage": 10 } },
    { "id": "p2", "type": "switch",    "label": "S1", "at": [0, -4], "rot": 0,  "props": { "closed": false } },
    { "id": "p3", "type": "resistor",  "label": "R1", "at": [4, -4], "rot": 0,  "props": { "resistance": 10000 } },
    { "id": "p4", "type": "capacitor", "label": "C1", "at": [8, -4], "rot": 90, "props": { "capacitance": 0.0001 } },
    { "id": "p5", "type": "ground",    "label": "",   "at": [0, 4] }
  ],
  "wires": [
    { "id": "w1", "points": [[0, 0], [0, 4]] }
  ],
  "probes": [
    { "id": "r1", "name": "V1", "quantity": "voltage", "target": { "kind": "across", "part": "p4" }, "lane": "l1" }
  ],
  "lanes": [ { "id": "l1", "kind": "analog" } ],
  "view": { "center": [4, 0], "zoom": 1 },
  "netlist": {
    "_note": "Written for readers only and ignored when the file is opened.",
    "V1": ["N1", "GND"], "S1": ["N1", "N2"], "R1": ["N2", "N3"], "C1": ["N3", "GND"]
  }
}
```

Design notes:

- **Values are numbers in SI base units** (`0.0001`, not `"100u"`), so
  a file never depends on a locale or on the number parser.
- **Connections are visible.** Geometry is the truth on load, but every
  save also writes a `netlist` section that lists each part's nodes. It
  is regenerated on every save and ignored on load, so it can never
  disagree with the drawing. It exists so that a person reading the file
  can see the connections (FIL-01).
- **Identifiers** (`id`) are stable and internal; **labels** are what the
  student sees ([Circuit Model §2.1](circuit-model.md#21-entities)).
- **Saved part state** (capacitor voltages and the like) is written as
  `savedState` on each part, matching Falstad's behavior (FIL-17).

### 2.3 Versions

Each released change to the format increases `formatVersion` and ships
a **migration** function from the previous version. Opening a file runs
the chain of migrations up to the current version (FIL-03, backward).
A file from a *newer* version is opened as far as possible: unknown part
types become placeholders that keep their raw data, so saving again does
not lose it, and a notice explains what happened (FIL-03, forward).

The JSON Schema for each version is published with the simulator, next to
a readable description of the format.

## 3. Share links

A share link carries the whole circuit, compressed, with no server
storing anything (FIL-05).

| Choice | Decision | Reason |
|---|---|---|
| Compression | `deflate-raw` through the browser's built-in `CompressionStream` | Better ratio than lz-string and no library to download. (lz-string is still needed, but only for *reading* Falstad's `ctz` links.) |
| Encoding | base64url | Safe in URLs with no escaping |
| Where in the link | In the **fragment**: `…/simulator/#c=…` | The fragment is never sent to the web server, so circuits are not written to server logs and server URL-length limits do not apply. The `c` query parameter (Section 19.1) is also accepted, for embeds. |
| Size limit | Warn above 8,000 characters (FIL-06) | Many chat and email tools truncate longer links |

Opening a link always opens a copy (FIL-07): the document is loaded
into a new My circuits entry, and the link itself is never changed.

## 4. Falstad compatibility

### 4.1 The importer

```text
Falstad text (`$` line + one element per line) ─┐
Falstad XML (`<cir …>`) ────────────────────────┼─> FalstadCircuit ─> mapper ─> CircuitDocument + import report
Falstad link (`ctz`, `cct`, `startCircuit`) ────┘    (neutral, parsed)
```

1. **Parsers** turn each Falstad format into one neutral structure:
   a settings record, a list of raw elements (type code, the two points
   Falstad uses to place every element, flags, and parameters), scopes,
   sliders, hints, and subcircuit models.
2. **The mapper** converts each raw element using the `falstad` section
   of the matching element descriptor
   ([Circuit Model §5.1](circuit-model.md#51-the-descriptor)), so the
   knowledge of how to import a part lives with that part. It converts
   Falstad's two-point placement on a 16-pixel grid into a position,
   orientation, and length in grid units (FIL-17).
3. **Scopes** become probes and lanes showing the same quantities;
   docked scopes become chart lanes and on-canvas scopes become lanes on
   the canvas (CHT-35). **Sliders** become sliders, **hints** become a
   line in the description, and the **settings line** becomes circuit
   settings (time step, speed, current speed, voltage color range).
4. **Unsupported elements** become placeholders with the same terminals,
   drawn in the warning color, and are listed in an **import report**
   (FIL-16).

Exporting to Falstad's format (FIL-20, a MAY) is deferred. Because each
descriptor's mapping is written as a two-way table rather than as code,
export can be added later without reworking the importer.

### 4.2 The built-in example library

The 366 examples in the [List of Circuits](../list-of-circuits.md) are
shipped as static files beside the simulator, with an index generated at
build time from `src/setuplist.txt` in
[hausen/circuit-simulator](https://github.com/hausen/circuit-simulator),
which keeps Falstad's categories (FIL-18). The library browser
(FIL-13) and the `example` parameter (FIL-19) both read that index.
Every example's credit to Paul Falstad and its license notice travel
with it.

Two automated tests protect the library: every file must open without an
error (acceptance test 20), and 20 author-chosen examples must match
reference waveforms captured from Falstad's simulator within 1%
(acceptance test 21).

## 5. Browser storage

### 5.1 Options considered

| Option | Verdict |
|---|---|
| `localStorage` for everything | Rejected. About 5 MB per site, strings only, and blocking; thumbnails and many circuits would not fit. |
| **IndexedDB** | **Chosen** for everything except learner settings. Large quota, structured records, binary thumbnails, transactions. |
| Origin Private File System | Rejected for now. Good for large binary files, but our records are many small structured objects, which IndexedDB handles more naturally. |

Learner settings stay in `localStorage` because they are tiny and must be
read synchronously before the first frame
([Application Shell §8](app-shell.md#8-settings)).

### 5.2 Stores

| IndexedDB store | Key | Contents | Requirement |
|---|---|---|---|
| `circuits` | Circuit id | Document, name, thumbnail (PNG), last changed | FIL-08 |
| `recovery` | Tab session id | The latest document of each open tab, with its file name if any | FIL-09, PRF-06 |
| `embeds` | Page address + embed id + hash of the original circuit | The reader's changes to an embedded circuit | PRF-06 |
| `subcircuits` | Definition id | My parts definitions | EDT-35 |
| `lessons` | Page address + lesson id | Lesson progress and stored predictions | LES-13 |
| `xapiQueue` | Sequence number | Statements waiting to be sent, with their age | XAP-06 |

### 5.3 Autosave and recovery

- After each committed transaction, the persistence service writes the
  document to `recovery` after a one-second pause, and again at once
  when the page is hidden. A crash, closed tab, or reload therefore loses
  at most a second of work (PRF-06).
- On startup, any `recovery` entries left by sessions that did not close
  cleanly are offered back (FIL-09).
- Several tabs coordinate through a `BroadcastChannel`, so two tabs never
  overwrite each other's recovery entry and a circuit open in two tabs is
  flagged.
- Embedded circuits are keyed by the hash of the **original** circuit as
  well as the page and embed id. If the author later changes the circuit
  on that page, the reader's old changes are not applied to a different
  circuit.
- The first time a student saves to My circuits, the app asks the
  browser to make storage **persistent**, so the browser does not evict it
  under storage pressure, and explains that the list lives only in this
  browser (FIL-08).

### 5.4 Opening and saving files

Where the File System Access API exists (Chrome and Edge), Save writes
back to the same file after the first time. Elsewhere (Firefox and
Safari), Save downloads the file. Open uses a file picker everywhere,
and dropping a file on the simulator opens it (FIL-04). Every path that
replaces the current circuit first checks for unsaved changes and asks.

## 6. Offline operation

A **service worker** scoped to the simulator's own folder (so it never
affects the rest of the book) caches the application on first visit and
the example library in the background afterward (PRF-07).

- **Updates never interrupt work.** When a new version is available, the
  status bar offers "A new version is ready — reload when convenient".
  The app never reloads itself mid-session.
- **Embeds share the cache**, because chapter embeds load the same
  simulator files from the same origin
  ([Overview §6.1](index.md#61-where-the-built-app-lives-on-the-site)).

## Credits

The example library and the Falstad formats come from Paul Falstad's
[circuit simulator](https://www.falstad.com/circuit/) and its browser
port, [CircuitJS1](https://github.com/pfalstad/circuitjs1), which is
free software under the [GNU General Public License, version 2 or
later](https://github.com/pfalstad/circuitjs1/blob/master/README.md#license).
The category list is read from `src/setuplist.txt` in Rodrigo Hausen's
[hausen/circuit-simulator](https://github.com/hausen/circuit-simulator)
fork, which follows Falstad's [licensing
terms](https://www.falstad.com/licensing.html). See the [List of
Circuits](../list-of-circuits.md#credits) for the full credits.
