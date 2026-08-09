// Client-side preview of what a staged play is worth. Mirrors the geometry and
// scoring rules in server/game.js, minus the dictionary — the server stays the
// authority on whether a word is real, this just answers "how many points?".
import { BONUS, LETTER_VALUES } from './constants';

const inBounds = (r, c) => r >= 0 && r < 15 && c >= 0 && c < 15;

/**
 * @param board  the 15×15 server board (cells or null)
 * @param placements [{ row, col, letter, isBlank }] — letters already resolved
 * @returns { valid, score, words: [{word, score, cells}], bingo }
 *          or { valid: false, reason }
 */
export function scoreStaged(board, placements) {
  if (!Array.isArray(placements) || placements.length === 0)
    return { valid: false, reason: 'Nothing placed yet.' };

  const rows = new Set(placements.map((p) => p.row));
  const cols = new Set(placements.map((p) => p.col));
  if (rows.size > 1 && cols.size > 1)
    return { valid: false, reason: 'Tiles must be in one row or one column.' };
  const axis = placements.length > 1 ? (rows.size === 1 ? 'H' : 'V') : null;

  const temp = board.map((row) => row.slice());
  for (const p of placements) {
    if (!inBounds(p.row, p.col) || temp[p.row][p.col])
      return { valid: false, reason: 'That square is taken.' };
    temp[p.row][p.col] = {
      letter: p.letter,
      value: p.isBlank ? 0 : LETTER_VALUES[p.letter] || 0,
      isNew: true,
    };
  }

  if (axis === 'H') {
    const r = placements[0].row;
    const cs = placements.map((p) => p.col);
    for (let c = Math.min(...cs); c <= Math.max(...cs); c++)
      if (!temp[r][c]) return { valid: false, reason: 'There is a gap in your word.' };
  } else if (axis === 'V') {
    const c = placements[0].col;
    const rs = placements.map((p) => p.row);
    for (let r = Math.min(...rs); r <= Math.max(...rs); r++)
      if (!temp[r][c]) return { valid: false, reason: 'There is a gap in your word.' };
  }

  const boardEmpty = board.every((row) => row.every((cell) => !cell));
  if (boardEmpty) {
    if (!placements.some((p) => p.row === 7 && p.col === 7))
      return { valid: false, reason: 'Cover the center star.' };
    if (placements.length < 2)
      return { valid: false, reason: 'The first word needs 2+ letters.' };
  } else {
    const touches = placements.some((p) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
        const r = p.row + dr, c = p.col + dc;
        return inBounds(r, c) && board[r][c];
      })
    );
    if (!touches) return { valid: false, reason: 'Connect to a tile on the board.' };
  }

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
    if (w.length >= 2) words.push(w);
  }
  if (axis === 'V' || axis === null) {
    const w = readWord(anchor.row, anchor.col, 1, 0);
    if (w.length >= 2) words.push(w);
  }
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
    return { valid: false, reason: 'A play needs a word of 2+ letters.' };

  let total = 0;
  const scored = words.map((cells) => {
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
    return {
      word: cells.map((x) => x.cell.letter).join(''),
      score,
      // Squares this word covers, so the board can outline it once the server
      // says whether it is real.
      cells: cells.map((x) => `${x.r},${x.c}`),
    };
  });

  const bingo = placements.length === 7;
  if (bingo) total += 50;
  return { valid: true, score: total, words: scored, bingo };
}
