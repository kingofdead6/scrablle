import { Router } from 'express';
import { lookup, startingWith, fromLetters, dictionarySize, faceValue } from '../lib/dictionary.js';
import { route, rateLimit } from './middleware.js';

const router = Router();

// Open to everyone: the word checker is useful whether or not you're signed in,
// and it reads a static word list.
router.get('/', (_req, res) => {
  res.json({
    words: dictionarySize(),
    source: 'an-array-of-english-words',
    note: 'The same list the game validates plays against.',
  });
});

/**
 * `GET /api/dictionary/lookup?q=SCRABBLE`
 * Answers the one question the page exists for — is this a word? — and throws
 * in a few near-misses so a rejected word isn't a dead end.
 */
router.get(
  '/lookup',
  rateLimit({ key: 'dict', max: 180 }),
  route(async (req, res) => {
    const result = lookup(req.query.q);
    if (result.error) return res.status(400).json({ error: result.error });

    const related = startingWith(result.word, 12).filter((w) => w !== result.word);
    // A word that isn't real still tells you something: what does start that way.
    const suggestions = result.valid
      ? []
      : startingWith(result.word.slice(0, Math.max(2, result.word.length - 2)), 12)
          .filter((w) => w !== result.word)
          .slice(0, 8);

    res.json({ ...result, extensions: related, suggestions });
  })
);

/** `GET /api/dictionary/starts-with?q=SCR` */
router.get(
  '/starts-with',
  rateLimit({ key: 'dict', max: 180 }),
  route(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.status(400).json({ error: 'Type a few letters first.' });
    const words = startingWith(q, Math.min(Number(req.query.limit) || 60, 120));
    res.json({ query: q.toUpperCase(), count: words.length, words: withValues(words) });
  })
);

/** `GET /api/dictionary/from-letters?q=RSTLNE?` — `?` is a blank. */
router.get(
  '/from-letters',
  rateLimit({ key: 'dict', max: 120 }),
  route(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.replace(/[^A-Za-z?]/g, '').length < 2)
      return res.status(400).json({ error: 'Give it at least two letters.' });
    const words = fromLetters(q, Math.min(Number(req.query.limit) || 60, 120));
    res.json({ query: q.toUpperCase(), count: words.length, words: withValues(words) });
  })
);

const withValues = (words) =>
  words.map((word) => ({ word, length: word.length, value: faceValue(word) }));

export default router;
