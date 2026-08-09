import { Router } from 'express';
import mongoose from 'mongoose';
import { GameRecord } from '../db/models/GameRecord.js';
import { User } from '../db/models/User.js';
import { requireAccounts, requireUser, route } from './middleware.js';

const router = Router();

/**
 * Your finished games, newest first. `?with=<userId>` narrows it to games you
 * played alongside one particular person.
 */
router.get(
  '/',
  requireAccounts,
  requireUser,
  route(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const query = { participants: req.user._id };
    if (req.query.with && mongoose.isValidObjectId(req.query.with))
      query.participants = { $all: [req.user._id, req.query.with] };

    const [games, total] = await Promise.all([
      GameRecord.find(query).sort({ endedAt: -1 }).skip(skip).limit(limit),
      GameRecord.countDocuments(query),
    ]);

    res.json({
      total,
      skip,
      games: games.map((g) => g.summary(req.user._id)),
    });
  })
);

/** One game in full, including every turn — the same log the in-game panel shows. */
router.get(
  '/:id',
  requireAccounts,
  requireUser,
  route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ error: 'No such game.' });

    const game = await GameRecord.findById(req.params.id);
    if (!game) return res.status(404).json({ error: 'No such game.' });
    // Your own history only — these logs name the people you played with.
    if (!game.participants.some((p) => String(p) === String(req.user._id)))
      return res.status(403).json({ error: 'That game is not yours to read.' });

    res.json({ game: { ...game.summary(req.user._id), turns: game.turns } });
  })
);

/** Everyone you've shared a table with, most-played first. */
router.get(
  '/opponents/list',
  requireAccounts,
  requireUser,
  route(async (req, res) => {
    const rows = await GameRecord.aggregate([
      { $match: { participants: req.user._id } },
      { $unwind: '$participants' },
      { $match: { participants: { $ne: req.user._id } } },
      { $group: { _id: '$participants', games: { $sum: 1 }, lastPlayed: { $max: '$endedAt' } } },
      { $sort: { games: -1, lastPlayed: -1 } },
      { $limit: 30 },
    ]);

    const users = await User.find({ _id: { $in: rows.map((r) => r._id) } });
    const byId = new Map(users.map((u) => [String(u._id), u]));

    res.json({
      opponents: rows
        .filter((row) => byId.has(String(row._id)))
        .map((row) => ({
          user: byId.get(String(row._id)).publicProfile(),
          games: row.games,
          lastPlayed: row.lastPlayed,
        })),
    });
  })
);

export default router;
