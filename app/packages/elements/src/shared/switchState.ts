// Shared by descriptors (resolver shorts), models, and views, so it must stay pure.
import { bool, num, type Props } from "./props";

/** Whether a switch-like part's contacts are closed for the given props. */
export function isClosed(type: string, props: Props): boolean {
  if (type === "push-button") return bool(props, "pressed", false) !== bool(props, "normallyClosed", false);
  return bool(props, "closed", false);
}

/** Closed and ideal: the compiler may merge the two terminals into one node. */
export function isIdealShort(type: string, props: Props): boolean {
  return isClosed(type, props) && !(num(props, "onResistance", 0) > 0);
}
