import { useEffect, useState } from "react";
import { applyRealisticParts } from "../realism/realistic-parts";
import { Button, Checkbox, FieldError, Heading, Input, Label, TextField } from "react-aria-components";
import type { CircuitSettings } from "@cs/model";
import { formatValue, parseValue } from "@cs/units";
import { useController, useDocument } from "../ui/context";
import { useShell } from "../layout/use-shell";
import { useStore } from "../store";
import { t } from "../messages";
import type { LearnerSettings } from "./learner";
import { KeymapEditor } from "./KeymapEditor";

type Choice<K extends keyof LearnerSettings> = { key: K; label: string; options: LearnerSettings[K][]; text: (v: LearnerSettings[K]) => string };

const CHOICES = [
  { key: "theme", label: "settings.theme", options: ["auto", "light", "dark", "high-contrast"], text: (v: string) => t(`settings.theme.${v}`) },
  { key: "currentDisplay", label: "settings.current", options: ["conventional", "electron", "off"], text: (v: string) => t(`settings.current.${v}`) },
  { key: "voltageColors", label: "settings.voltage", options: ["red-green", "blue-orange", "off"], text: (v: string) => t(`settings.voltage.${v}`) },
  { key: "reducedMotion", label: "settings.motion", options: ["auto", "on", "off"], text: (v: string) => t(`settings.motion.${v}`) },
  { key: "symbolStyle", label: "settings.symbols", options: ["ansi", "iec", "lifelike"], text: (v: string) => t(`settings.symbols.${v}`) },
  { key: "decimalSeparator", label: "settings.decimal", options: [".", ","], text: (v: string) => t(v === "," ? "settings.decimal.comma" : "settings.decimal.dot") },
] as Choice<keyof LearnerSettings>[];

function LearnerSection() {
  const sh = useShell();
  const s = useStore(sh.settings.store, (x) => x);
  const [confirm, setConfirm] = useState(false);
  return (
    <section>
      <h3>{t("settings.learner")}</h3>
      {CHOICES.map((ch) => (
        <label key={ch.key} className="field">
          {t(ch.label)}
          <select value={String(s[ch.key])} onChange={(e) => sh.settings.update({ [ch.key]: e.target.value } as Partial<LearnerSettings>)}>
            {ch.options.map((o) => (
              <option key={String(o)} value={String(o)}>
                {ch.text(o)}
              </option>
            ))}
          </select>
        </label>
      ))}
      {confirm ? (
        <div role="alert" className="settings-confirm">
          <p>{t("settings.restoreConfirm")}</p>
          <Button
            className="btn primary"
            onPress={() => {
              sh.settings.restoreDefaults();
              setConfirm(false);
            }}
          >
            {t("settings.restoreYes")}
          </Button>{" "}
          <Button className="btn" onPress={() => setConfirm(false)}>
            {t("edit.cancel")}
          </Button>
        </div>
      ) : (
        <Button className="btn" onPress={() => setConfirm(true)}>
          {t("settings.restore")}
        </Button>
      )}
    </section>
  );
}

/** Circuit settings are document edits, so they are undoable and travel with the file (SET-02). */
function CircuitSection() {
  const c = useController();
  const s = useDocument((d) => d.settings);
  const editable = c.commands.allowed("edit.selectAll");
  const set = (patch: Partial<CircuitSettings>) =>
    c.edits.edit({ key: "edit.circuitSettings" }, (d) => {
      Object.assign(d.settings, patch);
      if (patch.realisticParts !== undefined) applyRealisticParts(d, patch.realisticParts);
      if ("maxTimeStep" in patch && patch.maxTimeStep === undefined) delete d.settings.maxTimeStep;
    });
  const shownStep = s.maxTimeStep ? formatValue(s.maxTimeStep, "s", { trimZeros: true }) : "";
  const [step, setStep] = useState(shownStep);
  const [err, setErr] = useState<string>();
  useEffect(() => setStep(shownStep), [shownStep]);
  const applyStep = () => {
    if (!step.trim()) return set({ maxTimeStep: undefined });
    const v = parseValue(step, "s");
    if (v === null || v <= 0) return setErr("Enter a positive time, such as 10us");
    setErr(undefined);
    if (v !== s.maxTimeStep) set({ maxTimeStep: v });
  };
  return (
    <section>
      <h3>{t("settings.circuit")}</h3>
      <Checkbox className="check" isDisabled={!editable} isSelected={s.realisticParts} onChange={(v) => set({ realisticParts: v })}>
        <span className="box" aria-hidden /> {t("settings.realisticParts")}
      </Checkbox>
      <Checkbox className="check" isDisabled={!editable} isSelected={s.realisticRatings} onChange={(v) => set({ realisticRatings: v })}>
        <span className="box" aria-hidden /> {t("settings.realisticRatings")}
      </Checkbox>
      <label className="field">
        {t("settings.start")}
        <select value={s.start} disabled={!editable} onChange={(e) => set({ start: e.target.value as CircuitSettings["start"] })}>
          <option value="zero">{t("settings.start.zero")}</option>
          <option value="steady">{t("settings.start.steady")}</option>
        </select>
      </label>
      <TextField
        className="field"
        value={step}
        onChange={setStep}
        onBlur={applyStep}
        onKeyDown={(e) => e.key === "Enter" && applyStep()}
        isInvalid={!!err}
        isDisabled={!editable}
      >
        <Label>{t("settings.maxStep")}</Label>
        <Input placeholder={t("settings.maxStep.auto")} />
        <FieldError>{err}</FieldError>
      </TextField>
    </section>
  );
}

/** Settings dialog body (spec §24). */
export function SettingsDialog({ close }: { close: () => void }) {
  return (
    <>
      <Heading slot="title">{t("settings.title")}</Heading>
      <div className="settings-body">
        <LearnerSection />
        <CircuitSection />
        <section>
          <h3>{t("settings.keys")}</h3>
          <KeymapEditor />
        </section>
      </div>
      <div className="files-actions">
        <Button className="btn primary" onPress={close}>
          {t("settings.close")}
        </Button>
      </div>
    </>
  );
}
