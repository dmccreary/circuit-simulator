import { Button } from "react-aria-components";
import { useApp, useController, useDocument } from "../ui/context";
import { useLiveValue } from "../live";
import { t } from "../messages";
import { MAX_VISIBLE_REVERSALS, highestFrequency, reversalsPerSecond, slowSpeedFor } from "./ac-notice";

/** Speeds offered by the top bar's speed control. */
const SPEED_CHOICES = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1, 1, 10];

/** ANI-08 notice beside the speed control, with a one-click Slow down. */
export function AcNotice() {
  const c = useController();
  const f = useDocument(highestFrequency);
  const speed = useApp((s) => s.speed);
  const effective = useLiveValue(c.bus, (fr) => fr?.effectiveSpeed ?? 0);
  const s = typeof speed === "number" ? speed : effective;
  const n = reversalsPerSecond(f, s);
  if (!(f > 0) || !(n > MAX_VISIBLE_REVERSALS)) return null;
  return (
    <span className="ac-notice" role="status">
      {t({ key: "realism.ac.notice", values: { n: Math.round(n).toLocaleString() } })}{" "}
      <Button className="btn" onPress={() => c.setSpeed(slowSpeedFor(f, SPEED_CHOICES))}>
        {t("realism.ac.slowDown")}
      </Button>
    </span>
  );
}
