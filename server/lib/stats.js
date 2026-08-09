// Turning a finished game into the numbers a profile shows. Pure: takes the
// engine's own game object, returns plain data. No database in sight.

/**
 * Per-seat totals for one finished game.
 * @param game a finished engine game (players + history)
 * @returns Map keyed by player name → { score, won, tied, bingos, tilesPlayed,
 *          wordsPlayed, bestWord }
 */
export function tallyGame(game) {
  const winners = new Set(game.winners || []);
  const byName = new Map();

  for (const player of game.players) {
    byName.set(player.name, {
      name: player.name,
      score: player.score,
      won: winners.has(player.name) && winners.size === 1,
      tied: winners.has(player.name) && winners.size > 1,
      bingos: 0,
      tilesPlayed: 0,
      wordsPlayed: 0,
      bestWord: null,
    });
  }

  for (const turn of game.history || []) {
    if (turn.type !== 'play') continue;
    const entry = byName.get(turn.playerName);
    if (!entry) continue;

    entry.wordsPlayed += turn.words?.length || 0;
    if (turn.bingo) {
      entry.bingos += 1;
      entry.tilesPlayed += 7;
    } else {
      // The turn's tile count isn't logged, so take the longest word formed as
      // the floor — good enough for a lifetime counter, never an overcount.
      entry.tilesPlayed += Math.max(1, ...(turn.words || []).map((w) => w.word.length));
    }

    for (const word of turn.words || []) {
      if (!entry.bestWord || word.score > entry.bestWord.score)
        entry.bestWord = { word: word.word, score: word.score };
    }
  }

  return byName;
}

/**
 * Folds one game's tally into a user's running totals.
 * @returns a new stats object; the input is never mutated.
 */
export function applyTally(stats, tally, at = new Date()) {
  const next = {
    games: (stats?.games || 0) + 1,
    wins: (stats?.wins || 0) + (tally.won ? 1 : 0),
    losses: (stats?.losses || 0) + (!tally.won && !tally.tied ? 1 : 0),
    ties: (stats?.ties || 0) + (tally.tied ? 1 : 0),
    totalScore: (stats?.totalScore || 0) + tally.score,
    bestScore: Math.max(stats?.bestScore || 0, tally.score),
    bingos: (stats?.bingos || 0) + tally.bingos,
    tilesPlayed: (stats?.tilesPlayed || 0) + tally.tilesPlayed,
    wordsPlayed: (stats?.wordsPlayed || 0) + tally.wordsPlayed,
    bestWord: stats?.bestWord?.word
      ? { word: stats.bestWord.word, score: stats.bestWord.score, at: stats.bestWord.at }
      : null,
  };

  if (tally.bestWord && tally.bestWord.score > (next.bestWord?.score || 0))
    next.bestWord = { ...tally.bestWord, at };

  return next;
}

/** The seat rows stored on a GameRecord. */
export function buildSeats(game, accountByName = new Map()) {
  const winners = new Set(game.winners || []);
  return game.players.map((player) => ({
    user: accountByName.get(player.name) || null,
    name: player.name,
    score: player.score,
    isBot: !!player.isBot,
    difficulty: player.isBot ? player.difficulty : undefined,
    left: !!player.left,
    won: winners.has(player.name),
  }));
}
