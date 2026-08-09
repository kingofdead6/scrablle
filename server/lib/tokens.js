import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config.js';

/** Signs a session token for a user document. Throws if JWT_SECRET is unset. */
export function signToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign(
    { sub: String(user._id), name: user.name, guest: !!user.isGuest },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Returns the payload, or null for anything expired, forged or malformed. */
export function readToken(token) {
  if (!token || !JWT_SECRET) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Pulls a bearer token out of an Authorization header. */
export function bearerFrom(header) {
  const value = String(header || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}
