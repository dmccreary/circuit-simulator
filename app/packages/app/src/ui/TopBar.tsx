import { Button, ToggleButton } from "react-aria-components";
import { formatValue } from "@cs/units";
import { useApp, useController } from "./context";
import { useLiveValue } from "../live";
import { t } from "../messages";
import type { ToolSpec } from "../app-state";
import { FileMenu } from "../files/FileMenu";
import { EditMenu } from "../edit/EditMenu";
import { ViewMenu } from "../layout/ViewMenu";
import { RealismBadge } from "../realism/RealismBadge";
import { AcNotice } from "../realism/AcNotice";

const SPEEDS: { value: number | "fit"; label: string }[] = [
  { value: 1e-6, label: "1 µs / s" },
  { value: 1e-5, label: "10 µs / s" },
  { value: 1e-4, label: "100 µs / s" },
  { value: 1e-3, label: "1 ms / s" },
  { value: 1e-2, label: "10 ms / s" },
  { value: 0.1, label: "0.1 s / s" },
  { value: 1, label: "Real time" },
  { value: 10, label: "10× faster" },
  { value: "fit", label: "Fit to circuit" },
];

const TOOLS: { spec: ToolSpec; label: string; key: string }[] = [
  { spec: { id: "select" }, label: "tool.select", key: "Esc" },
  { spec: { id: "wire" }, label: "tool.wire", key: "W" },
  { spec: { id: "probe-v" }, label: "tool.probe", key: "P" },
];

/** Measurement tools (spec §13); their command ids carry the probe capability. */
const MEASURE_TOOLS: { spec: ToolSpec; label: string; command: string; key: string }[] = [
  { spec: { id: "probe-i" }, label: "tool.probeCurrent", command: "probe.current", key: "I" },
  { spec: { id: "probe-p" }, label: "tool.probePower", command: "probe.power", key: "⇧P" },
  { spec: { id: "loop" }, label: "tool.loop", command: "probe.loop", key: "K" },
  { spec: { id: "junction" }, label: "tool.junction", command: "probe.junction", key: "J" },
];

export function TopBar() {
  const c = useController();
  const runState = useApp((s) => s.runState);
  const canUndo = useApp((s) => s.canUndo);
  const canRedo = useApp((s) => s.canRedo);
  const speed = useApp((s) => s.speed);
  const tool = useApp((s) => s.tool.id);
  const slower = useApp((s) => s.slowerThanRequested);
  const dark = useApp((s) => s.dark);
  const time = useLiveValue(c.bus, (f) => f?.t1 ?? 0);
  const running = runState === "running";
  const run = (id: string) => () => c.commands.run(id);

  return (
    <header className="topbar" role="toolbar" aria-label="Simulation">
      <FileMenu />
      <EditMenu />
      <ViewMenu />
      <Button className="btn primary" onPress={run("sim.runPause")} data-command="sim.runPause" aria-keyshortcuts="Space">
        {running ? `⏸ ${t("cmd.pause")}` : `▶ ${t("cmd.run")}`}
      </Button>
      <Button className="btn" onPress={run("sim.step")} data-command="sim.step" isDisabled={running}>
        ⏭ {t("cmd.step")}
      </Button>
      <Button className="btn" onPress={run("sim.reset")} data-command="sim.reset">
        ⟲ {t("cmd.reset")}
      </Button>
      <span className="time" aria-live="off" title="Simulated time">
        t = {formatValue(time, "s", { digits: 3 })}
      </span>
      <span className={`state ${runState}`}>{t(`status.${runState}`)}</span>
      {slower && <span className="warn">slower than requested</span>}
      <AcNotice />
      <RealismBadge />
      <label className="speed">
        {t("speed.label")}{" "}
        <select
          value={String(speed)}
          onChange={(e) => c.setSpeed(e.target.value === "fit" ? "fit" : Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={String(s.value)} value={String(s.value)}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <span className="sep" />
      {c.commands.allowed("edit.undo") && (
        <>
          <Button className="btn" onPress={run("edit.undo")} isDisabled={!canUndo} aria-label={t("cmd.undo")}>
            ↶
          </Button>
          <Button className="btn" onPress={run("edit.redo")} isDisabled={!canRedo} aria-label={t("cmd.redo")}>
            ↷
          </Button>
        </>
      )}
      <span className="sep" />
      {/* Tool labels are also their command ids, so the capability gate hides tools a mode lacks. */}
      {TOOLS.filter((tl) => c.commands.allowed(tl.label)).map((tl) => (
        <ToggleButton
          key={tl.spec.id}
          className="btn tool"
          data-command={tl.label}
          isSelected={tool === tl.spec.id}
          onChange={() => c.setTool(tl.spec)}
        >
          {t(tl.label)} <kbd>{tl.key}</kbd>
        </ToggleButton>
      ))}
      {MEASURE_TOOLS.filter((tl) => c.commands.allowed(tl.command)).map((tl) => (
        <ToggleButton key={tl.spec.id} className="btn tool" data-command={tl.command} isSelected={tool === tl.spec.id} onChange={() => c.setTool(tl.spec)}>
          {t(tl.label)} <kbd>{tl.key}</kbd>
        </ToggleButton>
      ))}
      {c.commands.allowed("probe.multimeter") && (
        <Button className="btn" onPress={run("probe.multimeter")} data-command="probe.multimeter" aria-keyshortcuts="M">
          {t("cmd.multimeter")}
        </Button>
      )}
      <span className="sep" />
      {c.commands.allowed("analysis.open") && (
        <Button className="btn" onPress={run("analysis.open")}>
          {t("cmd.analysis.open")}
        </Button>
      )}
      <Button className="btn" onPress={run("view.fit")}>
        {t("cmd.fit")}
      </Button>
      <ToggleButton className="btn" isSelected={dark} onChange={(v) => c.setDark(v)} aria-label="Dark theme">
        ◐
      </ToggleButton>
    </header>
  );
}
