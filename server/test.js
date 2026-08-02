// Quick engine sanity tests: node test.js
import {
  createGame, startGame, applyMove, validateMove, publicState, passTurn, leavePlayer,
} from './game.js';
import { chooseBotTurn, warmBotDictionary } from './bot.js';

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else { console.error('  ✗', msg); failures++; }
};

const game = createGame();
game.players.push(
  { id: 'p1', name: 'Youcef', rack: [], score: 0, connected: true },
  { id: 'p2', name: 'Amine', rack: [], score: 0, connected: true },
);
startGame(game);
game.turn = 0;

// ── Move 1: HELLO across the center, O on DL(7,11), center DW ──
// H4 E1 L1 L1 O1×2(DL) = 9 → ×2(DW) = 18
game.players[0].rack = ['H', 'E', 'L', 'L', 'O', 'A', 'B'];
let res = applyMove(game, 0, [
  { row: 7, col: 7, letter: 'H' },
  { row: 7, col: 8, letter: 'E' },
  { row: 7, col: 9, letter: 'L' },
  { row: 7, col: 10, letter: 'L' },
  { row: 7, col: 11, letter: 'O' },
]);
assert(res.ok, 'HELLO accepted as first move');
assert(game.players[0].score === 18, `HELLO scores 18 (got ${game.players[0].score})`);
assert(game.turn === 1, 'turn advanced to player 2');
assert(game.players[0].rack.length === 7, 'rack refilled to 7');

// ── Illegal: not touching existing tiles ──
game.players[1].rack = ['C', 'A', 'T', 'X', 'Y', 'Z', 'Q'];
res = validateMove(game, 1, [
  { row: 0, col: 0, letter: 'C' },
  { row: 0, col: 1, letter: 'A' },
  { row: 0, col: 2, letter: 'T' },
]);
assert(!!res.error, `disconnected word rejected (${res.error})`);

// ── Illegal: gap in word ──
res = validateMove(game, 1, [
  { row: 9, col: 7, letter: 'C' },
  { row: 11, col: 7, letter: 'T' },
]);
assert(!!res.error, `gapped word rejected (${res.error})`);

// ── Move 2: A,Y below H → vertical HAY = 4+1+4 = 9 ──
game.players[1].rack = ['A', 'Y', 'C', 'T', 'X', 'Z', 'Q'];
res = applyMove(game, 1, [
  { row: 8, col: 7, letter: 'A' },
  { row: 9, col: 7, letter: 'Y' },
]);
assert(res.ok, 'HAY accepted');
assert(game.players[1].score === 9, `HAY scores 9 (got ${game.players[1].score})`);

// ── Move 3: P,T around E(7,8) → PET vertical, cross-word AT ──
// PET: P3×2(DL 6,8) + E1 + T1×2(DL 8,8) = 9; AT: A1 + T1×2(DL 8,8) = 3 → total 12
// (the DL under T counts for BOTH words formed this turn — official rule)
game.turn = 0;
game.players[0].rack = ['P', 'T', 'E', 'L', 'L', 'O', 'A'];
const before = game.players[0].score;
res = applyMove(game, 0, [
  { row: 6, col: 8, letter: 'P' },
  { row: 8, col: 8, letter: 'T' },
]);
assert(res.ok, 'PET/AT accepted (fills through existing E)');
assert(game.players[0].score - before === 12,
  `PET + AT scores 12 (got ${game.players[0].score - before})`);
assert(game.lastMove.words.map(w => w.word).sort().join(',') === 'AT,PET',
  `words are PET and AT (got ${game.lastMove.words.map(w => w.word).join(',')})`);

// ── Blank tile: use _ as S to extend HELLO → HELLOS, S is blank = 0 ──
// H4 E1 L1 L1 O1 S0 = 8 (no new premium: 7,12 is plain)
game.turn = 1;
game.players[1].rack = ['_', 'C', 'T', 'X', 'Z', 'Q', 'A'];
const before2 = game.players[1].score;
res = applyMove(game, 1, [{ row: 7, col: 12, letter: 'S', isBlank: true }]);
assert(res.ok, 'blank played as S in HELLOS');
assert(game.players[1].score - before2 === 8,
  `HELLOS with blank S scores 8 (got ${game.players[1].score - before2})`);
assert(game.board[7][12].isBlank === true && game.board[7][12].value === 0, 'blank stored with value 0');

// ── Rack ownership enforced ──
res = validateMove(game, 0, [{ row: 5, col: 8, letter: 'Q' }]);
assert(!!res.error, `playing a tile you don't hold is rejected (${res.error})`);

// ── Public state hides racks ──
const pub = publicState(game, 'TEST');
assert(pub.players.every(p => p.rack === undefined && typeof p.rackCount === 'number'),
  'public state exposes rackCount only');

// ── Leaving mid-game ──
{
  const g = createGame();
  g.players.push(
    { id: 'a', name: 'A', rack: [], score: 0, connected: true },
    { id: 'b', name: 'B', rack: [], score: 0, connected: true },
    { id: 'c', name: 'C', rack: [], score: 0, connected: true },
  );
  startGame(g);
  g.turn = 1;
  const bagBefore = g.bag.length;
  const tiles = g.players[1].rack.length;
  leavePlayer(g, 1);
  assert(g.players[1].left === true, 'leaving mid-game marks the seat as gone');
  assert(g.bag.length === bagBefore + tiles, 'the leaver returns their tiles to the bag');
  assert(g.turn !== 1, 'the turn moves off the seat that just left');
  assert(g.status === 'playing', 'the game continues with two players left');

  passTurn(g, g.turn);
  assert(g.turn !== 1, 'turn order skips the empty seat');

  leavePlayer(g, 2);
  assert(g.status === 'ended', 'the game ends when only one player is left');
  assert(!g.winners.includes('C'), 'a player who left cannot win');
}

// ── Lobby leave frees the seat entirely ──
{
  const g = createGame();
  g.players.push(
    { id: 'a', name: 'A', rack: [], score: 0, connected: true },
    { id: 'b', name: 'B', rack: [], score: 0, connected: true },
  );
  leavePlayer(g, 0);
  assert(g.players.length === 1 && g.players[0].name === 'B', 'leaving the lobby removes the seat');
}

// ── Bots ──
{
  warmBotDictionary();
  const g = createGame();
  g.players.push(
    { id: 'h', name: 'Human', rack: [], score: 0, connected: true },
    { id: 'x', name: 'Ada', rack: [], score: 0, connected: true, isBot: true, difficulty: 'hard' },
  );
  startGame(g);
  g.turn = 1;

  const opening = chooseBotTurn(g, 1);
  assert(opening.type === 'play', `a bot finds an opening play (got ${opening.type})`);
  assert(opening.placements.some(p => p.row === 7 && p.col === 7), 'the opening play covers the center star');
  assert(!applyMove(g, 1, opening.placements).error, 'the engine accepts the opening play');

  // 40 more bot turns on a live board — every one has to be legal.
  let illegal = 0, plays = 0;
  for (let i = 0; i < 40 && g.status === 'playing'; i++) {
    const idx = g.turn;
    const turn = chooseBotTurn(g, idx);
    if (turn.type !== 'play') { passTurn(g, idx); continue; }
    plays++;
    if (applyMove(g, idx, turn.placements).error) illegal++;
  }
  assert(illegal === 0, `every generated bot play is legal (${plays} plays, ${illegal} rejected)`);

  const empty = createGame();
  empty.players.push({ id: 'z', name: 'Zed', rack: ['Q'], score: 0, connected: true, isBot: true, difficulty: 'hard' });
  empty.bag = [];
  assert(chooseBotTurn(empty, 0).type === 'pass', 'a stuck bot with an empty bag passes');
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
