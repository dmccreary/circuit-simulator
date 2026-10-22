import { useEffect, useRef, useState } from "react";

/**
 * Sample a value a few times a second and re-render only when its key
 * changes, so frame-rate data never drives React directly (Overview §5.2).
 */
export function usePolled<T>(read: () => T, ms = 250, key: (v: T) => string = (v) => JSON.stringify(v)): T {
  const readRef = useRef(read);
  readRef.current = read;
  const [state, setState] = useState(() => ({ v: read(), k: "" }));
  useEffect(() => {
    const tick = () => {
      const v = readRef.current();
      const k = key(v);
      setState((old) => (old.k === k ? old : { v, k }));
    };
    tick();
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return state.v;
}
