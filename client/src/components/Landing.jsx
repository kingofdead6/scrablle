import { useState } from 'react';

function WordmarkTile({ ch }) {
  return (
    <span className="relative inline-grid h-11 w-10 place-items-center rounded-lg bg-gradient-to-br from-ivory to-ivorydeep text-tiletext shadow-[0_3px_0_#b99f6e,0_6px_14px_rgb(0_0_0/0.4)]">
      <span className="font-display text-2xl font-bold">{ch}</span>
    </span>
  );
}

export default function Landing({ connected, onHost, onJoin, error }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const join = () => {
    if (busy) return;
    setBusy(true);
    onJoin(code, name, () => setBusy(false));
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-8 px-5 py-10">
      <header className="fade-up flex flex-col items-center gap-4 text-center">
        <div className="flex gap-1.5">
          {'LIVE'.split('').map((ch, i) => <WordmarkTile key={i} ch={ch} />)}
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ivory">
          Scrabble Live
        </h1>
        <p className="max-w-xs text-sm text-mist">
          One screen is the board. Up to four phones are the racks.
          Every move lands on every device instantly.
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={16}
              className="h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-ivory placeholder:text-mist/40 focus:border-brass focus:outline-none"
            />
            <button
              onClick={join}
              disabled={!connected || code.length !== 4 || !name.trim() || busy}
              className="btn btn-ghost h-11 w-full text-base"
            >
              {busy ? 'Joining…' : 'Join game'}
            </button>
          </div>
        </section>

        {error && (
          <p className="rounded-lg border border-cinnabar/40 bg-cinnabar/15 px-4 py-2.5 text-center text-sm text-[#ffb3aa]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
