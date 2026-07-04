// End-to-end socket test: node itest.js  (starts its own server on :3999)
import { io } from 'socket.io-client';
import { spawn } from 'child_process';

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); failures++; }
};
const emit = (sock, ev, payload) =>
  new Promise((res) => (payload !== undefined ? sock.emit(ev, payload, res) : sock.emit(ev, res)));
const once = (sock, ev) => new Promise((res) => sock.once(ev, res));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn('node', ['index.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
await sleep(700);

try {
  const host = io(URL);
  const p1 = io(URL);
  const p2 = io(URL);

  // Create + join
  const created = await emit(host, 'host:create');
  assert(created.ok && /^[A-Z]{4}$/.test(created.code), `room created with code ${created.code}`);

  const bad = await emit(p1, 'player:join', { code: 'ZZZZ', name: 'Youcef' });
  assert(!!bad.error, `joining a bad code fails (${bad.error})`);

  const j1 = await emit(p1, 'player:join', { code: created.code, name: 'Youcef' });
  const j2 = await emit(p2, 'player:join', { code: created.code, name: 'Amine' });
  assert(j1.ok && j2.ok, 'both players joined');

  const dup = await emit(io(URL), 'player:join', { code: created.code, name: 'youcef' });
  assert(!!dup.error, `duplicate name rejected (${dup.error})`);

  // Start
  const rack1P = once(p1, 'rack');
  const rack2P = once(p2, 'rack');
  const stateP = once(host, 'state');
  const started = await emit(host, 'host:start');
  assert(started.ok, 'host started the game');
  const [rack1, rack2, st] = await Promise.all([rack1P, rack2P, stateP]);
  assert(rack1.length === 7 && rack2.length === 7, 'both players dealt 7 tiles');
  assert(st.status === 'playing' && st.bagCount === 100 - 14, `bag has ${st.bagCount} after dealing`);
  assert(st.players.every((p) => p.rack === undefined), 'broadcast state never leaks racks');

  // First move by whoever has the turn: play their first two tiles at center
  const racks = { 0: rack1, 1: rack2 };
  const socks = { 0: p1, 1: p2 };
  const mover = st.turn;
  const r = racks[mover];
  const mk = (t, row, col) =>
    t === '_' ? { row, col, letter: 'E', isBlank: true } : { row, col, letter: t };
  const placements = [mk(r[0], 7, 7), mk(r[1], 7, 8)];

  const wrongTurn = await emit(socks[1 - mover], 'player:move', { placements });
  assert(!!wrongTurn.error, `out-of-turn move rejected (${wrongTurn.error})`);

  const nextState = once(host, 'state');
  const moved = await emit(socks[mover], 'player:move', { placements });
  assert(moved.ok, 'first move accepted');
  const st2 = await nextState;
  assert(st2.board[7][7] && st2.board[7][8], 'tiles landed on the broadcast board');
  assert(st2.players[mover].score > 0, `mover scored ${st2.players[mover].score}`);
  assert(st2.turn === 1 - mover, 'turn passed to the other player');
  assert(st2.lastMove.type === 'play' && st2.lastMove.cells.length === 2, 'lastMove broadcast for host effects');

  // Pass, then the mover swaps 2 tiles on their next turn
  const rackAfterPassP = once(socks[mover], 'rack');
  const passed = await emit(socks[1 - mover], 'player:pass');
  assert(passed.ok, 'pass accepted');
  const rackAfterPass = await rackAfterPassP;
  const swapped = await emit(socks[mover], 'player:swap', { letters: rackAfterPass.slice(0, 2) });
  assert(swapped.ok, 'swap of 2 tiles accepted');

  // Rejoin: player 1 drops and reclaims their seat
  p1.disconnect();
  await sleep(300);
  const p1b = io(URL);
  await once(p1b, 'connect');
  const re = await emit(p1b, 'rejoin', { code: created.code, playerId: j1.playerId });
  assert(re.ok && re.role === 'player', 'disconnected player rejoined and reclaimed seat');
  const rackBack = await once(p1b, 'rack');
  assert(Array.isArray(rackBack) && rackBack.length > 0, 'rejoined player received their rack');

  console.log(failures === 0 ? '\nIntegration: all passed.' : `\nIntegration: ${failures} FAILED.`);
} finally {
  server.kill();
}
process.exit(failures === 0 ? 0 : 1);
