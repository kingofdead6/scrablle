import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../db/models/User.js';
import { signToken } from '../lib/tokens.js';
import { checkName, checkEmail, checkPassword, generateTag } from '../lib/validate.js';
import { requireAccounts, requireUser, route, rateLimit } from './middleware.js';

const router = Router();

const NAME_ROOM_FOR_SUFFIX = 12; // the 16-char name limit minus a 4-digit suffix

/** Tags collide roughly never, but "roughly" isn't "never". */
async function uniqueTag() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const tag = generateTag();
    if (!(await User.exists({ tag }))) return tag;
  }
  throw new Error('Could not allocate a unique tag.');
}

const nameTaken = (name) =>
  User.exists({ name }).collation({ locale: 'en', strength: 2 });

router.post(
  '/register',
  requireAccounts,
  rateLimit({ key: 'register', max: 10 }),
  route(async (req, res) => {
    const name = checkName(req.body?.name);
    if (!name.ok) return res.status(400).json({ error: name.error });
    const email = checkEmail(req.body?.email);
    if (!email.ok) return res.status(400).json({ error: email.error });
    const password = checkPassword(req.body?.password);
    if (!password.ok) return res.status(400).json({ error: password.error });

    if (await nameTaken(name.value))
      return res.status(409).json({ error: 'That name is taken.' });
    if (await User.exists({ email: email.value }))
      return res.status(409).json({ error: 'That email already has an account.' });

    const user = await User.create({
      name: name.value,
      email: email.value,
      passwordHash: await bcrypt.hash(password.value, 12),
      tag: await uniqueTag(),
      isGuest: false,
    });

    res.status(201).json({ token: signToken(user), user: user.privateProfile() });
  })
);

router.post(
  '/login',
  requireAccounts,
  rateLimit({ key: 'login', max: 20 }),
  route(async (req, res) => {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password)
      return res.status(400).json({ error: 'Enter your email (or name) and password.' });

    // One lookup either way; the same message for both misses so the endpoint
    // can't be used to enumerate who has an account.
    const query = identifier.includes('@')
      ? User.findOne({ email: identifier.toLowerCase() })
      : User.findOne({ name: identifier }).collation({ locale: 'en', strength: 2 });
    const user = await query.select('+passwordHash');

    const stored = user?.passwordHash;
    const matches = stored ? await bcrypt.compare(password, stored) : false;
    if (!user || user.isGuest || !matches)
      return res.status(401).json({ error: 'Wrong email/name or password.' });

    res.json({ token: signToken(user), user: user.privateProfile() });
  })
);

/**
 * A throwaway account so someone can play immediately. It still gets a row, so
 * a guest's finished games can be attributed and later claimed.
 */
router.post(
  '/guest',
  requireAccounts,
  rateLimit({ key: 'guest', max: 30 }),
  route(async (req, res) => {
    const requested = checkName(req.body?.name);
    const base = requested.ok ? requested.value : 'Guest';

    let name = base;
    for (let attempt = 0; attempt < 20 && (await nameTaken(name)); attempt++)
      name = `${base.slice(0, NAME_ROOM_FOR_SUFFIX)}${Math.floor(1000 + Math.random() * 9000)}`;
    if (await nameTaken(name)) return res.status(409).json({ error: 'Could not pick a free name.' });

    const user = await User.create({ name, tag: await uniqueTag(), isGuest: true });
    res.status(201).json({ token: signToken(user), user: user.privateProfile() });
  })
);

/** Turns a guest into a real account, keeping their id, stats and history. */
router.post(
  '/claim',
  requireAccounts,
  requireUser,
  rateLimit({ key: 'claim', max: 10 }),
  route(async (req, res) => {
    if (!req.user.isGuest)
      return res.status(400).json({ error: 'This account is already registered.' });

    const email = checkEmail(req.body?.email);
    if (!email.ok) return res.status(400).json({ error: email.error });
    const password = checkPassword(req.body?.password);
    if (!password.ok) return res.status(400).json({ error: password.error });

    const name = req.body?.name === undefined ? { ok: true, value: req.user.name } : checkName(req.body.name);
    if (!name.ok) return res.status(400).json({ error: name.error });

    if (await User.exists({ email: email.value }))
      return res.status(409).json({ error: 'That email already has an account.' });
    if (name.value !== req.user.name && (await nameTaken(name.value)))
      return res.status(409).json({ error: 'That name is taken.' });

    req.user.name = name.value;
    req.user.email = email.value;
    req.user.passwordHash = await bcrypt.hash(password.value, 12);
    req.user.isGuest = false;
    await req.user.save();

    res.json({ token: signToken(req.user), user: req.user.privateProfile() });
  })
);

/** Who am I? The client calls this on boot to revive a stored token. */
router.get('/me', requireAccounts, requireUser, (req, res) => {
  res.json({ user: req.user.privateProfile() });
});

export default router;
