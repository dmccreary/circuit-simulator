import { GridList, GridListItem } from "react-aria-components";
import { getView } from "@cs/elements/views";
import { getDescriptor, terminalPositions } from "@cs/elements";
import { useController, useDocument } from "../ui/context";
import { useLiveValue } from "../live";
import { useStore } from "../store";
import { useShell } from "../layout/use-shell";
import { t } from "../messages";
import { describeCircuit } from "./describe";

const terminals = (p: import("@cs/model").Part) => {
  const d = getDescriptor(p.type);
  return d ? terminalPositions(p, d) : [];
};

/**
 * The text view of the circuit (ACC-06, ACC-07): one entry per part in
 * reading order with its value, nodes and live readings. Visually hidden but
 * reachable by Tab and screen-reader navigation; choosing an entry moves the
 * canvas focus cursor there.
 */
export function CircuitTree() {
  const c = useController();
  const sh = useShell();
  const doc = useDocument((d) => d);
  const decimal = useStore(sh.settings.store, (s) => s.decimalSeparator);
  // Live values are sampled at most 10 times a second (useLiveValue), never per frame.
  const display = useLiveValue(c.bus, (f) => f?.display);
  const list = describeCircuit({ doc, compiled: c.compiled, display, getView, getDescriptor, terminals, decimal });
  return (
    <section className="sr-only-focusable circuit-tree" aria-label={t("a11y.tree")}>
      <h2>{t("a11y.tree")}</h2>
      <p>{t("a11y.treeHint")}</p>
      <GridList
        aria-label={t("a11y.tree")}
        items={list}
        renderEmptyState={() => t("a11y.empty")}
        onAction={(id) => sh.focus.focusPart(String(id))}
      >
        {(d) => (
          <GridListItem id={d.id} textValue={d.text}>
            {d.text}
          </GridListItem>
        )}
      </GridList>
    </section>
  );
}
