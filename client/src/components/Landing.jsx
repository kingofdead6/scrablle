import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function WordmarkTile({ ch, i }) {
  return (
    <span className="wordtile deal h-11 w-10" style={{ '--i': i }}>
      <span className="font-display text-2xl font-bold">{ch}</span>
    </span>
  );
}

export default function Landing({
  connected, onHost, onJoin, error,
  defaultName = '', lockName = false, prefillCode = '', accountsOn = false,
}) {
  const [code, setCode] = useState(prefillCode);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  // An invite arrives with a code; drop it straight into the box.
  useEffect(() => { if (prefillCode) setCode(prefillCode); }, [prefillCode]);
  useEffect(() => { if (defaultName) setName(defaultName); }, [defaultName]);

  const join = () => {
    if (busy) return;
    setBusy(true);
    onJoin(code, name, () => setBusy(false));
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-8 px-5 py-10">
      <header className="fade-up flex flex-col items-center gap-4 text-center">
        <div className="flex gap-1.5">
          {'LIVE'.split('').map((ch, i) => <WordmarkTile key={i} ch={ch} i={i} />)}
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ivory">
          Scrabble Live
        </h1>
        <p className="max-w-xs text-sm text-mist">
          One screen is the board. Up to four phones are the racks — or fill
          the empty seats with bots. Every move lands on every device instantly.
        </p>
        <span className="flex items-center gap-2 text-xs text-mist">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-sage' : 'bg-cinnabar'}`} />
          {connected ? 'Connected to server' : 'Connecting…'}
        </span>
      </header>

      <div className="fade-up w-full space-y-4" style={{ animationDelay: '0.08s' }}>
        <section className="card p-5">
          <h2 className="font-display text-lg font-semibold text-brasslight">Host on this screen</h2>
          <p className="mt-1 text-sm text-mist">
            Use the biggest screen in the room — it becomes the shared board and shows the join code.
          </p>
          <button
            onClick={onHost}
            disabled={!connected}
            className="btn btn-brass mt-4 h-11 w-full text-base"
          >
            Create a room
          </button>
        </section>

        <section className="card p-5">
          <h2 className="font-display text-lg font-semibold text-brasslight">Join with a code</h2>
          <div className="mt-3 space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              placeholder="CODE"
              inputMode="text"
              autoCapitalize="characters"
              className="h-12 w-full rounded-lg border border-line bg-ink/60 text-center font-display text-2xl font-semibold tracking-[0.5em] text-ivory placeholder:tracking-normal placeholder:text-mist/40 focus:border-brass focus:outline-none"
            />
            {lockName ? (
              <p className="flex h-11 w-full items-center rounded-lg border border-line bg-ink/40 px-3 text-sm text-mist">
                Joining as <span className="ml-1.5 font-semibold text-ivory">{name}</span>
              </p>
            ) : (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={16}
                className="h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-ivory placeholder:text-mist/40 focus:border-brass focus:outline-none"
              />
            )}
            <button
              onClick={join}
              disabled={!connected || code.length !== 4 || !name.trim() || busy}
              className="btn btn-ghost h-11 w-full text-base"
            >
              {busy ? 'Joining…' : 'Join game'}
            </button>
          </div>
        </section>

        <nav className="flex flex-wrap justify-center gap-2">
          <Link to="/dictionary" className="btn btn-ghost h-10 px-4 text-sm">Dictionary</Link>
          {accountsOn && (
            <>
              <Link to="/friends" className="btn btn-ghost h-10 px-4 text-sm">Friends</Link>
              <Link to="/history" className="btn btn-ghost h-10 px-4 text-sm">Your games</Link>
              <Link to="/me" className="btn btn-ghost h-10 px-4 text-sm">Profile</Link>
            </>
          )}
          <Link to="/sign-in" className="btn btn-ghost h-10 px-4 text-sm">
            {lockName ? 'Account' : 'Sign in'}
          </Link>
        </nav>

        {error && (
          <p className="shake rounded-lg border border-cinnabar/40 bg-cinnabar/15 px-4 py-2.5 text-center text-sm text-dangerink">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
