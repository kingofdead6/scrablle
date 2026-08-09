import { Router } from 'express';
import mongoose from 'mongoose';
import { User } from '../db/models/User.js';
import { Friendship, pairKey } from '../db/models/Friendship.js';
import { DirectMessage } from '../db/models/DirectMessage.js';
import { checkMessage } from '../lib/validate.js';
import { presenceFor } from '../lib/presence.js';
import { requireAccounts, requireFullAccount, route, rateLimit } from './middleware.js';

const router = Router();

/** You can only DM people you're actually friends with. */
async function friendOrNull(meId, otherKey) {
  const other = mongoose.isValidObjectId(otherKey)
    ? await User.findById(otherKey)
    : await User.findOne({ tag: String(otherKey).toUpperCase() });
  if (!other) return { error: 'No such player.' };

  const link = await Friendship.findOne({ pair: pairKey(meId, other._id) });
  if (!link || link.status !== 'accepted')
    return { error: 'You can only message friends.' };
  return { other };
}

/** One row per conversation: who, the last line, and how many are unread. */
router.get(
  '/',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const me = req.user._id;
    const recent = await DirectMessage.aggregate([
      { $match: { $or: [{ from: me }, { to: me }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$thread',
          last: { $first: '$$ROOT' },
          unread: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$to', me] }, { $eq: ['$readAt', null] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { 'last.createdAt': -1 } },
      { $limit: 50 },
    ]);

    const otherIds = recent.map((row) =>
      String(row.last.from) === String(me) ? row.last.to : row.last.from
    );
    const others = await User.find({ _id: { $in: otherIds } });
    const byId = new Map(others.map((u) => [String(u._id), u]));
    const presence = presenceFor(otherIds);

    res.json({
      threads: recent
        .map((row) => {
          const otherId = String(row.last.from) === String(me) ? row.last.to : row.last.from;
          const other = byId.get(String(otherId));
          if (!other) return null;
          return {
            with: { ...other.publicProfile(), presence: presence.get(String(otherId)) },
            unread: row.unread,
            last: {
              text: row.last.text,
              mine: String(row.last.from) === String(me),
              createdAt: row.last.createdAt,
            },
          };
        })
        .filter(Boolean),
    });
  })
);

/** A conversation, oldest last. Opening it marks their lines read. */
router.get(
  '/:userId',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const found = await friendOrNull(req.user._id, req.params.userId);
    if (found.error) return res.status(403).json({ error: found.error });

    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const messages = await DirectMessage.find({ thread: pairKey(req.user._id, found.other._id) })
      .sort({ createdAt: -1 })
      .limit(limit);

    await DirectMessage.updateMany(
      { thread: pairKey(req.user._id, found.other._id), to: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );

    res.json({
      with: found.other.publicProfile(),
      messages: messages.reverse().map((m) => m.toJson()),
    });
  })
);

router.post(
  '/:userId',
  requireAccounts,
  requireFullAccount,
  rateLimit({ key: 'dm', max: 90 }),
  route(async (req, res) => {
    const found = await friendOrNull(req.user._id, req.params.userId);
    if (found.error) return res.status(403).json({ error: found.error });

    const text = checkMessage(req.body?.text);
    if (!text.ok) return res.status(400).json({ error: text.error });

    const message = await DirectMessage.create({
      from: req.user._id,
      to: found.other._id,
      text: text.value,
    });

    // Push it straight to the recipient if they're connected (see sockets.js).
    req.app.get('notifyUser')?.(found.other._id, 'dm:new', {
      message: message.toJson(),
      from: req.user.publicProfile(),
    });

    res.status(201).json({ message: message.toJson() });
  })
);

router.get(
  '/unread/count',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    res.json({ unread: await DirectMessage.countDocuments({ to: req.user._id, readAt: null }) });
  })
);

export default router;
