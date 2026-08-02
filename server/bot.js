// ─── Computer opponents ──────────────────────────────────────────────────────
// Move generation follows the classic anchor + cross-check approach: only empty
// squares touching the existing board ("anchors") can start a play, every empty
// square carries the set of letters its perpendicular word would still allow,
// and a prefix set prunes dead branches before the rack is exhausted.

import { DICTIONARY, LETTER_VALUES, validateMove } from './game.js';

const SIZE = 15;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_CANDIDATES = 8000; // plenty for a strong play, keeps a turn well under a second

export const BOT_DIFFICULTIES = ['easy', 'medium', 'hard'];

const BOT_NAMES = [
  'Ada', 'Bishop', 'Cortex', 'Domino', 'Echo', 'Fable',
  'Glyph', 'Hexa', 'Iris', 'Jinx', 'Koda', 'Lexi',
];

export function pickBotName(taken) {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  const free = BOT_NAMES.filter((n) => !used.has(n.toLowerCase()));
  const pool = free.length > 0 ? free : BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Prefix index (built once, on demand) ────────────────────────────────────
let PREFIXES = null;

/** Builds the prefix index if it isn't ready yet. ~0.5s, so call it early. */
export function warmBotDictionary() {
  if (PREFIXES) return PREFIXES;
  const set = new Set();
  for (const word of DICTIONARY)
    for (let i = 1; i <= word.length; i++) set.add(word.slice(0, i));
  PREFIXES = set;
  return PREFIXES;
}

// ─── Move generation ─────────────────────────────────────────────────────────
const transpose = (grid) =>
  Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => grid[c][r]));

/** For each empty square, which letters keep the perpendicular word real. null = any. */
function buildCrossChecks(grid) {
  const cross = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] != null) continue;
      let above = '';
      for (let i = r - 1; i >= 0 && grid[i][c] != null; i--) above = grid[i][c] + above;
      let below = '';
      for (let i = r + 1; i < SIZE && grid[i][c] != null; i++) below += grid[i][c];
      if (!above && !below) continue; // no vertical neighbours → nothing to check
      const allowed = new Set();
      for (const l of ALPHABET) if (DICTIONARY.has(above + l + below)) allowed.add(l);
      cross[r][c] = allowed;
    }
  }
  return cross;
}

function buildAnchors(grid) {
  const isAnchor = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  const anchors = [];
  const occupied = grid.some((row) => row.some((cell) => cell != null));
  if (!occupied) {
    isAnchor[7][7] = true;
    return { anchors: [[7, 7]], isAnchor };
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] != null) continue;
      const touches =
        (r > 0 && grid[r - 1][c] != null) ||
        (r < SIZE - 1 && grid[r + 1][c] != null) ||
        (c > 0 && grid[r][c - 1] != null) ||
        (c < SIZE - 1 && grid[r][c + 1] != null);
      if (touches) {
        isAnchor[r][c] = true;
        anchors.push([r, c]);
      }
    }
  }
  return { anchors, isAnchor };
}

/**
 * Walks every legal play that runs left→right across `grid`. Vertical plays come
 * from running this again over the transposed board, hence `transposed`, which
 * only decides how coordinates are mapped back to the real board.
 */
function generateForGrid(grid, rackCounts, transposed, out, seen) {
  const prefixes = warmBotDictionary();
  const cross = buildCrossChecks(grid);
  const { anchors, isAnchor } = buildAnchors(grid);
  const toBoard = transposed ? (r, c) => [c, r] : (r, c) => [r, c];

  for (const [row, anchorCol] of anchors) {
    if (out.length >= MAX_CANDIDATES) return;
    const line = grid[row];

    const record = (placements) => {
      if (placements.length === 0 || out.length >= MAX_CANDIDATES) return;
      const move = placements.map((p) => {
        const [r, c] = toBoard(p.r, p.c);
        return { row: r, col: c, letter: p.letter, isBlank: p.isBlank };
      });
      const key = move
        .map((p) => `${p.row},${p.col},${p.letter},${p.isBlank ? 1 : 0}`)
        .sort()
        .join('|');
      if (seen.has(key)) return;
      seen.add(key);
      out.push(move);
    };

    // `placements` is mutated in place while we recurse; it always holds concrete
    // squares, so a completed word can be recorded straight from it.
    const extendRight = (word, col, placements) => {
      if (out.length >= MAX_CANDIDATES) return;
      // Only words that reach past the anchor touch the board — anything ending
      // before it would be floating on its own.
      const complete = col > anchorCol && placements.length > 0 && word.length >= 2;

      if (col >= SIZE) {
        if (complete && DICTIONARY.has(word)) record(placements);
        return;
      }
      const onBoard = line[col];
      if (onBoard != null) {
        const next = word + onBoard;
        if (prefixes.has(next)) extendRight(next, col + 1, placements);
        return;
      }
      if (complete && DICTIONARY.has(word)) record(placements); // the word ends at this gap

      const allowed = cross[row][col];
      for (const tile of Object.keys(rackCounts)) {
        if (rackCounts[tile] <= 0) continue;
        const options = tile === '_' ? ALPHABET : tile;
        for (const letter of options) {
          if (allowed && !allowed.has(letter)) continue;
          const next = word + letter;
          if (!prefixes.has(next)) continue;
          rackCounts[tile]--;
          placements.push({ r: row, c: col, letter, isBlank: tile === '_' });
          extendRight(next, col + 1, placements);
          placements.pop();
          rackCounts[tile]++;
        }
      }
    };

    if (anchorCol > 0 && line[anchorCol - 1] != null) {
      // Tiles already sit to the left — that fixed run is our starting prefix.
      let start = anchorCol - 1;
      while (start > 0 && line[start - 1] != null) start--;
      let word = '';
      for (let i = start; i < anchorCol; i++) word += line[i];
      if (prefixes.has(word)) extendRight(word, anchorCol, []);
      continue;
    }

    // Free squares to the left, up to the next anchor or tile. They have no
    // neighbours by definition, so no cross-checks apply to them.
    let limit = 0;
    for (let c = anchorCol - 1; c >= 0 && line[c] == null && !isAnchor[row][c]; c--) limit++;

    const buildLeft = (word, remaining, tiles) => {
      if (out.length >= MAX_CANDIDATES) return;
      const placements = tiles.map((t, i) => ({
        r: row,
        c: anchorCol - tiles.length + i,
        letter: t.letter,
        isBlank: t.isBlank,
      }));
      extendRight(word, anchorCol, placements);
      if (remaining <= 0) return;
      for (const tile of Object.keys(rackCounts)) {
        if (rackCounts[tile] <= 0) continue;
        const options = tile === '_' ? ALPHABET : tile;
        for (const letter of options) {
          const next = word + letter;
          if (!prefixes.has(next)) continue;
          rackCounts[tile]--;
          buildLeft(next, remaining - 1, [...tiles, { letter, isBlank: tile === '_' }]);
          rackCounts[tile]++;
        }
      }
    };
    buildLeft('', limit, []);
  }
}

/** Every legal play available to `playerIdx`, unscored. */
export function findMoves(game, playerIdx) {
  const player = game.players[playerIdx];
  if (!player || player.rack.length === 0) return [];

  const grid = game.board.map((row) => row.map((cell) => (cell ? cell.letter : null)));
  const rackCounts = {};
  for (const tile of player.rack) rackCounts[tile] = (rackCounts[tile] || 0) + 1;

  const out = [];
  const seen = new Set();
  generateForGrid(grid, rackCounts, false, out, seen);
  generateForGrid(transpose(grid), rackCounts, true, out, seen);
  return out;
}

// ─── Choosing a play ─────────────────────────────────────────────────────────
const KEEPERS = new Set('AEILNORSTDGU'.split(''));

/** Tiles a bot is happy to throw back: awkward letters first, then duplicates. */
function tilesToSwap(rack, bagCount) {
  const budget = Math.min(bagCount, rack.length);
  if (budget <= 0) return [];
  const seen = {};
  const ranked = rack
    .map((letter, i) => {
      seen[letter] = (seen[letter] || 0) + 1;
      const awkward = letter !== '_' && !KEEPERS.has(letter);
      const duplicate = seen[letter] > 2;
      return { letter, i, weight: (awkward ? 2 : 0) + (duplicate ? 1 : 0) + (LETTER_VALUES[letter] >= 8 ? 2 : 0) };
    })
    .filter((t) => t.letter !== '_' && t.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, budget);
  // Nothing obviously bad? Dump the back half of the rack and hope for better.
  if (ranked.length === 0)
    return rack.filter((l) => l !== '_').slice(0, Math.min(budget, 3));
  return ranked.map((t) => t.letter);
}

const sampleIndices = (length, count) =>
  Array.from({ length: Math.min(count, length) }, () => Math.floor(Math.random() * length));

/**
 * Picks this bot's turn. Returns one of:
 *   { type: 'play', placements, score, words, bingo }
 *   { type: 'swap', letters }
 *   { type: 'pass' }
 */
export function chooseBotTurn(game, playerIdx) {
  const player = game.players[playerIdx];
  const difficulty = BOT_DIFFICULTIES.includes(player?.difficulty) ? player.difficulty : 'medium';

  const scored = [];
  for (const placements of findMoves(game, playerIdx)) {
    const result = validateMove(game, playerIdx, placements);
    if (result.error) continue;
    const blanks = placements.filter((p) => p.isBlank).length;
    scored.push({
      placements,
      score: result.score,
      words: result.words,
      bingo: result.bingo,
      // Bots hold on to blanks unless the play really pays for them.
      rating: result.score - blanks * 5,
    });
  }

  if (scored.length === 0) {
    const letters = tilesToSwap(player.rack, game.bag.length);
    return letters.length > 0 ? { type: 'swap', letters } : { type: 'pass' };
  }

  scored.sort((a, b) => b.rating - a.rating);
  let pick;
  if (difficulty === 'hard') {
    pick = scored[0];
  } else if (difficulty === 'medium') {
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.15))).slice(0, 12);
    pick = top[Math.floor(Math.random() * top.length)];
  } else {
    // Easy plays the best word it happens to notice — a handful of random looks.
    pick = scored[Math.min(...sampleIndices(scored.length, 6))];
  }

  return { type: 'play', placements: pick.placements, score: pick.score, words: pick.words, bingo: pick.bingo };
}
