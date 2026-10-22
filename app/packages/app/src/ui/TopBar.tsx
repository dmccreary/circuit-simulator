import { Button, ToggleButton } from "react-aria-components";
import { formatValue } from "@cs/units";
import { useApp, useController } from "./context";
import { useLiveValue } from "../live";
import { t } from "../messages";
import type { ToolSpec } from "../app-state";

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
      <Button className="btn primary" onPress={run("sim.runPause")} aria-keyshortcuts="Space">
        {running ? `⏸ ${t("cmd.pause")}` : `▶ ${t("cmd.run")}`}
      </Button>
      <Button className="btn" onPress={run("sim.step")} isDisabled={running}>
        ⏭ {t("cmd.step")}
      </Button>
      <Button className="btn" onPress={run("sim.reset")}>
        ⟲ {t("cmd.reset")}
      </Button>
      <span className="time" aria-live="off" title="Simulated time">
        t = {formatValue(time, "s", { digits: 3 })}
      </span>
      <span className={`state ${runState}`}>{t(`status.${runState}`)}</span>
      {slower && <span className="warn">slower than requested</span>}
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
      <Button className="btn" onPress={run("edit.undo")} isDisabled={!canUndo} aria-label={t("cmd.undo")}>
        ↶
      </Button>
      <Button className="btn" onPress={run("edit.redo")} isDisabled={!canRedo} aria-label={t("cmd.redo")}>
        ↷
      </Button>
      <span className="sep" />
      {TOOLS.map((tl) => (
        <ToggleButton
          key={tl.spec.id}
          className="btn tool"
          isSelected={tool === tl.spec.id}
          onChange={() => c.setTool(tl.spec)}
        >
          {t(tl.label)} <kbd>{tl.key}</kbd>
        </ToggleButton>
      ))}
      <span className="sep" />
      <Button className="btn" onPress={run("view.fit")}>
        {t("cmd.fit")}
      </Button>
      <ToggleButton className="btn" isSelected={dark} onChange={(v) => c.setDark(v)} aria-label="Dark theme">
        ◐
      </ToggleButton>
    </header>
  );
}
