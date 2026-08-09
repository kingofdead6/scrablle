// Dictionary lookups for the standalone word-search page and the in-game
// "is this word real yet?" check. Built on the same word set the engine plays
// by, so the page can never disagree with the board.

import { DICTIONARY, LETTER_VALUES } from '../game.js';

export const MAX_RESULTS = 60;

const clean = (input) => String(input ?? '').trim().toUpperCase();
const isWordShape = (word) => /^[A-Z]{1,15}$/.test(word);

/** Points the word is worth on a bare board, ignoring premium squares. */
export const faceValue = (word) =>
  [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] || 0), 0);

// Built on first use — a couple of hundred ms, and only if somebody searches.
let byLength = null;
let sortedWords = null;

function index() {
  if (byLength) return { byLength, sortedWords };
  byLength = new Map();
  sortedWords = [];
  for (const word of DICTIONARY) {
    sortedWords.push(word);
    if (!byLength.has(word.length)) byLength.set(word.length, []);
    byLength.get(word.length).push(word);
  }
  sortedWords.sort();
  return { byLength, sortedWords };
}

/** Exact lookup. `{ word, valid, length, value }`, or an error for junk input. */
export function lookup(input) {
  const word = clean(input);
  if (!word) return { error: 'Type a word to look up.' };
  if (!/^[A-Za-z]+$/.test(word)) return { error: 'Letters only — no spaces, digits or punctuation.' };
  if (word.length > 15) return { error: 'Words on a Scrabble board top out at 15 letters.' };
  return { word, valid: DICTIONARY.has(word), length: word.length, value: faceValue(word) };
}

/** Every real word that starts with `prefix`, shortest first. */
export function startingWith(prefix, limit = MAX_RESULTS) {
  const start = clean(prefix);
  if (!isWordShape(start)) return [];
  const { sortedWords } = index();

  // Binary search to the first candidate, then walk while the prefix holds.
  let lo = 0, hi = sortedWords.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedWords[mid] < start) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < sortedWords.length && out.length < limit; i++) {
    if (!sortedWords[i].startsWith(start)) break;
    out.push(sortedWords[i]);
  }
  return out.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * Words you could build from a rack. `?` stands for a blank and matches any
 * letter. Longest (and then highest scoring) first — what a player wants to see.
 */
export function fromLetters(input, limit = MAX_RESULTS) {
  const rack = clean(input).replace(/[^A-Z?]/g, '');
  if (rack.length < 2) return [];
  const letters = rack.slice(0, 12); // a whole-rack search is already generous

  const have = {};
  let blanks = 0;
  for (const letter of letters) {
    if (letter === '?') blanks++;
    else have[letter] = (have[letter] || 0) + 1;
  }

  const { byLength } = index();
  const out = [];
  for (let length = Math.min(letters.length, 15); length >= 2; length--) {
    for (const word of byLength.get(length) || []) {
      let spare = blanks;
      const used = {};
      let fits = true;
      for (const letter of word) {
        used[letter] = (used[letter] || 0) + 1;
        if (used[letter] > (have[letter] || 0)) {
          if (spare === 0) { fits = false; break; }
          spare--;
        }
      }
      if (fits) out.push(word);
    }
    if (out.length >= limit) break;
  }

  return out
    .sort((a, b) => b.length - a.length || faceValue(b) - faceValue(a) || a.localeCompare(b))
    .slice(0, limit);
}

/**
 * Which of the given words are real. Used live while a player stages tiles so
 * the board can outline each word green or red before they commit.
 */
export function checkWords(words) {
  if (!Array.isArray(words)) return [];
  return words.slice(0, 16).map((raw) => {
    const word = clean(raw);
    return { word, valid: isWordShape(word) && DICTIONARY.has(word) };
  });
}

export const dictionarySize = () => DICTIONARY.size;
