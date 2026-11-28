// Unlock sessions of the finance app (FINANCE_PLAN.md §4 #13). Typing the PIN gives a random token kept in
// memory only: restarting the API locks every browser again, which is what we want for a PIN screen.
// A token expires after `idleMinutes` without a request (SESSION_IDLE_MINUTES).
import { randomBytes } from 'node:crypto';

export const TOKEN_BYTES = 32;
const TOKEN_RE = /^[a-f0-9]{64}$/;

/**
 * @param {{idleMinutes: number, maxSessions?: number, now?: () => number}} options
 */
export const createSessionStore = ({ idleMinutes, maxSessions = 50, now = () => Date.now() }) => {
  const idleMs = Math.max(1, Number(idleMinutes) || 15) * 60_000;
  const sessions = new Map(); // token -> { createdAt, lastSeen }

  const sweep = () => {
    const limit = now() - idleMs;
    for (const [token, session] of sessions) if (session.lastSeen < limit) sessions.delete(token);
  };

  const alive = (token) => {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (now() - session.lastSeen >= idleMs) {
      sessions.delete(token);
      return null;
    }
    return session;
  };

  return {
    idleMinutes: idleMs / 60_000,
    create() {
      sweep();
      // Oldest sessions go first when too many browsers are unlocked.
      while (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(TOKEN_BYTES).toString('hex');
      sessions.set(token, { createdAt: now(), lastSeen: now() });
      return token;
    },
    /** True when the token is valid; pushes its idle deadline back. */
    touch(token) {
      const session = alive(token);
      if (!session) return false;
      session.lastSeen = now();
      return true;
    },
    /** True when the token is valid, without counting as activity. */
    peek(token) {
      return Boolean(alive(token));
    },
    destroy(token) {
      sessions.delete(token);
    },
    /** Every session except `keep` (PIN changed: the other browsers must type the new PIN). */
    destroyOthers(keep) {
      for (const token of sessions.keys()) if (token !== keep) sessions.delete(token);
    },
    size() {
      sweep();
      return sessions.size;
    },
  };
};

/**
 * Slows down PIN guessing. After `maxAttempts` wrong PINs from one client, it is locked for `lockMs`,
 * doubled at each new lock (capped at `maxLockMs`). A right PIN clears the counter.
 */
export const createAttemptLimiter = ({
  maxAttempts = 5,
  lockMs = 30_000,
  maxLockMs = 15 * 60_000,
  now = () => Date.now(),
} = {}) => {
  const clients = new Map(); // key -> { failures, locks, lockedUntil }

  return {
    maxAttempts,
    /** `{ locked: boolean, retryAfterMs: number }` */
    check(key) {
      const entry = clients.get(key);
      if (!entry || entry.lockedUntil <= now()) return { locked: false, retryAfterMs: 0 };
      return { locked: true, retryAfterMs: entry.lockedUntil - now() };
    },
    /** Records a wrong PIN. Returns the attempts left before the next lock, and the lock if one started. */
    fail(key) {
      const entry = clients.get(key) ?? { failures: 0, locks: 0, lockedUntil: 0 };
      entry.failures += 1;
      let retryAfterMs = 0;
      if (entry.failures >= maxAttempts) {
        retryAfterMs = Math.min(lockMs * 2 ** entry.locks, maxLockMs);
        entry.locks += 1;
        entry.failures = 0;
        entry.lockedUntil = now() + retryAfterMs;
      }
      clients.set(key, entry);
      return { attemptsLeft: retryAfterMs ? 0 : maxAttempts - entry.failures, retryAfterMs };
    },
    success(key) {
      clients.delete(key);
    },
  };
};

/** `Authorization: Bearer <token>` -> token, or null. */
export const tokenFrom = (req) => {
  const header = req.get?.('authorization') ?? req.headers?.authorization ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(String(header));
  return match ? match[1] : null;
};
