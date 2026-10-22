import { useEffect, useRef } from "react";
import { Button, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from "react-aria-components";
import type { Slider as SliderSpec, Transaction } from "@cs/model";
import { getDescriptor } from "@cs/elements";
import { formatValue } from "@cs/units";
import { useApp, useController, useDocument } from "../ui/context";
import { propLabel, t } from "../messages";
import { sliderPosition, sliderValue, sliderableProps } from "./sliders";

const STEPS = 1000;

/** One slider driving a part's prop through a live transaction: a whole drag is one undo step (EDT-32). */
function PropSlider({ s }: { s: SliderSpec }) {
  const c = useController();
  const part = useDocument((d) => d.parts[s.part]);
  const tx = useRef<Transaction | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const spec = part && getDescriptor(part.type)?.props.find((p) => p.key === s.prop);
  const raw = part?.props[s.prop];
  const v = typeof raw === "number" ? raw : 0;
  const shown = spec ? formatValue(v, spec.unit, { digits: 3 }) : String(v);
  // The thumb's position is 0..1000; screen readers should hear the value instead.
  useEffect(() => input.current?.setAttribute("aria-valuetext", shown), [shown]);
  if (!part) return null;
  const name = `${part.label || part.type} ${propLabel(s.prop)}`;
  const set = (pos: number) => {
    const next = Number(sliderValue(s, pos / STEPS).toPrecision(4));
    if (!tx.current?.open) tx.current = c.edits.begin({ key: "edit.slider" }, { coalesceKey: `slider:${s.id}` });
    tx.current.update((d) => {
      if (d.parts[s.part]) d.parts[s.part].props[s.prop] = next;
    });
  };
  const end = () => {
    tx.current?.commit();
    tx.current = null;
  };
  return (
    <li className="slider-row">
      <Slider
        className="prop-slider"
        minValue={0}
        maxValue={STEPS}
        value={Math.round(sliderPosition(s, v) * STEPS)}
        onChange={(pos) => set(pos as number)}
        onChangeEnd={end}
      >
        <Label>{name}</Label>
        <SliderOutput className="slider-out">{() => shown}</SliderOutput>
        <SliderTrack className="slider-track">
          <SliderThumb className="slider-thumb" inputRef={input} />
        </SliderTrack>
      </Slider>
      <Button className="btn small" aria-label={t({ key: "sliders.remove", values: { name } })} onPress={() => c.commands.run("edit.removeSlider", { slider: s.id })}>
        ×
      </Button>
    </li>
  );
}

/** The slider panel (CTL-05): sliders saved in the document, plus Add slider for the selected part. */
export function SlidersPanel() {
  const c = useController();
  const sliders = useDocument((d) => d.sliders);
  const selection = useApp((s) => s.selection);
  const parts = useDocument((d) => d.parts);
  const list = Object.values(sliders);
  const one = selection.length === 1 ? parts[selection[0]] : undefined;
  const canAdd = !!one && sliderableProps(getDescriptor(one.type)).length > 0 && c.commands.allowed("edit.addSlider");
  if (!list.length && !canAdd) return null;
  return (
    <section className="sliders" aria-label={t("sliders.title")}>
      <h2>{t("sliders.title")}</h2>
      {list.length > 0 ? (
        <ul>
          {list.map((s) => (
            <PropSlider key={s.id} s={s} />
          ))}
        </ul>
      ) : (
        <p className="hint">{t("sliders.empty")}</p>
      )}
      {canAdd && (
        <Button className="btn small" onPress={() => c.commands.run("edit.addSlider")}>
          + {t("cmd.addSlider")}
        </Button>
      )}
    </section>
  );
}
