import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  createGame, startGame, applyMove, passTurn, swapTiles, publicState,
  setTurnSeconds, setPreview,
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const MAX_PLAYERS = 4; // + 1 host screen = 5 devices

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Serve the built client in production (client/dist)
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Scrabble Live server running. Build the client for production.'));
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
const rooms = new Map(); // code -> { code, game, hostToken, hostSocketId, lastActivity }
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
  for (const p of room.game.players) {
    if (p.connected && p.socketId) io.to(p.socketId).emit('rack', p.rack);
  }
}

// Drop rooms with no activity for 2 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 10 * 60 * 1000);

// Auto-pass any turn whose clock has run out
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const { game } = room;
    if (game.status !== 'playing' || !game.turnEndsAt) continue;
    if (now < game.turnEndsAt) continue;
    passTurn(game, game.turn);
    broadcast(room);
  }
}, 1000);

// ─── Socket handlers ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const findRoom = () => rooms.get(socket.data.code);
  const findPlayer = (room) => room?.game.players.find(p => p.id === socket.data.playerId);

  socket.on('host:create', (cb) => {
    const code = genCode();
    const room = { code, game: createGame(), hostToken: uid(), hostSocketId: socket.id, lastActivity: Date.now() };
    rooms.set(code, room);
    socket.join(code);
    socket.data = { code, role: 'host' };
    cb?.({ ok: true, code, hostToken: room.hostToken, state: publicState(room.game, code) });
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

    const player = { id: uid(), name, rack: [], score: 0, connected: true, socketId: socket.id };
    room.game.players.push(player);
    socket.join(code);
    socket.data = { code, role: 'player', playerId: player.id };
    cb?.({ ok: true, playerId: player.id, code });
    broadcast(room);
  });

  socket.on('rejoin', ({ code, playerId, hostToken }, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return cb?.({ error: 'Room no longer exists.' });

    if (hostToken && hostToken === room.hostToken) {
      room.hostSocketId = socket.id;
      socket.join(room.code);
      socket.data = { code: room.code, role: 'host' };
      cb?.({ ok: true, role: 'host', code: room.code });
      broadcast(room);
      return;
    }
    const player = room.game.players.find(p => p.id === playerId);
    if (!player) return cb?.({ error: 'Seat not found in this room.' });
    player.connected = true;
    player.socketId = socket.id;
    socket.join(room.code);
    socket.data = { code: room.code, role: 'player', playerId };
    cb?.({ ok: true, role: 'player', code: room.code, playerId });
    broadcast(room);
  });

  socket.on('host:start', (cb) => {
    const room = findRoom();
    if (!room || socket.data.role !== 'host') return cb?.({ error: 'Only the host can start.' });
    if (room.game.status !== 'lobby') return cb?.({ error: 'Game already started.' });
    if (room.game.players.length < 2) return cb?.({ error: 'Need at least 2 players.' });
    startGame(room.game);
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
    startGame(room.game);
    cb?.({ ok: true });
    broadcast(room);
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
    cb?.({ ok: true });
    broadcast(ctx.room);
  });

  socket.on('player:pass', (cb) => {
    const ctx = guardTurn(cb);
    if (!ctx) return;
    passTurn(ctx.room.game, ctx.idx);
    cb?.({ ok: true });
    broadcast(ctx.room);
  });

  socket.on('player:swap', ({ letters }, cb) => {
    const ctx = guardTurn(cb);
    if (!ctx) return;
    const result = swapTiles(ctx.room.game, ctx.idx, letters);
    if (result.error) return cb?.(result);
    cb?.({ ok: true });
    broadcast(ctx.room);
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

server.listen(PORT, () => console.log(`Scrabble Live server on :${PORT}`));
