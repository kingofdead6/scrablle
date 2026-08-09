// The bridge between the account system and the live game server: who is
// signed in on a socket, who is online, friend invites into a room, and
// writing a finished game into history.
//
// Everything here is a no-op when accounts aren't configured, so a server with
// an empty .env still hosts guest games exactly as before.

import { accountsEnabled } from './config.js';
import { dbUp } from './db/connect.js';
import { readToken } from './lib/tokens.js';
import { markOnline, markOffline, setRoom, isOnline, presenceFor } from './lib/presence.js';
import { tallyGame, applyTally, buildSeats } from './lib/stats.js';

const personalRoom = (userId) => `user:${userId}`;

/** Lazily imported so a guest-only server never loads mongoose models. */
async function models() {
  const [{ User }, { Friendship, pairKey }, { GameRecord }] = await Promise.all([
    import('./db/models/User.js'),
    import('./db/models/Friendship.js'),
    import('./db/models/GameRecord.js'),
  ]);
  return { User, Friendship, pairKey, GameRecord };
}

const ready = () => accountsEnabled() && dbUp();

export function attachAccounts({ io, app, rooms }) {
  /** Push an event to every device a user has connected. */
  const notifyUser = (userId, event, payload) =>
    io.to(personalRoom(userId)).emit(event, payload);
  app.set('notifyUser', notifyUser);

  // Read the session token off the handshake. Never rejects the connection:
  // a bad or absent token just means "playing as a guest".
  io.use((socket, next) => {
    socket.account = null;
    const token = socket.handshake?.auth?.token;
    const payload = ready() ? readToken(token) : null;
    if (payload) socket.account = { id: payload.sub, name: payload.name, isGuest: !!payload.guest };
    next();
  });

  io.on('connection', (socket) => {
    if (socket.account) {
      markOnline(socket.account.id, socket.id, socket.account.name);
      socket.join(personalRoom(socket.account.id));
      broadcastPresence(socket.account.id, true);
    }

    /**
     * Invite friends into the room this socket is in. Takes a list, so "start a
     * game with several friends at once" is one call.
     */
    socket.on('invite:send', async ({ code, to } = {}, cb) => {
      if (!ready()) return cb?.({ error: 'Accounts are not enabled on this server.' });
      if (!socket.account) return cb?.({ error: 'Sign in to invite friends.' });
      if (socket.account.isGuest) return cb?.({ error: 'Create an account to invite friends.' });

      const room = rooms.get(String(code || '').toUpperCase());
      if (!room) return cb?.({ error: 'Room not found.' });
      if (room.game.status !== 'lobby')
        return cb?.({ error: 'Invite them before the game starts.' });

      const ids = [...new Set((Array.isArray(to) ? to : [to]).map(String).filter(Boolean))].slice(0, 10);
      if (ids.length === 0) return cb?.({ error: 'Pick at least one friend.' });

      try {
        const { User, Friendship, pairKey } = await models();
        const me = await User.findById(socket.account.id);
        if (!me) return cb?.({ error: 'Sign in again.' });

        const links = await Friendship.find({
          status: 'accepted',
          pair: { $in: ids.map((id) => pairKey(me._id, id)) },
        });
        const friendIds = new Set(
          links.map((l) => (String(l.requester) === String(me._id) ? String(l.recipient) : String(l.requester)))
        );

        const sent = [], skipped = [];
        for (const id of ids) {
          if (!friendIds.has(id)) { skipped.push({ id, reason: 'not-a-friend' }); continue; }
          if (!isOnline(id)) { skipped.push({ id, reason: 'offline' }); continue; }
          notifyUser(id, 'invite:incoming', {
            code: room.code,
            from: me.publicProfile(),
            players: room.game.players.map((p) => ({ name: p.name, isBot: !!p.isBot })),
            sentAt: Date.now(),
          });
          sent.push(id);
        }
        cb?.({ ok: true, sent, skipped });
      } catch (err) {
        console.error('invite:send failed:', err);
        cb?.({ error: 'Could not send those invites.' });
      }
    });

    /** Tell the inviter you're not coming, so their list stops waiting. */
    socket.on('invite:decline', ({ toUserId, code } = {}) => {
      if (!ready() || !socket.account || !toUserId) return;
      notifyUser(toUserId, 'invite:declined', {
        code,
        by: { id: socket.account.id, name: socket.account.name },
      });
    });

    /** Live friend presence for the friends panel. */
    socket.on('presence:query', async (_payload, cb) => {
      if (!ready() || !socket.account) return cb?.({ presence: {} });
      try {
        const { Friendship } = await models();
        const links = await Friendship.find({
          status: 'accepted',
          $or: [{ requester: socket.account.id }, { recipient: socket.account.id }],
        });
        const ids = links.map((l) =>
          String(l.requester) === socket.account.id ? String(l.recipient) : String(l.requester)
        );
        cb?.({ presence: Object.fromEntries(presenceFor(ids)) });
      } catch {
        cb?.({ presence: {} });
      }
    });

    socket.on('disconnect', () => {
      if (!socket.account) return;
      if (markOffline(socket.account.id, socket.id)) broadcastPresence(socket.account.id, false);
    });
  });

  /** Let a user's friends know they came online or went away. */
  async function broadcastPresence(userId, online) {
    if (!ready()) return;
    try {
      const { Friendship } = await models();
      const links = await Friendship.find({
        status: 'accepted',
        $or: [{ requester: userId }, { recipient: userId }],
      });
      for (const link of links) {
        const friendId = String(link.requester) === String(userId) ? link.recipient : link.requester;
        notifyUser(friendId, 'friend:presence', { userId: String(userId), online });
      }
    } catch { /* presence is cosmetic; never let it break a connection */ }
  }

  return { notifyUser, broadcastPresence };
}

/** Called whenever a socket joins or leaves a game room. */
export function trackRoom(socket, code) {
  if (socket?.account) setRoom(socket.account.id, code);
}

/**
 * Writes a finished game into history and folds it into each player's stats.
 * Bots and signed-out guests still appear as seats, they just have no user id.
 */
export async function recordFinishedGame(room) {
  if (!ready() || room.recorded) return null;
  const game = room.game;
  if (game.status !== 'ended' || game.history.length === 0) return null;
  room.recorded = true; // one write per game, even if several paths call us

  try {
    const { User, GameRecord } = await models();

    const accountByName = new Map();
    for (const player of game.players)
      if (player.userId) accountByName.set(player.name, player.userId);

    const seats = buildSeats(game, accountByName);
    const participants = [...new Set(seats.map((s) => s.user).filter(Boolean).map(String))];

    const record = await GameRecord.create({
      code: room.code,
      seats,
      participants,
      winners: game.winners || [],
      turns: game.history,
      turnSeconds: game.turnSeconds,
      startedAt: room.startedAt || null,
      endedAt: new Date(),
    });

    const tally = tallyGame(game);
    await Promise.all(
      [...accountByName.entries()].map(async ([name, userId]) => {
        const entry = tally.get(name);
        if (!entry) return;
        const user = await User.findById(userId);
        if (!user) return;
        user.stats = applyTally(user.stats?.toObject?.() ?? user.stats, entry, record.endedAt);
        await user.save();
      })
    );

    return record;
  } catch (err) {
    console.error('Could not record finished game:', err);
    room.recorded = false; // a later attempt may succeed
    return null;
  }
}
