// ─── Scrabble engine (server-authoritative) ──────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORDLIST_PATH = join(__dirname, 'node_modules', 'an-array-of-english-words', 'index.json');
const DICTIONARY = new Set(
  JSON.parse(readFileSync(WORDLIST_PATH, 'utf8')).map((w) => w.toUpperCase())
);

export const LETTER_VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
  M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10, _: 0, // _ = blank
};

const TILE_COUNTS = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4,
  M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1,
  Y: 2, Z: 1, _: 2,
};

// Premium squares (standard 15x15 layout)
const TW = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
const DW = [[1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
            [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],[7,7]];
const TL = [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]];
const DL = [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],
            [7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]];

export const BONUS = Array.from({ length: 15 }, () => Array(15).fill(null));
for (const [r, c] of TW) BONUS[r][c] = 'TW';
for (const [r, c] of DW) BONUS[r][c] = 'DW';
for (const [r, c] of TL) BONUS[r][c] = 'TL';
for (const [r, c] of DL) BONUS[r][c] = 'DL';

const RACK_SIZE = 7;
const inBounds = (r, c) => r >= 0 && r < 15 && c >= 0 && c < 15;

function shuffledBag() {
  const bag = [];
  for (const [letter, count] of Object.entries(TILE_COUNTS))
    for (let i = 0; i < count; i++) bag.push(letter);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createGame() {
  return {
    board: Array.from({ length: 15 }, () => Array(15).fill(null)),
    bag: shuffledBag(),
    players: [], // { id, name, rack: [], score, connected, socketId }
    turn: 0,
    status: 'lobby', // lobby | playing | ended
    firstMoveDone: false,
    scorelessTurns: 0,
    lastMove: null,   // { playerName, type, words, score, cells }
    winners: null,    // [names]
  };
}

export function startGame(game) {
  game.status = 'playing';
  game.firstMoveDone = false;
  game.scorelessTurns = 0;
  game.lastMove = null;
  game.winners = null;
  game.bag = shuffledBag();
  game.board = Array.from({ length: 15 }, () => Array(15).fill(null));
  game.turn = Math.floor(Math.random() * game.players.length);
  for (const p of game.players) {
    p.score = 0;
    p.rack = [];
    drawTiles(game, p);
  }
}

function drawTiles(game, player) {
  while (player.rack.length < RACK_SIZE && game.bag.length > 0)
    player.rack.push(game.bag.pop());
}

// ─── Move validation + scoring ───────────────────────────────────────────────
// placements: [{ row, col, letter: 'A'-'Z', isBlank: bool }]
export function validateMove(game, playerIdx, placements) {
  if (!Array.isArray(placements) || placements.length === 0 || placements.length > RACK_SIZE)
    return { error: 'Place between 1 and 7 tiles.' };

  const player = game.players[playerIdx];
  const seen = new Set();
  for (const p of placements) {
    if (!Number.isInteger(p.row) || !Number.isInteger(p.col) || !inBounds(p.row, p.col))
      return { error: 'Tile out of bounds.' };
    const key = `${p.row},${p.col}`;
    if (seen.has(key)) return { error: 'Two tiles on the same square.' };
    seen.add(key);
    if (game.board[p.row][p.col]) return { error: 'That square is already taken.' };
    if (typeof p.letter !== 'string' || !/^[A-Z]$/.test(p.letter))
      return { error: 'Invalid letter.' };
  }

  // Rack ownership check
  const need = {};
  for (const p of placements) {
    const t = p.isBlank ? '_' : p.letter;
    need[t] = (need[t] || 0) + 1;
  }
  const have = {};
  for (const t of player.rack) have[t] = (have[t] || 0) + 1;
  for (const t of Object.keys(need))
    if ((have[t] || 0) < need[t]) return { error: "You don't have those tiles." };

  // Single line
  const rows = new Set(placements.map(p => p.row));
  const cols = new Set(placements.map(p => p.col));
  let axis = null; // 'H' | 'V' | null (single tile)
  if (rows.size > 1 && cols.size > 1) return { error: 'Tiles must be in one row or one column.' };
  if (placements.length > 1) axis = rows.size === 1 ? 'H' : 'V';

  // Temp board with new tiles flagged
  const temp = game.board.map(row => row.slice());
  for (const p of placements)
    temp[p.row][p.col] = {
      letter: p.letter,
      value: p.isBlank ? 0 : LETTER_VALUES[p.letter],
      isBlank: !!p.isBlank,
      isNew: true,
    };

  // No gaps between first and last placed tile
  if (axis === 'H') {
    const r = placements[0].row;
    const cs = placements.map(p => p.col);
    for (let c = Math.min(...cs); c <= Math.max(...cs); c++)
      if (!temp[r][c]) return { error: 'There is a gap in your word.' };
  } else if (axis === 'V') {
    const c = placements[0].col;
    const rs = placements.map(p => p.row);
    for (let r = Math.min(...rs); r <= Math.max(...rs); r++)
      if (!temp[r][c]) return { error: 'There is a gap in your word.' };
  }

  // First move / connectivity
  if (!game.firstMoveDone) {
    if (!placements.some(p => p.row === 7 && p.col === 7))
      return { error: 'The first word must cover the center star.' };
    if (placements.length < 2)
      return { error: 'The first word needs at least 2 letters.' };
  } else {
    const touches = placements.some(p =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
        const r = p.row + dr, c = p.col + dc;
        return inBounds(r, c) && game.board[r][c];
      })
    );
    if (!touches) return { error: 'Your word must connect to tiles already on the board.' };
  }

  // Collect words
  const readWord = (r, c, dr, dc) => {
    while (inBounds(r - dr, c - dc) && temp[r - dr][c - dc]) { r -= dr; c -= dc; }
    const cells = [];
    while (inBounds(r, c) && temp[r][c]) {
      cells.push({ r, c, cell: temp[r][c] });
      r += dr; c += dc;
    }
    return cells;
  };

  const words = [];
  const anchor = placements[0];
  if (axis === 'H' || axis === null) {
    const w = readWord(anchor.row, anchor.col, 0, 1);
    if (w.length >= 2 && (axis === 'H' || axis === null)) words.push(w);
  }
  if (axis === 'V' || axis === null) {
    const w = readWord(anchor.row, anchor.col, 1, 0);
    if (w.length >= 2) words.push(w);
  }
  // Cross-words perpendicular to the main axis
  if (axis === 'H') {
    for (const p of placements) {
      const w = readWord(p.row, p.col, 1, 0);
      if (w.length >= 2) words.push(w);
    }
  } else if (axis === 'V') {
    for (const p of placements) {
      const w = readWord(p.row, p.col, 0, 1);
      if (w.length >= 2) words.push(w);
    }
  }
  if (words.length === 0)
    return { error: 'A play must form a word of at least 2 letters.' };

  // Dictionary check — every word formed (main + cross-words) must be real
  const invalid = words
    .map((cells) => cells.map((x) => x.cell.letter).join(''))
    .filter((w) => !DICTIONARY.has(w));
  if (invalid.length > 0)
    return { error: `Not a valid word: ${invalid.join(', ')}` };

  // Score
  let total = 0;
  const scoredWords = words.map(cells => {
    let sum = 0, mult = 1;
    for (const { r, c, cell } of cells) {
      let v = cell.value;
      if (cell.isNew) {
        const b = BONUS[r][c];
        if (b === 'DL') v *= 2;
        else if (b === 'TL') v *= 3;
        else if (b === 'DW') mult *= 2;
        else if (b === 'TW') mult *= 3;
      }
      sum += v;
    }
    const score = sum * mult;
    total += score;
    return { word: cells.map(x => x.cell.letter).join(''), score };
  });
  const bingo = placements.length === RACK_SIZE;
  if (bingo) total += 50;

  return { words: scoredWords, score: total, bingo };
}

export function applyMove(game, playerIdx, placements) {
  const result = validateMove(game, playerIdx, placements);
  if (result.error) return result;

  const player = game.players[playerIdx];
  for (const p of placements) {
    const t = p.isBlank ? '_' : p.letter;
    player.rack.splice(player.rack.indexOf(t), 1);
    game.board[p.row][p.col] = {
      letter: p.letter,
      value: p.isBlank ? 0 : LETTER_VALUES[p.letter],
      isBlank: !!p.isBlank,
    };
  }
  player.score += result.score;
  game.firstMoveDone = true;
  game.scorelessTurns = 0;
  game.lastMove = {
    playerName: player.name,
    type: 'play',
    words: result.words,
    score: result.score,
    bingo: result.bingo,
    cells: placements.map(p => ({ row: p.row, col: p.col })),
  };

  drawTiles(game, player);
  if (player.rack.length === 0 && game.bag.length === 0) {
    finishGame(game, playerIdx);
  } else {
    nextTurn(game);
  }
  return { ok: true };
}

export function passTurn(game, playerIdx) {
  const player = game.players[playerIdx];
  game.lastMove = { playerName: player.name, type: 'pass' };
  game.scorelessTurns++;
  if (game.scorelessTurns >= game.players.length * 2) finishGame(game, null);
  else nextTurn(game);
  return { ok: true };
}

export function swapTiles(game, playerIdx, letters) {
  if (!Array.isArray(letters) || letters.length === 0)
    return { error: 'Select tiles to swap first.' };
  if (game.bag.length < letters.length)
    return { error: `Only ${game.bag.length} tiles left in the bag.` };

  const player = game.players[playerIdx];
  const rackCopy = [...player.rack];
  for (const l of letters) {
    const i = rackCopy.indexOf(l);
    if (i === -1) return { error: "You don't have those tiles." };
    rackCopy.splice(i, 1);
  }
  // Remove from rack, draw replacements, then return old tiles to the bag
  for (const l of letters) player.rack.splice(player.rack.indexOf(l), 1);
  drawTiles(game, player);
  game.bag.push(...letters);
  for (let i = game.bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [game.bag[i], game.bag[j]] = [game.bag[j], game.bag[i]];
  }
  game.lastMove = { playerName: player.name, type: 'swap', count: letters.length };
  game.scorelessTurns++;
  if (game.scorelessTurns >= game.players.length * 2) finishGame(game, null);
  else nextTurn(game);
  return { ok: true };
}

function nextTurn(game) {
  game.turn = (game.turn + 1) % game.players.length;
}

function finishGame(game, outPlayerIdx) {
  const leftover = game.players.map(p =>
    p.rack.reduce((s, t) => s + LETTER_VALUES[t], 0)
  );
  game.players.forEach((p, i) => {
    if (i === outPlayerIdx) {
      p.score += leftover.reduce((s, v, j) => (j === i ? s : s + v), 0);
    } else {
      p.score -= leftover[i];
    }
  });
  const best = Math.max(...game.players.map(p => p.score));
  game.winners = game.players.filter(p => p.score === best).map(p => p.name);
  game.status = 'ended';
}

// State safe to broadcast to everyone (racks hidden)
export function publicState(game, code) {
  return {
    code,
    status: game.status,
    board: game.board,
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      rackCount: p.rack.length,
      connected: p.connected,
    })),
    turn: game.turn,
    bagCount: game.bag.length,
    lastMove: game.lastMove,
    winners: game.winners,
  };
}
