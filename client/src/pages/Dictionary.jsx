import { useEffect, useState } from 'react';
import { dictionary } from '../api';
import { Page } from '../components/SiteNav';

const MODES = [
  { id: 'lookup', label: 'Is it a word?', placeholder: 'SCRABBLE', hint: 'Type a word and find out whether the game will accept it.' },
  { id: 'starts', label: 'Starts with', placeholder: 'SCR', hint: 'Every word beginning with those letters, shortest first.' },
  { id: 'rack', label: 'From these letters', placeholder: 'RSTLNE?', hint: 'What you could build from a rack. Use ? for a blank.' },
];

function WordChip({ entry }) {
  return (
    <span className="pop inline-flex items-baseline gap-1.5 rounded-lg border border-line bg-panel2/60 px-2.5 py-1.5">
      <span className="font-display text-sm font-semibold text-ivory">{entry.word}</span>
      <span className="text-[0.65rem] text-mist">{entry.length}L · {entry.value}</span>
    </span>
  );
}

export default function Dictionary() {
  const [mode, setMode] = useState('lookup');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResult(null); setError(''); return; }
    if (mode !== 'lookup' && q.length < 2) { setResult(null); setError(''); return; }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setError('');
      try {
        const call =
          mode === 'lookup' ? dictionary.lookup
          : mode === 'starts' ? dictionary.startsWith
          : dictionary.fromLetters;
        setResult(await call(q, controller.signal));
      } catch (err) {
        if (err.name !== 'AbortError') { setError(err.message); setResult(null); }
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, mode]);

  const active = MODES.find((m) => m.id === mode);

  return (
    <Page
      title="Dictionary"
      subtitle="The same word list the game plays by — so if it passes here, it passes on the board."
    >
      <div className="fade-up card p-5">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => { setMode(m.id); setResult(null); setError(''); }}
              className={`btn h-9 px-3.5 text-sm ${mode === m.id ? 'btn-brass' : 'btn-ghost'}`}>
              {m.label}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={active.placeholder}
          autoFocus
          spellCheck={false}
          autoCapitalize="characters"
          className="mt-4 h-14 w-full rounded-xl border border-line bg-ink/60 px-4 text-center font-display text-2xl font-semibold uppercase tracking-[0.2em] text-ivory placeholder:tracking-[0.1em] placeholder:text-mist/30 focus:border-brass focus:outline-none"
        />
        <p className="mt-2 text-xs text-mist">{active.hint}</p>
      </div>

      {error && (
        <p className="shake mt-4 rounded-lg border border-cinnabar/40 bg-cinnabar/15 px-4 py-2.5 text-sm text-dangerink">
          {error}
        </p>
      )}

      {busy && !result && <p className="mt-4 text-sm text-mist">Looking…</p>}

      {mode === 'lookup' && result && (
        <div className="fade-up mt-4 space-y-4">
          <div className={`card border-2 p-6 text-center ${result.valid ? 'border-sage/60' : 'border-cinnabar/60'}`}>
            <p className="font-display text-4xl font-semibold text-ivory">{result.word}</p>
            <p className={`mt-2 font-display text-xl font-semibold ${result.valid ? 'text-sage' : 'text-cinnabar'}`}>
              {result.valid ? '✓ That is a word' : '✕ Not in the dictionary'}
            </p>
            <p className="mt-1 text-sm text-mist">
              {result.length} letters · {result.value} points before any premium squares
            </p>
          </div>

          {result.valid && result.extensions?.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">Longer words that start with it</h2>
              <div className="flex flex-wrap gap-1.5">
                {result.extensions.map((w) => (
                  <button key={w} onClick={() => setQuery(w)}
                    className="pop rounded-lg border border-line bg-panel2/60 px-2.5 py-1.5 font-display text-sm font-semibold text-ivory hover:border-brass/50">
                    {w}
                  </button>
                ))}
              </div>
            </section>
          )}

          {!result.valid && result.suggestions?.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">Did you mean</h2>
              <div className="flex flex-wrap gap-1.5">
                {result.suggestions.map((w) => (
                  <button key={w} onClick={() => setQuery(w)}
                    className="pop rounded-lg border border-line bg-panel2/60 px-2.5 py-1.5 font-display text-sm font-semibold text-ivory hover:border-brass/50">
                    {w}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {mode !== 'lookup' && result && (
        <section className="fade-up mt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">
            {result.count} {result.count === 1 ? 'word' : 'words'}
            {result.count >= 60 && ' (showing the first 60)'}
          </h2>
          {result.words.length === 0 ? (
            <p className="card p-4 text-sm text-mist">Nothing matches that.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {result.words.map((entry) => <WordChip key={entry.word} entry={entry} />)}
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
