// End-to-end socket test: node itest.js  (starts its own server on :3999)
import { io } from 'socket.io-client';
import { spawn } from 'child_process';
import { DICTIONARY } from './game.js';

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
// Broadcasts fan out to every socket, so `once` can catch an earlier one that
// was still in flight. Wait for the payload we actually care about.
const waitFor = (sock, ev, pred, ms = 5000) =>
  new Promise((res) => {
    const timer = setTimeout(() => { sock.off(ev, handler); res(null); }, ms);
    const handler = (payload) => {
      if (!pred(payload)) return;
      clearTimeout(timer);
      sock.off(ev, handler);
      res(payload);
    };
    sock.on(ev, handler);
  });
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

  // ── Chat ──
  // Everyone in the room hears every message, including the sender.
  const heard = { host: [], p1: [], p2: [] };
  host.on('chat:new', (m) => heard.host.push(m));
  p1.on('chat:new', (m) => heard.p1.push(m));
  p2.on('chat:new', (m) => heard.p2.push(m));

  // Both joins happened before these listeners existed, so the backlog has to
  // come from the history the server hands out on demand.
  const historyP = once(p1, 'chat:history');
  await emit(p1, 'client:refresh');
  const backlog = await historyP;
  assert(Array.isArray(backlog), 'clients can pull the chat history');
  assert(backlog.some((m) => m.kind === 'system' && /Youcef joined/.test(m.text)) &&
    backlog.some((m) => m.kind === 'system' && /Amine joined/.test(m.text)),
    'the history carries the joins that happened before you looked');

  const sent = await emit(p1, 'chat:send', { text: '  hello   table  ' });
  assert(sent.ok, 'a player can post to chat');
  await sleep(200);
  const mine = heard.p2.find((m) => m.kind === 'chat' && m.name === 'Youcef');
  assert(!!mine, 'the message reached the other players');
  assert(mine?.text === 'hello table', `whitespace is collapsed (got "${mine?.text}")`);
  assert(mine?.playerId === j1.playerId, 'the message carries the sender identity');
  assert(heard.p1.some((m) => m.id === mine.id), 'the sender sees their own message too');

  const hosted = await emit(host, 'chat:send', { text: 'board screen here' });
  assert(hosted.ok, 'the host can post to chat');
  await sleep(150);
  assert(heard.p1.some((m) => m.isHost && m.text === 'board screen here'), 'host messages are flagged as such');

  const blank = await emit(p1, 'chat:send', { text: '   ' });
  assert(!!blank.error, `an empty message is refused (${blank.error})`);

  const flood = await emit(p1, 'chat:send', { text: 'again' });
  assert(!!flood.error, `back-to-back messages are throttled (${flood.error})`);

  await sleep(500);
  const longRes = await emit(p1, 'chat:send', { text: 'x'.repeat(400) });
  await sleep(150);
  const longMsg = heard.p2.filter((m) => m.kind === 'chat').at(-1);
  assert(longRes.ok && longMsg.text.length === 240, `long messages are clipped (${longMsg.text.length} chars)`);

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

  // First move by whoever has the turn. The engine enforces a dictionary, so
  // pick a real two-letter word the rack can actually spell.
  const racks = { 0: rack1, 1: rack2 };
  const socks = { 0: p1, 1: p2 };
  const mover = st.turn;
  const twoLetterPlay = (rack) => {
    const options = (t) => (t === '_' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') : [t]);
    for (let i = 0; i < rack.length; i++) {
      for (let j = 0; j < rack.length; j++) {
        if (i === j) continue;
        for (const a of options(rack[i])) {
          for (const b of options(rack[j])) {
            if (!DICTIONARY.has(a + b)) continue;
            return [
              { row: 7, col: 7, letter: a, isBlank: rack[i] === '_' },
              { row: 7, col: 8, letter: b, isBlank: rack[j] === '_' },
            ];
          }
        }
      }
    }
    return null;
  };
  const placements = twoLetterPlay(racks[mover]);
  assert(placements !== null, `found a legal opening word for rack ${racks[mover].join('')}`);

  const wrongTurn = await emit(socks[1 - mover], 'player:move', { placements });
  assert(!!wrongTurn.error, `out-of-turn move rejected (${wrongTurn.error})`);

  // Same tiles, reversed — if that spelling isn't a word the engine must say so.
  const reversed = [
    { ...placements[0], letter: placements[1].letter, isBlank: placements[1].isBlank },
    { ...placements[1], letter: placements[0].letter, isBlank: placements[0].isBlank },
  ];
  const reversedWord = reversed[0].letter + reversed[1].letter;
  if (!DICTIONARY.has(reversedWord)) {
    const notAWord = await emit(socks[mover], 'player:move', { placements: reversed });
    assert(/not a valid word/i.test(notAWord.error || ''), `non-word ${reversedWord} rejected (${notAWord.error})`);
  }

  const nextState = waitFor(host, 'state', (st) => !!st.board[7][7]);
  const moved = await emit(socks[mover], 'player:move', { placements });
  assert(moved.ok, 'first move accepted');
  assert(typeof moved.score === 'number' && moved.score > 0,
    `the move result reports its score (${moved.score})`);
  assert(Array.isArray(moved.words) && moved.words[0]?.word.length === 2 &&
    typeof moved.words[0].score === 'number',
    `the move result breaks down each word (${moved.words?.map(w => `${w.word} ${w.score}`).join(', ')})`);
  const st2 = await nextState;
  assert(st2.board[7][7] && st2.board[7][8], 'tiles landed on the broadcast board');
  assert(st2.players[mover].score === moved.score, 'the reported score matches the scoreboard');
  assert(st2.turn === 1 - mover, 'turn passed to the other player');
  assert(st2.lastMove.type === 'play' && st2.lastMove.cells.length === 2, 'lastMove broadcast for host effects');

  // Refresh pulls a fresh state + rack + history for whoever asks
  const refreshedState = once(socks[mover], 'state');
  const refreshedRack = once(socks[mover], 'rack');
  const refreshedLog = once(socks[mover], 'history');
  const refreshed = await emit(socks[mover], 'client:refresh');
  assert(refreshed.ok, 'refresh acknowledged');
  const [rst, rrack, rlog] = await Promise.all([refreshedState, refreshedRack, refreshedLog]);
  assert(rst.code === created.code && rst.board[7][7], 'refresh returns the current board');
  assert(Array.isArray(rrack) && rrack.length === 7, 'refresh returns the private rack');

  // ── Move history ──
  assert(rlog.length === 1, `the log holds the one turn played so far (${rlog.length})`);
  assert(rlog[0].playerName === st.players[mover].name && rlog[0].score === moved.score,
    `the log records who played and for how much (${rlog[0].playerName} +${rlog[0].score})`);
  assert(rlog[0].total === moved.score, 'the log carries the running total');
  assert(rlog[0].words?.[0]?.word.length === 2, 'the log keeps the words behind the score');
  assert(rst.historyCount === 1, 'state advertises how many turns are logged');

  // Pass, then the mover swaps 2 tiles on their next turn
  const rackAfterPassP = once(socks[mover], 'rack');
  const logAfterPass = waitFor(host, 'history', (h) => h.length === 2);
  const passed = await emit(socks[1 - mover], 'player:pass');
  assert(passed.ok, 'pass accepted');
  const rackAfterPass = await rackAfterPassP;
  const passLog = await logAfterPass;
  assert(passLog?.at(-1)?.type === 'pass', 'the log grows as turns are taken, passes included');

  const logAfterSwap = waitFor(host, 'history', (h) => h.length === 3);
  const swapped = await emit(socks[mover], 'player:swap', { letters: rackAfterPass.slice(0, 2) });
  assert(swapped.ok, 'swap of 2 tiles accepted');
  const swapLog = await logAfterSwap;
  assert(swapLog?.at(-1)?.type === 'swap' && swapLog.at(-1).count === 2,
    'swaps are logged with how many tiles went back');

  // Rejoin: player 1 drops and reclaims their seat
  p1.disconnect();
  await sleep(300);
  const p1b = io(URL);
  await once(p1b, 'connect');
  const re = await emit(p1b, 'rejoin', { code: created.code, playerId: j1.playerId });
  assert(re.ok && re.role === 'player', 'disconnected player rejoined and reclaimed seat');
  const rackBack = await once(p1b, 'rack');
  assert(Array.isArray(rackBack) && rackBack.length > 0, 'rejoined player received their rack');

  // ── Leaving mid-game frees the turn order ──
  const afterLeave = waitFor(host, 'state', (st) => st.players.some((p) => p.name === 'Amine' && p.left));
  const leftRes = await emit(p2, 'player:leave');
  assert(leftRes.ok, 'player left the running game');
  const stLeft = await afterLeave;
  assert(stLeft !== null, 'the empty seat is broadcast as left');
  assert(stLeft?.status === 'ended', 'the game ends once only one player remains');

  await sleep(150);
  assert(heard.host.some((m) => m.kind === 'system' && /Amine left the game/.test(m.text)),
    'leaving is announced in chat');
  assert(heard.host.some((m) => m.kind === 'system' && /^Game over/.test(m.text)),
    'the result is announced in chat');

  // ── A solo human against three bots ──
  const host2 = io(URL);
  const solo = io(URL);
  const room2 = await emit(host2, 'host:create');
  await emit(solo, 'player:join', { code: room2.code, name: 'Solo' });

  const soloOnly = await emit(host2, 'host:start');
  assert(!!soloOnly.error, `one player cannot start alone (${soloOnly.error})`);

  for (const level of ['easy', 'medium', 'hard']) {
    const added = await emit(host2, 'host:addBot', { difficulty: level });
    assert(added.ok, `added a ${level} bot`);
  }
  const overflow = await emit(host2, 'host:addBot', { difficulty: 'hard' });
  assert(!!overflow.error, `a fourth bot is refused (${overflow.error})`);

  const lobbyStateP = waitFor(host2, 'state', (st) => st.players.length === 4);
  await emit(host2, 'client:refresh');
  const lobbyState = await lobbyStateP;
  assert(lobbyState.players.length === 4 && lobbyState.players.filter((p) => p.isBot).length === 3,
    'table is one human plus three bots');
  assert(lobbyState.players.filter((p) => p.isBot).every((p) => p.difficulty),
    'bot difficulty is visible in the public state');

  const botId = lobbyState.players.find((p) => p.isBot).id;
  await emit(host2, 'host:setBotDifficulty', { id: botId, difficulty: 'easy' });
  await emit(host2, 'host:setTimer', { seconds: 0 }); // no clock — turns only move when someone acts

  let soloRack = [];
  solo.on('rack', (r) => { soloRack = r; });
  const started2 = await emit(host2, 'host:start');
  assert(started2.ok, 'game started with three bots');
  await sleep(300);
  assert(soloRack.length === 7, `the human was dealt a rack (got ${soloRack.length})`);

  // Bots think for a second or two each. The human passes whenever the turn
  // reaches them, so the table keeps moving without a clock.
  let live = null;
  const humanIdx = () => live.players.findIndex((p) => !p.isBot);
  host2.on('state', (st) => { live = st; });
  const seedP = waitFor(host2, 'state', (st) => st.status === 'playing');
  await emit(host2, 'client:refresh');
  await seedP;
  for (let i = 0; i < 10 && live.status === 'playing'; i++) {
    if (live.turn === humanIdx()) await emit(solo, 'player:pass');
    await sleep(2000);
  }
  const botState = live;
  const tilesDown = botState.board.flat().filter(Boolean).length;
  const botScores = botState.players.filter((p) => p.isBot).map((p) => p.score);
  assert(tilesDown > 0, `bots played on their own (${tilesDown} tiles on the board)`);
  assert(botScores.some((s) => s > 0), `bots are scoring (${botScores.join(', ')})`);
  assert(botState.players.filter((p) => p.isBot).every((p) => p.rackCount > 0),
    'bots keep a full rack between turns');

  // ── Closing the room evicts everyone ──
  const closedP = once(solo, 'room:closed');
  const closed = await emit(host2, 'host:close');
  assert(closed.ok, 'host closed the room');
  await closedP;
  assert(true, 'players are told the room closed');
  const gone = await emit(io(URL), 'player:join', { code: room2.code, name: 'Late' });
  assert(!!gone.error, `a closed room cannot be joined (${gone.error})`);

  console.log(failures === 0 ? '\nIntegration: all passed.' : `\nIntegration: ${failures} FAILED.`);
} finally {
  server.kill();
}
process.exit(failures === 0 ? 0 : 1);
