import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Page } from '../components/SiteNav';

const MODES = [
  { id: 'login', label: 'Sign in' },
  { id: 'register', label: 'Create account' },
  { id: 'guest', label: 'Play as guest' },
];

function Field({ label, hint, ...props }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-mist">{label}</span>
      <input
        {...props}
        className="mt-1.5 h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-ivory placeholder:text-mist/40 focus:border-brass focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-mist">{hint}</span>}
    </label>
  );
}

export default function SignIn() {
  const { features, register, login, playAsGuest, signedIn, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', identifier: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!features.accounts)
    return (
      <Page title="Accounts are off on this server">
        <div className="card space-y-3 p-5">
          <p className="text-sm text-mist">
            This server is running without a database, so there's nothing to sign in to.
            Everything else still works — start a room from the{' '}
            <Link to="/" className="text-brasslight underline">play screen</Link> and share the code.
          </p>
          {features.missingEnv?.length > 0 && (
            <p className="text-xs text-mist">
              Whoever runs it needs to set{' '}
              <code className="rounded bg-panel2 px-1.5 py-0.5 text-brasslight">
                {features.missingEnv.join(', ')}
              </code>.
            </p>
          )}
        </div>
      </Page>
    );

  if (signedIn)
    return (
      <Page title={`Signed in as ${user.name}`}>
        <div className="card space-y-4 p-5">
          <p className="text-sm text-mist">
            {user.isGuest
              ? 'You are playing as a guest. Claim the account to keep your stats, add friends and see your game history.'
              : 'You are all set.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/" className="btn btn-brass h-11 px-5">Play</Link>
            <Link to="/me" className="btn btn-ghost h-11 px-5">
              {user.isGuest ? 'Claim your account' : 'Your profile'}
            </Link>
          </div>
        </div>
      </Page>
    );

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'register') await register({ name: form.name, email: form.email, password: form.password });
      else if (mode === 'login') await login({ identifier: form.identifier, password: form.password });
      else await playAsGuest(form.name || undefined);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Sign in" subtitle="An account keeps your stats, friends and game history. A guest can just play.">
      <div className="fade-up card p-5">
        <div className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setError(''); }}
              className={`btn h-9 px-3.5 text-sm ${mode === m.id ? 'btn-brass' : 'btn-ghost'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'login' && (
            <>
              <Field label="Email or name" value={form.identifier} onChange={set('identifier')}
                autoComplete="username" placeholder="you@example.com" />
              <Field label="Password" type="password" value={form.password} onChange={set('password')}
                autoComplete="current-password" />
            </>
          )}

          {mode === 'register' && (
            <>
              <Field label="Name" value={form.name} onChange={set('name')} maxLength={16}
                autoComplete="nickname" hint="2–16 characters. This is what other players see." />
              <Field label="Email" type="email" value={form.email} onChange={set('email')}
                autoComplete="email" />
              <Field label="Password" type="password" value={form.password} onChange={set('password')}
                autoComplete="new-password" hint="At least 8 characters, with a letter and a number." />
            </>
          )}

          {mode === 'guest' && (
            <Field label="Name (optional)" value={form.name} onChange={set('name')} maxLength={16}
              placeholder="Guest" hint="No password, no history. You can claim the account later." />
          )}

          {error && (
            <p className="shake rounded-lg border border-cinnabar/40 bg-cinnabar/15 px-4 py-2.5 text-sm text-dangerink">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn btn-brass h-12 w-full text-base">
            {busy ? 'One moment…' : MODES.find((m) => m.id === mode).label}
          </button>
        </form>
      </div>
    </Page>
  );
}
