import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Go back one step when the previous history entry belongs to this app,
 * otherwise go to `fallback` (direct link, new tab, refreshed first page).
 *
 * React Router stores the position of each entry in `window.history.state.idx`:
 * `0` (or no value) means this page is the first one opened in the app, so
 * `navigate(-1)` would leave the app or do nothing.
 */
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();

  return useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }, [navigate, fallback]);
}
