import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  createGame, startGame, applyMove, passTurn, swapTiles, publicState,
  setTurnSeconds, setPreview, leavePlayer, purgeLeftPlayers, humanPlayers,
} from './game.js';
import { chooseBotTurn, warmBotDictionary, pickBotName, BOT_DIFFICULTIES } from './bot.js';
import { PORT, CORS_ORIGIN, describeConfig } from './config.js';
import { connectDb } from './db/connect.js';
import api from './api/index.js';
import { checkWords } from './lib/dictionary.js';
import { attachAccounts, trackRoom, recordFinishedGame } from './accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_PLAYERS = 4; // + 1 host screen = 5 devices
const MAX_BOTS = 3;    // so a solo human can still fill the table

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '256kb' }));
app.set('trust proxy', 1); // rate limiting keys on req.ip behind a proxy

// The API has to be mounted before the SPA catch-all, or /api/* would be
// answered with index.html.
app.use('/api', api);

// Serve the built client in production (client/dist)
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Scrabble Live server running. Build the client for production.'));
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
// code -> { code, game, hostToken, hostSocketId, lastActivity, messages, botTimer }
const rooms = new Map();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function genCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function touch(room) { room.lastActivity = Date.now(); }

function broadcast(room) {
  touch(room);
  io.to(room.code).emit('state', publicState(room.game, room.code));
  // The log only grows on a completed turn, so skip it on the chatty paths
  // (tile-drag previews broadcast several times a second).
  if (room.sentHistory !== room.game.history.length) {
    room.sentHistory = room.game.history.length;
    io.to(room.code).emit('history', room.game.history);
  }
  for (const p of room.game.players) {
    if (p.connected && p.socketId) io.to(p.socketId).emit('rack', p.rack);
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
const CHAT_HISTORY = 80;   // messages kept per room, oldest dropped
const CHAT_MAX_LEN = 240;
const CHAT_MIN_GAP_MS = 400;

/** Appends a message to the room log and pushes it to everyone in the room. */
function postChat(room, message) {
  const entry = { id: uid(), ts: Date.now(), ...message };
  room.messages.push(entry);
  if (room.messages.length > CHAT_HISTORY) room.messages.splice(0, room.messages.length - CHAT_HISTORY);
  touch(room);
  io.to(room.code).emit('chat:new', entry);
  return entry;
}

const postSystem = (room, text) => postChat(room, { kind: 'system', text });

/** Any turn can be the one that ends the game — say so in chat when it is. */
function announceIfEnded(room, wasStatus) {
  if (wasStatus === 'ended' || room.game.status !== 'ended') return;
  const winners = room.game.winners || [];
  postSystem(room, winners.length > 1
    ? `Game over — ${winners.join(' & ')} tie it.`
    : `Game over — ${winners[0]} wins.`);
  // Fire-and-forget: history is worth having, never worth blocking a turn on.
  recordFinishedGame(room).catch((err) => console.error('History write failed:', err));
}

// ─── Bots ─────────────────────────────────────────────────────────────────────
// Bots think on a timer so their moves feel played rather than teleported in.
const BOT_THINK_MS = [900, 2100];

function scheduleBotTurn(room) {
  const game = room.game;
  if (room.botTimer || game.status !== 'playing') return;
  const bot = game.players[game.turn];
  if (!bot?.isBot || bot.left) return;

  game.thinking = { playerIdx: game.turn, name: bot.name };
  io.to(room.code).emit('state', publicState(game, room.code));

  const [min, max] = BOT_THINK_MS;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (rooms.get(room.code) !== room || game.status !== 'playing') return;
    const idx = game.turn;
    const current = game.players[idx];
    if (!current?.isBot || current.left) { game.thinking = null; return; }

    // Whatever happens, the bot's turn has to end — otherwise the table stalls.
    try {
      const turn = chooseBotTurn(game, idx);
      const result =
        turn.type === 'play' ? applyMove(game, idx, turn.placements)
        : turn.type === 'swap' ? swapTiles(game, idx, turn.letters)
        : { error: 'pass' };
      if (result.error) passTurn(game, idx);
    } catch (err) {
      console.error('Bot turn failed:', err);
      passTurn(game, idx);
    }

    game.thinking = null;
    announceIfEnded(room, 'playing');
    broadcast(room);
    scheduleBotTurn(room); // the next seat may be a bot too
  }, min + Math.random() * (max - min));
}

function cancelBotTurn(room) {
  clearTimeout(room.botTimer);
  room.botTimer = null;
  room.game.thinking = null;
}

// Drop rooms with no activity for 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
      cancelBotTurn(room);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

// Auto-pass any turn whose clock has run out
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const { game } = room;
    if (game.status !== 'playing' || !game.turnEndsAt) continue;
    if (now < game.turnEndsAt) continue;
    cancelBotTurn(room);
    passTurn(game, game.turn);
    announceIfEnded(room, 'playing');
    broadcast(room);
    scheduleBotTurn(room);
  }
}, 1000);

attachAccounts({ io, app, rooms });

// ─── Socket handlers ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const findRoom = () => rooms.get(socket.data.code);
  const findPlayer = (room) => room?.game.players.find(p => p.id === socket.data.playerId);

  socket.on('host:create', (cb) => {
    const code = genCode();
    const room = {
      code, game: createGame(), hostToken: uid(), hostSocketId: socket.id,
      lastActivity: Date.now(), messages: [], sentHistory: 0,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data = { code, role: 'host' };
    trackRoom(socket, code);
    cb?.({ ok: true, code, hostToken: room.hostToken, state: publicState(room.game, code), messages: room.messages });
  });

  socket.on('player:join', ({ code, name }, cb) => {
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim().slice(0, 16);
    const room = rooms.get(code);
    if (!room) return cb?.({ error: 'Room not found. Check the code.' });
    if (room.game.status !== 'lobby') return cb?.({ error: 'This game has already started.' });
    if (room.game.players.length >= MAX_PLAYERS) return cb?.({ error: 'Room is full (4 players max).' });
    if (!name) return cb?.({ error: 'Enter a name.' });
    if (room.game.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
      return cb?.({ error: 'That name is taken in this room.' });

    const player = {
      id: uid(), name, rack: [], score: 0, connected: true, socketId: socket.id,
      userId: socket.account?.id || null,
    };
    room.game.players.push(player);
    socket.join(code);
    trackRoom(socket, code);
    socket.data = { code, role: 'player', playerId: player.id };
    cb?.({ ok: true, playerId: player.id, code });
    // Announce first, then hand over the log — otherwise the joiner's own
    // "X joined" arrives as a live message and reads as unread to them.
    postSystem(room, `${player.name} joined.`);
    socket.emit('chat:history', room.messages);
    socket.emit('history', room.game.history);
    broadcast(room);
  });

  socket.on('rejoin', ({ code, playerId, hostToken }, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return cb?.({ error: 'Room no longer exists.' });

    if (hostToken && hostToken === room.hostToken) {
      room.hostSocketId = socket.id;
      socket.join(room.code);
      socket.data = { code: room.code, role: 'host' };
      trackRoom(socket, room.code);
      cb?.({ ok: true, role: 'host', code: room.code });
      socket.emit('chat:history', room.messages);
      socket.emit('history', room.game.history);
      broadcast(room);
      return;
    }
    const player = room.game.players.find(p => p.id === playerId);
    if (!player) return cb?.({ error: 'Seat not found in this room.' });
    player.connected = true;
    player.socketId = socket.id;
    socket.join(room.code);
    socket.data = { code: room.code, role: 'player', playerId };
    player.userId = player.userId || socket.account?.id || null;
    trackRoom(socket, room.code);
    cb?.({ ok: true, role: 'player', code: room.code, playerId });
    socket.emit('chat:history', room.messages);
    socket.emit('history', room.game.history);
    broadcast(room);
  });

  socket.on('host:start', (cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can start.' });
    if (room.game.status !== 'lobby') return cb?.({ error: 'Game already started.' });
    if (room.game.players.length < 2) return cb?.({ error: 'Need at least 2 players.' });
    if (humanPlayers(room.game).length === 0) return cb?.({ error: 'At least one human has to play.' });
    room.startedAt = new Date();
    room.recorded = false;
    startGame(room.game);
    cb?.({ ok: true });
    postSystem(room, 'Game on — good luck.');
    broadcast(room);
    scheduleBotTurn(room);
  });

  // ── Chat ──
  socket.on('chat:send', ({ text } = {}, cb) => {
    const room = findRoom();
    if (!room) return cb?.({ error: 'Room not found.' });

    const body = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!body) return cb?.({ error: 'Type something first.' });

    const now = Date.now();
    if (now - (socket.data.lastChatAt || 0) < CHAT_MIN_GAP_MS)
      return cb?.({ error: 'Slow down a little.' });
    socket.data.lastChatAt = now;

    const player = findPlayer(room);
    if (socket.data.role !== 'host' && !player)
      return cb?.({ error: 'You are not in this room.' });

    postChat(room, {
      kind: 'chat',
      text: body,
      name: player ? player.name : 'Host',
      playerId: player ? player.id : null,
      isHost: !player,
    });
    cb?.({ ok: true });
  });

  // ── Bots ──
  socket.on('host:addBot', ({ difficulty } = {}, cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can add bots.' });
    if (room.game.status !== 'lobby') return cb?.({ error: 'Add bots before starting the game.' });
    if (room.game.players.length >= MAX_PLAYERS) return cb?.({ error: 'The table is full (4 players max).' });
    if (room.game.players.filter((p) => p.isBot).length >= MAX_BOTS)
      return cb?.({ error: `Up to ${MAX_BOTS} bots per game.` });

    const level = BOT_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';
    const name = pickBotName(room.game.players.map((p) => p.name));
    room.game.players.push({
      id: uid(), name, rack: [], score: 0, connected: true, socketId: null,
      isBot: true, difficulty: level,
    });
    // First bot in the room pays for the prefix index; do it off the event loop.
    setImmediate(warmBotDictionary);
    cb?.({ ok: true });
    postSystem(room, `${name} sat down (${level} bot).`);
    broadcast(room);
  });

  socket.on('host:removeBot', ({ id }, cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can remove bots.' });
    if (room.game.status !== 'lobby') return cb?.({ error: 'Bots can only be removed in the lobby.' });
    const idx = room.game.players.findIndex((p) => p.id === id && p.isBot);
    if (idx === -1) return cb?.({ error: 'That bot is not at the table.' });
    room.game.players.splice(idx, 1);
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('host:setBotDifficulty', ({ id, difficulty }, cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can change bots.' });
    if (!BOT_DIFFICULTIES.includes(difficulty)) return cb?.({ error: 'Unknown difficulty.' });
    const bot = room.game.players.find((p) => p.id === id && p.isBot);
    if (!bot) return cb?.({ error: 'That bot is not at the table.' });
    bot.difficulty = difficulty;
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('host:setTimer', ({ seconds }, cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can change the timer.' });
    if (room.game.status !== 'lobby') return cb?.({ error: 'Set the timer before starting the game.' });
    const result = setTurnSeconds(room.game, seconds);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    broadcast(room);
  });

  socket.on('host:restart', (cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can restart.' });
    if (room.game.status !== 'ended') return cb?.({ error: 'The game is still in progress.' });
    cancelBotTurn(room);
    purgeLeftPlayers(room.game);
    if (room.game.players.length < 2) return cb?.({ error: 'Not enough players left for a rematch.' });
    if (humanPlayers(room.game).length === 0) return cb?.({ error: 'At least one human has to play.' });
    room.startedAt = new Date();
    room.recorded = false;
    startGame(room.game);
    cb?.({ ok: true });
    postSystem(room, 'Rematch — new board, same table.');
    broadcast(room);
    scheduleBotTurn(room);
  });

  // Re-send the current state to whoever asked (the in-game refresh button).
  socket.on('client:refresh', (cb) => {
    const room = findRoom();
    if (!room) return cb?.({ error: 'Room not found.' });
    touch(room);
    socket.emit('state', publicState(room.game, room.code));
    socket.emit('chat:history', room.messages);
    socket.emit('history', room.game.history);
    const player = findPlayer(room);
    if (player) socket.emit('rack', player.rack);
    cb?.({ ok: true });
  });

  // Give up your seat. In the lobby it frees the slot; mid-game the turn order
  // closes over you and your tiles go back to the bag.
  socket.on('player:leave', (cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'player') return cb?.({ error: 'You are not seated in a game.' });
    const player = findPlayer(room);
    if (!player) return cb?.({ error: 'You are not seated in a game.' });
    cancelBotTurn(room);
    const wasStatus = room.game.status;
    const result = leavePlayer(room.game, room.game.players.indexOf(player));
    if (result.error) return cb?.(result);
    socket.leave(room.code);
    socket.data = {};
    trackRoom(socket, null);
    cb?.({ ok: true });
    postSystem(room, `${player.name} left the game.`);
    announceIfEnded(room, wasStatus);
    broadcast(room);
    scheduleBotTurn(room);
  });

  const guardTurn = (cb) => {
    const room = findRoom();
    if (!room) { cb?.({ error: 'Room not found.' }); return null; }
    if (room.game.status !== 'playing') { cb?.({ error: 'The game is not running.' }); return null; }
    const player = findPlayer(room);
    if (!player) { cb?.({ error: 'You are not seated in this game.' }); return null; }
    const idx = room.game.players.indexOf(player);
    if (room.game.turn !== idx) { cb?.({ error: 'Not your turn.' }); return null; }
    return { room, idx };
  };

  socket.on('player:move', ({ placements }, cb) => {
    const ctx = guardTurn(cb);
    if (!ctx) return;
    const result = applyMove(ctx.room.game, ctx.idx, placements);
    if (result.error) return cb?.(result);
    // Hand the breakdown back so the player sees what the word was worth.
    const scored = ctx.room.game.lastMove;
    cb?.({ ok: true, score: scored.score, words: scored.words, bingo: scored.bingo });
    announceIfEnded(ctx.room, 'playing');
    broadcast(ctx.room);
    scheduleBotTurn(ctx.room);
  });

  socket.on('player:pass', (cb) => {
    const ctx = guardTurn(cb);
    if (!ctx) return;
    passTurn(ctx.room.game, ctx.idx);
    cb?.({ ok: true });
    announceIfEnded(ctx.room, 'playing');
    broadcast(ctx.room);
    scheduleBotTurn(ctx.room);
  });

  socket.on('player:swap', ({ letters }, cb) => {
    const ctx = guardTurn(cb);
    if (!ctx) return;
    const result = swapTiles(ctx.room.game, ctx.idx, letters);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    announceIfEnded(ctx.room, 'playing');
    broadcast(ctx.room);
    scheduleBotTurn(ctx.room);
  });

  /**
   * Is what I've laid out a real word (yet)? Answers per word so the board can
   * outline each one green or red before the player commits. Read-only — it
   * never touches the game, and applyMove still has the final say.
   */
  socket.on('word:check', ({ words } = {}, cb) => {
    cb?.({ results: checkWords(words) });
  });

  // Live "shadow tile" preview of tiles a player has staged but not yet submitted.
  socket.on('player:preview', ({ placements }) => {
    const room = findRoom();
    if (!room || room.game.status !== 'playing') return;
    const player = findPlayer(room);
    if (!player) return;
    const idx = room.game.players.indexOf(player);
    if (room.game.turn !== idx) return;
    setPreview(room.game, idx, placements);
    broadcast(room);
  });

  socket.on('host:close', (cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can close the room.' });
    cancelBotTurn(room);
    io.to(room.code).emit('room:closed');
    rooms.delete(room.code);
    socket.leave(room.code);
    socket.data = {};
    trackRoom(socket, null);
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const room = findRoom();
    if (!room) return;
    if (socket.data.role === 'player') {
      const player = findPlayer(room);
      if (player) {
        player.connected = false;
        player.socketId = null;
        broadcast(room);
      }
    }
    // Host disconnect: keep the room alive so the host screen can rejoin.
  });
});

const config = describeConfig();
await connectDb();
server.listen(PORT, () => {
  console.log(`Scrabble Live server on :${PORT}`);
  console.log(`  accounts: ${config.accounts ? 'on' : 'off (guest play only)'}`);
  console.log(`  uploads:  ${config.uploads ? 'on' : 'off (no profile pictures)'}`);
  if (config.missing.length > 0) console.log(`  unset:    ${config.missing.join(', ')}`);
});
