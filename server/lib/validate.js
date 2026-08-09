// Input rules for the account system. Pure functions — no database, no request
// object — so they can be tested directly and reused by the socket layer.

export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
export const BIO_MAX = 160;
export const DM_MAX = 1000;

const NAME_SHAPE = /^[A-Za-z0-9 _-]+$/;
// Deliberately permissive: one @, something either side, a dot in the domain.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const TAG_SHAPE = /^SCR-[A-Z0-9]{4}$/;

const fail = (message) => ({ ok: false, error: message });
const pass = (value) => ({ ok: true, value });

export function checkName(input) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN) return fail(`Name needs at least ${NAME_MIN} characters.`);
  if (name.length > NAME_MAX) return fail(`Name can be at most ${NAME_MAX} characters.`);
  if (!NAME_SHAPE.test(name)) return fail('Name can use letters, numbers, spaces, - and _ only.');
  return pass(name);
}

export function checkEmail(input) {
  const email = String(input ?? '').trim().toLowerCase();
  if (!email) return fail('Enter an email address.');
  if (email.length > 254) return fail('That email is too long.');
  if (!EMAIL_SHAPE.test(email)) return fail('That does not look like an email address.');
  return pass(email);
}

export function checkPassword(input) {
  const password = String(input ?? '');
  if (password.length < PASSWORD_MIN) return fail(`Password needs at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) return fail('That password is too long.');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return fail('Password needs at least one letter and one number.');
  return pass(password);
}

export function checkBio(input) {
  const bio = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (bio.length > BIO_MAX) return fail(`Bio can be at most ${BIO_MAX} characters.`);
  return pass(bio);
}

export function checkMessage(input) {
  const text = String(input ?? '').replace(/[ \t]+/g, ' ').trim();
  if (!text) return fail('Type something first.');
  return pass(text.slice(0, DM_MAX));
}

export const isTag = (value) => TAG_SHAPE.test(String(value ?? '').trim().toUpperCase());

// No I/O/0/1 — the tag gets read aloud and typed in by hand.
const TAG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateTag() {
  let body = '';
  for (let i = 0; i < 4; i++)
    body += TAG_ALPHABET[Math.floor(Math.random() * TAG_ALPHABET.length)];
  return `SCR-${body}`;
}

/**
 * Works out what a friend-search box was given. Callers use the kind to pick an
 * exact lookup (tag, email, mongo id) over a fuzzy name match.
 */
export function classifySearch(input) {
  const q = String(input ?? '').trim();
  if (!q) return { kind: 'empty', q };
  if (/^[a-f0-9]{24}$/i.test(q)) return { kind: 'id', q: q.toLowerCase() };
  if (isTag(q)) return { kind: 'tag', q: q.toUpperCase() };
  if (q.includes('@')) return { kind: 'email', q: q.toLowerCase() };
  return { kind: 'name', q };
}

/** Escapes a user string so it can go inside a RegExp without exploding. */
export const escapeRegex = (value) =>
  String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
