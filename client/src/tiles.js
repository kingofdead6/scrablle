// What's left to come. Every tile is either on the board or still unseen, so
// the unseen pool is just the full set minus what's been played — no server
// round-trip needed, and no secret leaks: the board is public already.
//
// Deliberately *unseen* rather than *bag*: unseen = bag + the other racks. The
// literal bag contents would let you subtract and read an opponent's rack,
// which is not something a player at a real table can do. Counting the tiles
// that are still out there is ordinary Scrabble tile-tracking.
import { TILE_COUNTS, LETTER_VALUES, VOWELS } from './constants';

const ORDER = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '_'];

/**
 * @param board    the 15×15 server board
 * @param myRack   this device's rack (omit on the host screen, which holds none)
 * @returns { rows, total, vowels, consonants, blanks } where rows is one entry
 *          per letter: { letter, left, of, value }
 */
export function unseenTiles(board, myRack = []) {
  const left = { ...TILE_COUNTS };

  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      // A blank on the board shows a letter but came out of the bag as '_'.
      const tile = cell.isBlank ? '_' : cell.letter;
      if (left[tile] > 0) left[tile]--;
    }
  }
  for (const tile of myRack) if (left[tile] > 0) left[tile]--;

  const rows = ORDER.map((letter) => ({
    letter,
    left: left[letter],
    of: TILE_COUNTS[letter],
    value: LETTER_VALUES[letter],
  }));

  let vowels = 0, consonants = 0;
  for (const row of rows) {
    if (row.letter === '_') continue;
    if (VOWELS.has(row.letter)) vowels += row.left;
    else consonants += row.left;
  }

  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.left, 0),
    vowels,
    consonants,
    blanks: left._,
  };
}
