import { Button } from "react-aria-components";
import { useStore } from "../store";
import { addMessages, t } from "../messages";
import { applyUpdate, offlineState } from "./register";
import "./offline.css";

addMessages({
  "offline.updateReady": "A new version is ready — reload when convenient.",
  "offline.reload": "Reload",
  "offline.dismiss": "Dismiss",
});

/** The update notice (files-and-persistence.md §6). The app never reloads by itself. */
export function UpdateNotice() {
  const ready = useStore(offlineState, (s) => s.updateReady && !s.dismissed);
  const framed = typeof window !== "undefined" && window.parent !== window;
  if (!ready || framed) return null;
  return (
    <div className="update-notice" role="status">
      {t("offline.updateReady")}
      <Button className="btn sm" onPress={() => void applyUpdate()}>
        {t("offline.reload")}
      </Button>
      <Button className="btn sm" aria-label={t("offline.dismiss")} onPress={() => offlineState.set({ dismissed: true })}>
        ×
      </Button>
    </div>
  );
}
