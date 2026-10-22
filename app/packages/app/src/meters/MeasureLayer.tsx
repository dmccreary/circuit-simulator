// The schematic's HTML layer (rendering.md §2.2, layer 6): the hover card,
// pinned meters, the multimeter, and notices such as "Probe I2 removed with
// R3" with Undo (PRB-12). Mounted once in App; rendered into the schematic host.

import { createPortal } from "react-dom";
import { useController } from "../ui/context";
import { useStore } from "../store";
import { t } from "../messages";
import { measureOf } from "../probes/install";
import type { MeasureUi } from "../probes/session";
import { HoverCard, PinnedCard } from "./Cards";
import { Multimeter } from "./Multimeter";
import "./meters.css";

const selectHost = (u: MeasureUi) => u.host;
const selectPinned = (u: MeasureUi) => u.pinned;
const selectNotices = (u: MeasureUi) => u.notices;

export function MeasureLayer() {
  const c = useController();
  const s = measureOf(c);
  const host = useStore(s.ui, selectHost);
  const pinned = useStore(s.ui, selectPinned);
  const notices = useStore(s.ui, selectNotices);
  if (!host) return null;
  return createPortal(
    <>
      <HoverCard />
      {pinned.map((p) => (
        <PinnedCard key={p.id} pin={p} />
      ))}
      <Multimeter />
      {notices.length > 0 && (
        <div className="measure-notices" role="status">
          {notices.map((n) => (
            <div key={n.id} className="measure-notice">
              <span>{n.text}</span>
              {n.undo && (
                <button
                  type="button"
                  onClick={() => {
                    c.edits.undo();
                    s.dismiss(n.id);
                  }}
                >
                  {t("notice.undo")}
                </button>
              )}
              <button type="button" aria-label={t("notice.dismiss")} onClick={() => s.dismiss(n.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </>,
    host,
  );
}
