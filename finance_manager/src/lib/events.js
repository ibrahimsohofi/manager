// "Something changed" signal between screens: the quick-add dialog, the expenses list and the overview
// reload after any write, without a global store.
import { useEffect, useRef } from "react";

const EVENT = "finance:data-changed";

/** Call after every successful write (create / update / pay / delete / restore / category / settings). */
export const emitDataChanged = (detail = {}) => {
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
};

/** Runs `callback(detail)` after every emitDataChanged(). */
export const useDataChanged = (callback) => {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = (event) => ref.current?.(event.detail ?? {});
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
};
