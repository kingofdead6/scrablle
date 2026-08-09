import { User } from '../db/models/User.js';
import { readToken, bearerFrom } from '../lib/tokens.js';
import { accountsEnabled } from '../config.js';
import { dbUp } from '../db/connect.js';

/** Wraps an async handler so a rejection becomes a 500 instead of a hang. */
export const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** 503s the whole account surface when the database or secret is missing. */
export function requireAccounts(req, res, next) {
  if (!accountsEnabled())
    return res.status(503).json({
      error: 'Accounts are not configured on this server.',
      detail: 'Set MONGODB_URI and JWT_SECRET to enable sign-in, friends and history.',
    });
  if (!dbUp()) return res.status(503).json({ error: 'The database is unavailable right now.' });
  next();
}

/** Attaches req.user when a valid token is present. Never rejects. */
export const attachUser = route(async (req, _res, next) => {
  req.user = null;
  const payload = readToken(bearerFrom(req.get('authorization')));
  if (!payload || !accountsEnabled() || !dbUp()) return next();

  const user = await User.findById(payload.sub);
  if (user) {
    req.user = user;
    user.lastSeenAt = new Date();
    user.save().catch(() => {}); // a stale timestamp is not worth failing a request
  }
  next();
});

/** Hard gate for anything that acts on behalf of a signed-in account. */
export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  next();
}

/** Guests can play, but they don't get friends, history or a profile page. */
export function requireFullAccount(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to do that.' });
  if (req.user.isGuest)
    return res.status(403).json({ error: 'Create an account to use this — guests can only play.' });
  next();
}

/** Small fixed-window limiter, keyed per IP+route. Enough for abuse, not DDoS. */
export function rateLimit({ windowMs = 60_000, max = 30, key = 'default' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, entry] of hits) if (entry.start < cutoff) hits.delete(k);
  }, windowMs).unref?.();

  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(id);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(id, { start: now, count: 1 });
      return next();
    }
    if (++entry.count > max)
      return res.status(429).json({ error: 'Too many attempts. Give it a minute.' });
    next();
  };
}

/** Terminal error handler — logs the detail, returns something safe. */
export function errorHandler(err, _req, res, _next) {
  if (err?.code === 11000)
    return res.status(409).json({ error: 'That is already taken.' });
  if (err?.name === 'ValidationError')
    return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Invalid input.' });
  if (err?.code === 'LIMIT_FILE_SIZE')
    return res.status(413).json({ error: 'That image is too large (4MB max).' });
  console.error('API error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
