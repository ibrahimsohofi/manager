// The selected period lives in the URL (?p=2026-11 or ?p=2026), shared by every screen: switching tabs
// keeps it, a reload keeps it, and a link can open a given month.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { currentMonth, isPeriodKey } from "../lib/period";

export const usePeriod = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get("p");
  const period = isPeriodKey(raw) ? raw : currentMonth();

  const setPeriod = useCallback(
    (next) => {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          if (!next || next === currentMonth()) copy.delete("p");
          else copy.set("p", next);
          copy.delete("page");
          return copy;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [period, setPeriod];
};

/** Other search params (filters, tabs) with the same replace-in-place behaviour. */
export const useParam = (name, fallback = "") => {
  const [params, setParams] = useSearchParams();
  const value = params.get(name) ?? fallback;
  const setValue = useCallback(
    (next, { resetPage = true } = {}) => {
      setParams(
        (current) => {
          const copy = new URLSearchParams(current);
          if (next === undefined || next === null || next === "" || next === fallback) copy.delete(name);
          else copy.set(name, String(next));
          if (resetPage && name !== "page") copy.delete("page");
          return copy;
        },
        { replace: true },
      );
    },
    [name, fallback, setParams],
  );
  return [value, setValue];
};
