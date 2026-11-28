// PIN session of the finance app (FINANCE_PLAN.md §4 #13).
//   status: "checking" -> "down" (API not answering) | "setup" (no PIN yet) | "locked" | "unlocked"
//   reason: why it is locked ("idle" = no activity here, "expired" = the API refused the token, "manual")
// The server locks a token after SESSION_IDLE_MINUTES without requests; the client also locks after the
// same time without any keyboard / pointer activity, so an open screen never stays readable.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { financeApi, getToken, onLocked, sessionApi, setToken } from "../lib/api";

const SessionContext = createContext(null);

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"];

export const SessionProvider = ({ children }) => {
  const [status, setStatus] = useState("checking");
  const [reason, setReason] = useState(null);
  const [idleMinutes, setIdleMinutes] = useState(15);
  const [health, setHealth] = useState(null);
  const lastActivity = useRef(Date.now());

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await financeApi.health());
    } catch {
      setHealth(null);
    }
  }, []);

  const check = useCallback(async () => {
    setStatus((current) => (current === "unlocked" ? current : "checking"));
    try {
      const state = await sessionApi.status();
      setIdleMinutes(state.idle_minutes ?? 15);
      if (!state.pin_set) {
        setToken(null);
        setStatus("setup");
      } else if (state.unlocked && getToken()) {
        lastActivity.current = Date.now();
        setStatus("unlocked");
      } else {
        if (getToken()) setReason("expired");
        setToken(null);
        setStatus("locked");
      }
      loadHealth();
    } catch (error) {
      setStatus(error?.isApiDown ? "down" : "locked");
    }
  }, [loadHealth]);

  useEffect(() => {
    check();
  }, [check]);

  // The API answered 401 LOCKED (idle on the server, PIN changed in another browser).
  useEffect(
    () =>
      onLocked(() => {
        setStatus((current) => {
          if (current === "unlocked") setReason((r) => r ?? "expired");
          return current === "setup" ? current : "locked";
        });
      }),
    [],
  );

  const start = useCallback(
    (result) => {
      setToken(result.token);
      if (result.idle_minutes) setIdleMinutes(result.idle_minutes);
      lastActivity.current = Date.now();
      setReason(null);
      setStatus("unlocked");
      loadHealth();
    },
    [loadHealth],
  );

  const unlock = useCallback(async (pin) => start(await sessionApi.unlock(pin)), [start]);
  const setup = useCallback(async (pin) => start(await sessionApi.setup(pin)), [start]);

  const lock = useCallback(async (why = "manual") => {
    try {
      await sessionApi.lock();
    } catch {
      /* the token is forgotten anyway */
    }
    setToken(null);
    setReason(why);
    setStatus("locked");
  }, []);

  // Client-side idle lock.
  useEffect(() => {
    if (status !== "unlocked") return undefined;
    const mark = () => {
      lastActivity.current = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, mark, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > idleMinutes * 60_000) lock("idle");
    }, 10_000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, mark);
      window.clearInterval(timer);
    };
  }, [status, idleMinutes, lock]);

  const value = useMemo(
    () => ({ status, reason, idleMinutes, health, check, unlock, setup, lock, reloadHealth: loadHealth }),
    [status, reason, idleMinutes, health, check, unlock, setup, lock, loadHealth],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
};
