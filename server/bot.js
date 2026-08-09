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

// ─── Judging a play ──────────────────────────────────────────────────────────
// Raw score is a poor guide on its own: the tiles you keep decide what you can
// do next turn. These are the standard rack-leave heuristics — hold blanks and
// S, keep vowels and consonants roughly balanced, shed duplicates and clunkers.

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const CLUNKY = { V: 5, W: 3, U: 1, J: 1, C: 1, B: 1, G: 1 };
const BLANK_WORTH = 24;
const S_WORTH = 8;
const IDEAL_VOWEL_SHARE = 0.4;

/** What a rack is worth to hold onto, in rough points-next-turn. */
export function leaveValue(tiles) {
  if (tiles.length === 0) return 0;

  const counts = {};
  for (const tile of tiles) counts[tile] = (counts[tile] || 0) + 1;

  let value = (counts._ || 0) * BLANK_WORTH + (counts.S || 0) * S_WORTH;

  let vowels = 0, consonants = 0;
  for (const tile of tiles) {
    if (tile === '_') continue;
    if (VOWELS.has(tile)) vowels++;
    else consonants++;
  }
  const letters = vowels + consonants;
  if (letters > 0) value -= Math.abs(vowels - letters * IDEAL_VOWEL_SHARE) * 2.5;

  for (const [tile, count] of Object.entries(counts))
    if (tile !== '_' && count > 1) value -= (count - 1) * 2.5;

  for (const tile of tiles) value -= CLUNKY[tile] || 0;

  // A Q you cannot unload is the classic way to lose a close game.
  if (counts.Q && !counts.U && !counts._) value -= 12;

  return value;
}

const rackValue = (tiles) => tiles.reduce((sum, t) => sum + (LETTER_VALUES[t] || 0), 0);

/** The rack a play would leave behind. */
function remainingAfter(rack, placements) {
  const left = [...rack];
  for (const p of placements) {
    const tile = p.isBlank ? '_' : p.letter;
    const at = left.indexOf(tile);
    if (at !== -1) left.splice(at, 1);
  }
  return left;
}

/**
 * How good a play is.
 *
 * Mid-game this is just the score. Weighting the rack you keep alongside it is
 * the textbook refinement, and it was tried here — across ~150 self-play games
 * at several weights it came out a coin flip, because this word list is broad
 * enough that almost any seven tiles bingo, so rack quality barely binds. It
 * still decides *swaps* (see tilesToSwap), where nothing else is on the line.
 *
 * Once the bag is empty the arithmetic changes and stops being a guess: going
 * out ends the game and hands you everyone else's leftovers, while tiles stuck
 * in your hand count twice against you — off your score and onto theirs.
 */
function ratePlay(game, rack, move) {
  if (game.bag.length > 0) return move.score;
  const left = remainingAfter(rack, move.placements);
  return left.length === 0 ? move.score + 30 : move.score - rackValue(left) * 2;
}

// What an "easy" bot is allowed to notice: short words only, nothing huge, and
// never all seven tiles. A beginner shouldn't lose to a 90-point bingo.
const EASY_MAX_WORD = 6;
const EASY_MAX_SCORE = 30;

// ─── Choosing a play ─────────────────────────────────────────────────────────
const KEEPERS = new Set('AEILNORSTDGU'.split(''));

/**
 * Which tiles to throw back. Tries every small subset and keeps whichever leave
 * scores best, so a bot swaps to fix its rack rather than just dumping junk.
 */
function tilesToSwap(rack, bagCount) {
  const budget = Math.min(bagCount, rack.length);
  if (budget <= 0) return [];

  let best = { letters: [], value: leaveValue(rack) };
  // Ranked worst-first, then try dropping the worst 1..budget of them.
  const ranked = rack
    .map((letter, i) => ({ letter, i, keep: letter === '_' || KEEPERS.has(letter) }))
    .sort((a, b) => Number(a.keep) - Number(b.keep));

  for (let take = 1; take <= budget; take++) {
    const letters = ranked.slice(0, take).filter((t) => t.letter !== '_').map((t) => t.letter);
    if (letters.length === 0) continue;
    const value = leaveValue(remainingAfter(rack, letters.map((letter) => ({ letter }))));
    if (value > best.value) best = { letters, value };
  }
  // Nothing improved the rack? Still shed the worst tiles rather than stall.
  if (best.letters.length === 0)
    return ranked.filter((t) => !t.keep).slice(0, Math.min(budget, 3)).map((t) => t.letter);
  return best.letters;
}

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
    const move = { placements, score: result.score, words: result.words, bingo: result.bingo };
    move.rating = ratePlay(game, player.rack, move);
    move.longest = Math.max(...result.words.map((w) => w.word.length));
    scored.push(move);
  }

  if (scored.length === 0) {
    const letters = difficulty === 'easy'
      ? player.rack.filter((l) => l !== '_').slice(0, Math.min(game.bag.length, 3))
      : tilesToSwap(player.rack, game.bag.length);
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
    // Easy only sees short, modest words — and never plays a bingo. If nothing
    // fits that description it takes the smallest play available.
    const gentle = scored.filter(
      (m) => !m.bingo && m.longest <= EASY_MAX_WORD && m.score <= EASY_MAX_SCORE
    );
    // Best of what it's allowed to see — steady rather than erratic.
    pick = gentle.length > 0 ? gentle[0] : scored[scored.length - 1];
  }

  return { type: 'play', placements: pick.placements, score: pick.score, words: pick.words, bingo: pick.bingo };
}
