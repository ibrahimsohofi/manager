// Loads one API resource. Keeps the previous data while a new key loads (no flash on period change),
// aborts stale requests and reloads after every emitDataChanged() (lib/events.js).
import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "../lib/events";

/**
 * @param {(options: {signal: AbortSignal}) => Promise<any>} loader
 * @param {any[]} deps   re-run when one of them changes
 * @param {{enabled?: boolean, reloadOnChange?: boolean}} [options]
 */
export const useResource = (loader, deps, { enabled = true, reloadOnChange = true } = {}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const controllerRef = useRef(null);

  const run = useCallback(
    async ({ quiet = false } = {}) => {
      if (!enabled) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (!quiet) setLoading(true);
      try {
        const result = await loaderRef.current({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        setError(err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, ...deps],
  );

  useEffect(() => {
    run();
    return () => controllerRef.current?.abort();
  }, [run]);

  useDataChanged(() => {
    if (reloadOnChange) run({ quiet: true });
  });

  return { data, error, loading, reload: run, setData };
};
