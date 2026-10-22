import { createDocument, type CompiledCircuit, type PatchBatch } from "@cs/model";
import type { Command, Frame, WorkerMessage } from "@cs/worker";
import { SimClient, type ChangeKind, type WorkerPort } from "../src/sim/sim-client";
import { FrameBus } from "../src/frame-bus";
import { channelValue } from "../src/live";

function fakeCompiled(n: number, channels: Record<string, unknown> = {}): CompiledCircuit {
  return {
    netlist: { nodeCount: n, nodeNames: ["GND"], elements: [], settings: createDocument().settings },
    nodes: [],
    pointToNode: new Map(),
    segments: [],
    channels,
    identity: {},
    diagnostics: [],
  } as unknown as CompiledCircuit;
}

function setup(kind: ChangeKind) {
  const sent: Command[] = [];
  const port: WorkerPort = { postMessage: (m) => void sent.push(m), onmessage: null };
  let compiles = 0;
  const frames: Frame[] = [];
  const client = new SimClient(
    port,
    {
      compile: (d) => fakeCompiled(++compiles, Object.fromEntries(Object.keys(d.probes).map((id) => [id, { id, kind: "voltage", a: 1, b: 0 }]))),
      classify: () => kind,
      paramChanges: () => [{ element: "R1", param: "resistance", value: 2000 }],
      decodeFrame: (b) => ({ frame: new Uint32Array(b)[0] }) as unknown as Frame,
    },
    { frame: (f) => frames.push(f) },
  );
  return { sent, port, client, frames };
}

const batch = (path: (string | number)[]): PatchBatch => ({ patches: [{ op: "set", path, value: 1 }], provisional: true, source: "edit" });

describe("SimClient", () => {
  test("load compiles and sends load with channels", () => {
    const { sent, client } = setup("none");
    client.load(createDocument());
    expect(sent.map((c) => c.type)).toEqual(["load"]);
  });

  test("param change sends setParams, not a new netlist", () => {
    const { sent, client } = setup("params");
    client.load(createDocument());
    client.applyBatch(batch(["parts", "R1", "props", "resistance"]), createDocument());
    expect(sent.map((c) => c.type)).toEqual(["load", "setParams"]);
  });

  test("topology change sends replaceNetlist with identity; new probe also sends setChannels", () => {
    const { sent, client } = setup("topology");
    client.load(createDocument());
    const doc = createDocument();
    doc.probes.P1 = {} as never;
    client.applyBatch(batch(["probes", "P1"]), doc);
    expect(sent.map((c) => c.type)).toEqual(["load", "replaceNetlist", "setChannels"]);
  });

  test("frames are decoded, published, and acked", () => {
    const { sent, port, frames } = setup("none");
    const buf = new Uint32Array([42]).buffer;
    port.onmessage!({ data: { type: "frame", buffer: buf } as WorkerMessage } as MessageEvent<WorkerMessage>);
    expect(frames[0].frame).toBe(42);
    expect(sent).toEqual([{ type: "ackFrame", frame: 42 }]);
  });
});

describe("FrameBus and channelValue", () => {
  test("fans out frames and reads the newest sample of a channel", () => {
    const bus = new FrameBus();
    const got: number[] = [];
    bus.subscribe((f) => got.push(f.frame));
    const f = {
      frame: 1,
      channelIds: ["a", "b"],
      times: new Float64Array([0, 1, 2]),
      samples: new Float64Array([1, 2, 3, 10, 20, 30]),
    } as unknown as Frame;
    bus.publish(f);
    expect(got).toEqual([1]);
    expect(channelValue(bus.latest, "b")).toBe(30);
    expect(channelValue(bus.latest, "zzz")).toBeUndefined();
  });
});
