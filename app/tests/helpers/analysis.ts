// The Analyses panel session (dc, ac, sweeps, spectrum) on an in-process
// analysis worker, as in packages/app/test/analysis.test.ts.

import { getModelFactory } from "@cs/elements/models";
import type { AnalysisResult } from "@cs/engine";
import { AnalysisHost, type AnalysisReply, type AnalysisRequest } from "@cs/worker";
import type { AppController } from "../../packages/app/src/controller";
import type { AnalysisPort } from "../../packages/app/src/analysis/service";
import { installAnalysisSession } from "../../packages/app/src/analysis/session";
import type { AnalysisTab } from "../../packages/app/src/analysis/settings";

export function analysisPanel(c: AppController) {
  const tasks: (() => void)[] = [];
  const create = (): AnalysisPort => {
    const port: AnalysisPort = {
      onmessage: null,
      postMessage: (m: AnalysisRequest) => tasks.push(() => host.handle(structuredClone(m))),
      terminate() {},
    };
    const host = new AnalysisHost({
      post: (m: AnalysisReply) => tasks.push(() => port.onmessage?.({ data: structuredClone(m) } as MessageEvent<AnalysisReply>)),
      schedule: (fn) => tasks.push(fn),
      getModelFactory,
    });
    return port;
  };
  const flush = async () => {
    for (let i = 0; i < 1e6 && tasks.length; i++) {
      tasks.shift()!();
      if (tasks.length === 0) await Promise.resolve();
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  const session = installAnalysisSession(c, create);
  /** Save settings for a tab (as the panel's controls do) and run it to completion. */
  const run = async <R extends AnalysisResult>(tab: AnalysisTab, settings?: Record<string, unknown>): Promise<R> => {
    if (settings) c.edits.edit({ key: "analysis.settings" }, (d) => void ((d.analyses as Record<string, unknown>)[tab] = { ...((d.analyses as Record<string, Record<string, unknown>>)[tab] ?? {}), ...settings }));
    session.open(tab);
    session.run(tab, true);
    await flush();
    const st = session.ui.get().tabs[tab];
    if (st.status !== "done") throw new Error(`${tab}: ${st.status} ${st.error ?? ""}`);
    return st.result as R;
  };
  return { session, run, flush };
}
