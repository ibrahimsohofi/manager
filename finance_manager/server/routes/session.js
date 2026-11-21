// PIN lock of the whole finance app (FINANCE_PLAN.md §4 #13, §5.5).
//   GET  /api/session          { pin_set, unlocked, idle_minutes }  (no session needed)
//   POST /api/session/setup    { pin }  first PIN only -> { token }
//   POST /api/session/unlock   { pin }  -> { token }   (wrong PINs are rate limited per client)
//   POST /api/session/lock     forgets the token
//   PUT  /api/session/pin      { current_pin, new_pin }  needs a session; other browsers are locked
import { Router } from 'express';
import { asyncHandler, requireSession } from '../middleware/http.js';
import { httpError } from '../utils/finance.js';
import { hashPin, isValidPin, verifyPin } from '../utils/pin.js';
import { tokenFrom } from '../utils/sessions.js';

const clientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

const pinError = () => httpError(400, 'PIN must be 4 to 8 digits', 'INVALID_PIN');

export const sessionRouter = ({ settings, sessions, limiter }) => {
  const router = Router();

  const guard = (req) => {
    const state = limiter.check(clientKey(req));
    if (state.locked) {
      const error = httpError(429, 'Too many wrong PINs, try again later', 'TOO_MANY_ATTEMPTS');
      error.retry_after = Math.ceil(state.retryAfterMs / 1000);
      throw error;
    }
  };

  const wrongPin = (req, status) => {
    const result = limiter.fail(clientKey(req));
    const error = result.retryAfterMs
      ? httpError(429, 'Too many wrong PINs, try again later', 'TOO_MANY_ATTEMPTS')
      : httpError(status, 'Wrong PIN', 'WRONG_PIN');
    error.attempts_left = result.attemptsLeft;
    if (result.retryAfterMs) error.retry_after = Math.ceil(result.retryAfterMs / 1000);
    return error;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const hash = await settings.getPinHash();
      res.json({ pin_set: Boolean(hash), unlocked: sessions.peek(tokenFrom(req)), idle_minutes: sessions.idleMinutes });
    })
  );

  router.post(
    '/setup',
    asyncHandler(async (req, res) => {
      const pin = String(req.body?.pin ?? '');
      if (!isValidPin(pin)) throw pinError();
      if (await settings.getPinHash()) throw httpError(409, 'A PIN is already set', 'PIN_ALREADY_SET');
      const saved = await settings.setPinHashIfEmpty(hashPin(pin));
      if (!saved) throw httpError(409, 'A PIN is already set', 'PIN_ALREADY_SET');
      res.status(201).json({ token: sessions.create(), idle_minutes: sessions.idleMinutes });
    })
  );

  router.post(
    '/unlock',
    asyncHandler(async (req, res) => {
      guard(req);
      const hash = await settings.getPinHash();
      if (!hash) throw httpError(409, 'No PIN set yet', 'PIN_NOT_SET');
      const pin = String(req.body?.pin ?? '');
      if (!verifyPin(pin, hash)) throw wrongPin(req, 401);
      limiter.success(clientKey(req));
      res.json({ token: sessions.create(), idle_minutes: sessions.idleMinutes });
    })
  );

  router.post('/lock', (req, res) => {
    const token = tokenFrom(req);
    if (token) sessions.destroy(token);
    res.json({ locked: true });
  });

  router.put(
    '/pin',
    requireSession(sessions),
    asyncHandler(async (req, res) => {
      guard(req);
      const currentPin = String(req.body?.current_pin ?? '');
      const newPin = String(req.body?.new_pin ?? '');
      if (!isValidPin(newPin)) throw pinError();
      const hash = await settings.getPinHash();
      // 403, not 401: the session is still valid, only the typed PIN is wrong.
      if (!verifyPin(currentPin, hash)) throw wrongPin(req, 403);
      limiter.success(clientKey(req));
      await settings.setPinHash(hashPin(newPin));
      sessions.destroyOthers(req.sessionToken);
      res.json({ changed: true });
    })
  );

  return router;
};
