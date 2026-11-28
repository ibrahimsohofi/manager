// HTTP plumbing of the finance API: async handlers, PIN session guard, CORS, 404 and errors.
// Errors carry their own status and code (utils/finance.js httpError, FINANCE_PLAN.md §4 #11).
import { tokenFrom } from '../utils/sessions.js';

/** Express 4 does not catch rejected promises: forward them to the error handler. */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

/** Every route behind it needs an unlocked session (PIN typed, not idle). */
export const requireSession = (sessions) => (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const token = tokenFrom(req);
  if (!token || !sessions.touch(token)) {
    return res.status(401).json({ error: 'Finance app is locked', code: 'LOCKED' });
  }
  req.sessionToken = token;
  return next();
};

/** Money data: never cached by the browser or a proxy. */
export const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
};

/** Only the listed origins. Requests without Origin (Vite proxy, curl) are same-origin and allowed. */
export const corsOptions = (allowed) => ({
  origin(origin, callback) {
    callback(null, !origin || allowed.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
});

export const notFound = (req, res) => {
  res.status(404).json({ error: `No route ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler =
  (logger = console) =>
  (err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Body too large', code: 'BODY_TOO_LARGE' });
    }
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status === 500) logger.error(`❌ ${req.method} ${req.originalUrl}:`, err);
    const body = {
      error: status === 500 ? 'Internal server error' : err.message,
      code: err?.code && status !== 500 ? err.code : status === 500 ? 'INTERNAL' : undefined,
    };
    for (const key of ['attempts_left', 'retry_after']) if (err?.[key] !== undefined) body[key] = err[key];
    return res.status(status).json(body);
  };
