import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { games as gamesApi } from '../api';
import { Page, Avatar } from '../components/SiteNav';

const when = (iso) =>
  new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function GameCard({ game }) {
  const you = game.you;
  return (
    <Link to={`/history/${game.id}`} className="card block p-4 transition hover:border-brass/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-mist">{when(game.endedAt)} · room {game.code} · {game.turnCount} turns</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {game.seats.map((seat, i) => (
              <span key={i} className="text-sm">
                <span className={seat.won ? 'font-semibold text-brasslight' : 'text-ivory'}>
                  {seat.isBot && '🤖 '}{seat.name}
                </span>
                <span className="ml-1 font-display text-mist">{seat.score}</span>
                {seat.left && <span className="ml-1 text-xs text-mist">left</span>}
              </span>
            ))}
          </div>
        </div>
        {you && (
          <div className="shrink-0 text-right">
            <p className={`font-display text-2xl font-semibold ${you.won ? 'text-sage' : 'text-mist'}`}>
              {you.score}
            </p>
            <p className="text-xs text-mist">{you.won ? 'you won' : 'you lost'}</p>
          </div>
        )}
      </div>
    </Link>
  );
}

/** The same turn log the in-game panel shows, replayed from history. */
function Turn({ turn }) {
  if (turn.type === 'final')
    return (
      <div className="rounded-xl border border-brass/40 bg-brass/10 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brasslight">Leftover tiles</p>
        <p className="mt-1 text-xs text-mist">
          {turn.wentOut
            ? <><span className="text-ivory">{turn.wentOut}</span> went out and collected everyone else's rack.</>
            : 'Everyone drops the value of the tiles left in hand.'}
        </p>
        <div className="mt-1.5 space-y-0.5">
          {turn.adjustments.map((a, i) => (
            <p key={i} className="flex justify-between text-sm">
              <span className="text-ivory">{a.playerName}</span>
              <span>
                <span className={a.delta > 0 ? 'text-sage' : 'text-cinnabar'}>
                  {a.delta > 0 ? '+' : ''}{a.delta}
                </span>
                <span className="ml-2 font-display font-semibold text-brasslight">{a.total}</span>
              </span>
            </p>
          ))}
        </div>
      </div>
    );

  const detail =
    turn.type === 'pass' ? 'passed'
    : turn.type === 'swap' ? `swapped ${turn.count} tile${turn.count === 1 ? '' : 's'}`
    : 'left the game';

  return (
    <div className="flex gap-2.5 rounded-xl border border-line bg-panel2/50 px-3 py-2">
      <span className="w-5 shrink-0 pt-0.5 text-right font-display text-xs text-mist">{turn.n}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ivory">{turn.playerName}</span>
          {turn.type === 'play' ? (
            <span className="shrink-0 text-sm">
              <span className="font-display font-semibold text-sage">+{turn.score}</span>
              <span className="ml-2 font-display font-semibold text-brasslight">{turn.total}</span>
            </span>
          ) : (
            <span className="shrink-0 font-display text-sm font-semibold text-mist">{turn.total}</span>
          )}
        </p>
        {turn.type === 'play' ? (
          <p className="text-xs leading-relaxed text-mist">
            {turn.words.map((w, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className="font-display font-semibold text-brasslight">{w.word}</span> {w.score}
              </span>
            ))}
            {turn.bingo && <span className="text-sage"> · bingo +50</span>}
          </p>
        ) : (
          <p className="text-xs text-mist">{detail}</p>
        )}
      </div>
    </div>
  );
}

function OneGame({ id }) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    gamesApi.one(id)
      .then((res) => { if (!cancelled) setGame(res.game); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <Page title="Game"><p className="text-sm text-dangerink">{error}</p></Page>;
  if (!game) return <Page title="Game"><p className="text-sm text-mist">Loading…</p></Page>;

  return (
    <Page title={game.winners.join(' & ') + ' won'} subtitle={`${when(game.endedAt)} · room ${game.code}`}>
      <Link to="/history" className="btn btn-ghost mb-4 h-9 px-3.5 text-sm">← All games</Link>

      <div className="card mb-4 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Final scores</h2>
        <div className="mt-2 space-y-1.5">
          {[...game.seats].sort((a, b) => b.score - a.score).map((seat, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-panel2/50 px-3 py-2">
              <span className="text-sm">
                {seat.isBot && '🤖 '}
                {seat.userId
                  ? <Link to={`/players/${seat.userId}`} className="font-semibold text-ivory hover:underline">{seat.name}</Link>
                  : <span className="font-semibold text-ivory">{seat.name}</span>}
                {seat.isBot && <span className="ml-1.5 text-xs uppercase tracking-wide text-mist">{seat.difficulty}</span>}
                {seat.left && <span className="ml-1.5 text-xs text-mist">left</span>}
              </span>
              <span className={`font-display text-xl font-semibold ${seat.won ? 'text-sage' : 'text-ivory'}`}>
                {seat.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">
        Every move · {game.turns.length} turns
      </h2>
      <div className="space-y-2">
        {game.turns.map((turn, i) => <Turn key={i} turn={turn} />)}
      </div>
    </Page>
  );
}

export default function History() {
  const { id } = useParams();
  const { features, signedIn } = useAuth();
  const [games, setGames] = useState(null);
  const [opponents, setOpponents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id || !features.accounts || !signedIn) return;
    let cancelled = false;
    Promise.all([gamesApi.list('?limit=50'), gamesApi.opponents()])
      .then(([list, opps]) => {
        if (cancelled) return;
        setGames(list.games);
        setOpponents(opps.opponents);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id, features.accounts, signedIn]);

  if (!features.accounts)
    return <Page title="History needs an account server"><p className="text-sm text-mist">This server runs guest games only.</p></Page>;
  if (!signedIn)
    return <Page title="Sign in to see your games"><Link to="/sign-in" className="btn btn-brass h-11 px-5">Sign in</Link></Page>;
  if (id) return <OneGame id={id} />;
  if (error) return <Page title="Your games"><p className="text-sm text-dangerink">{error}</p></Page>;
  if (!games) return <Page title="Your games"><p className="text-sm text-mist">Loading…</p></Page>;

  return (
    <Page title="Your games" subtitle="Every finished game, who you played, and what happened turn by turn." wide>
      {opponents.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">Who you play</h2>
          <div className="flex flex-wrap gap-2">
            {opponents.map((o) => (
              <Link key={o.user.id} to={`/players/${o.user.id}`}
                className="flex items-center gap-2 rounded-xl border border-line bg-panel2/50 px-3 py-2 transition hover:border-brass/50">
                <Avatar user={o.user} />
                <span>
                  <span className="block text-sm font-semibold text-ivory">{o.user.name}</span>
                  <span className="text-xs text-mist">{o.games} {o.games === 1 ? 'game' : 'games'}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {games.length === 0 ? (
        <p className="card p-5 text-sm text-mist">
          Nothing yet. Finish a game and it turns up here with the whole move log.
        </p>
      ) : (
        <div className="space-y-2">
          {games.map((game) => <GameCard key={game.id} game={game} />)}
        </div>
      )}
    </Page>
  );
}
