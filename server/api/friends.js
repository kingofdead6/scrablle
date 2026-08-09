import { Router } from 'express';
import mongoose from 'mongoose';
import { User } from '../db/models/User.js';
import { Friendship, pairKey } from '../db/models/Friendship.js';
import { presenceFor } from '../lib/presence.js';
import { requireAccounts, requireFullAccount, route, rateLimit } from './middleware.js';

const router = Router();

/** Resolves "who do you mean" from an id, a tag, or an exact name. */
async function findTarget(key) {
  const value = String(key ?? '').trim();
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) return User.findById(value);
  if (/^SCR-/i.test(value)) return User.findOne({ tag: value.toUpperCase() });
  return User.findOne({ name: value }).collation({ locale: 'en', strength: 2 });
}

const withPresence = (users) => {
  const presence = presenceFor(users.map((u) => u._id));
  return users.map((u) => ({ ...u.publicProfile(), presence: presence.get(String(u._id)) }));
};

/** Your accepted friends, with who's online and which room they're in. */
router.get(
  '/',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const me = req.user._id;
    const links = await Friendship.find({
      status: 'accepted',
      $or: [{ requester: me }, { recipient: me }],
    }).populate('requester recipient');

    const friends = links
      .map((link) => (String(link.requester._id) === String(me) ? link.recipient : link.requester))
      .filter(Boolean);

    res.json({ friends: withPresence(friends) });
  })
);

/** Requests waiting on you, and the ones you've sent. */
router.get(
  '/requests',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const me = req.user._id;
    const [incoming, outgoing] = await Promise.all([
      Friendship.find({ recipient: me, status: 'pending' }).populate('requester'),
      Friendship.find({ requester: me, status: 'pending' }).populate('recipient'),
    ]);

    res.json({
      incoming: incoming
        .filter((r) => r.requester)
        .map((r) => ({ id: String(r._id), from: r.requester.publicProfile(), sentAt: r.createdAt })),
      outgoing: outgoing
        .filter((r) => r.recipient)
        .map((r) => ({ id: String(r._id), to: r.recipient.publicProfile(), sentAt: r.createdAt })),
    });
  })
);

/** Send a friend request. Sending one back to a pending asker just accepts it. */
router.post(
  '/requests',
  requireAccounts,
  requireFullAccount,
  rateLimit({ key: 'friend-request', max: 40 }),
  route(async (req, res) => {
    const target = await findTarget(req.body?.to);
    if (!target) return res.status(404).json({ error: 'No such player.' });
    if (String(target._id) === String(req.user._id))
      return res.status(400).json({ error: 'You are already your own best friend.' });
    if (target.isGuest)
      return res.status(400).json({ error: 'Guests cannot be added as friends.' });

    const existing = await Friendship.findOne({ pair: pairKey(req.user._id, target._id) });

    if (existing) {
      if (existing.status === 'accepted')
        return res.status(409).json({ error: 'You are already friends.' });
      if (existing.status === 'blocked')
        return res.status(403).json({ error: 'That player cannot be added.' });

      const theyAskedFirst = String(existing.requester) === String(target._id);
      if (existing.status === 'pending' && theyAskedFirst) {
        existing.status = 'accepted';
        existing.respondedAt = new Date();
        await existing.save();
        return res.json({ status: 'accepted', friend: target.publicProfile() });
      }
      if (existing.status === 'pending')
        return res.status(409).json({ error: 'Request already sent.' });

      // Previously declined — let them try again.
      existing.requester = req.user._id;
      existing.recipient = target._id;
      existing.status = 'pending';
      existing.respondedAt = null;
      await existing.save();
      return res.status(201).json({ status: 'pending', to: target.publicProfile() });
    }

    await Friendship.create({ requester: req.user._id, recipient: target._id, status: 'pending' });
    res.status(201).json({ status: 'pending', to: target.publicProfile() });
  })
);

/** Accept or decline something addressed to you. */
async function respond(req, res, status) {
  const link = await Friendship.findById(req.params.id);
  if (!link || String(link.recipient) !== String(req.user._id))
    return res.status(404).json({ error: 'No such request.' });
  if (link.status !== 'pending')
    return res.status(409).json({ error: 'That request was already handled.' });

  link.status = status;
  link.respondedAt = new Date();
  await link.save();

  const other = await User.findById(link.requester);
  res.json({ status, friend: other ? other.publicProfile() : null });
}

router.post('/requests/:id/accept', requireAccounts, requireFullAccount,
  route((req, res) => respond(req, res, 'accepted')));
router.post('/requests/:id/decline', requireAccounts, requireFullAccount,
  route((req, res) => respond(req, res, 'declined')));

/** Unfriend, or withdraw a request you sent. */
router.delete(
  '/:userId',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const target = await findTarget(req.params.userId);
    if (!target) return res.status(404).json({ error: 'No such player.' });

    const removed = await Friendship.findOneAndDelete({
      pair: pairKey(req.user._id, target._id),
      status: { $ne: 'blocked' },
    });
    if (!removed) return res.status(404).json({ error: 'You are not connected to that player.' });
    res.json({ ok: true });
  })
);

/** Block: keeps the row so requests can't be re-sent. */
router.post(
  '/:userId/block',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const target = await findTarget(req.params.userId);
    if (!target) return res.status(404).json({ error: 'No such player.' });
    if (String(target._id) === String(req.user._id))
      return res.status(400).json({ error: 'You cannot block yourself.' });

    await Friendship.findOneAndUpdate(
      { pair: pairKey(req.user._id, target._id) },
      {
        requester: req.user._id,
        recipient: target._id,
        pair: pairKey(req.user._id, target._id),
        status: 'blocked',
        respondedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, status: 'blocked' });
  })
);

router.delete(
  '/:userId/block',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const target = await findTarget(req.params.userId);
    if (!target) return res.status(404).json({ error: 'No such player.' });
    const removed = await Friendship.findOneAndDelete({
      pair: pairKey(req.user._id, target._id),
      status: 'blocked',
      requester: req.user._id, // only the blocker can lift it
    });
    if (!removed) return res.status(404).json({ error: 'That player is not blocked by you.' });
    res.json({ ok: true });
  })
);

export default router;
