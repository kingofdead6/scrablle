import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { users as usersApi, games as gamesApi, friends as friendsApi } from '../api';
import { Page, Avatar } from '../components/SiteNav';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/50 px-3 py-3 text-center">
      <p className="font-display text-2xl font-semibold text-brasslight">{value}</p>
      <p className="text-[0.65rem] uppercase tracking-[0.12em] text-mist">{label}</p>
      {hint && <p className="mt-0.5 text-[0.65rem] text-mist/70">{hint}</p>}
    </div>
  );
}

function StatGrid({ stats }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Games" value={stats.games} />
        <Stat label="Wins" value={stats.wins} hint={`${stats.winRate}% win rate`} />
        <Stat label="Best game" value={stats.bestScore} />
        <Stat label="Bingos" value={stats.bingos} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Average" value={stats.averageScore} />
        <Stat label="Total points" value={stats.totalScore} />
        <Stat label="Words" value={stats.wordsPlayed} />
        <Stat label="Tiles" value={stats.tilesPlayed} />
      </div>
      <div className="mt-2 rounded-xl border border-brass/40 bg-brass/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-mist">Top word</p>
        {stats.bestWord ? (
          <p className="mt-1 font-display text-xl font-semibold text-ivory">
            {stats.bestWord.word}{' '}
            <span className="text-brasslight">{stats.bestWord.score} points</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-mist">No games played yet.</p>
        )}
      </div>
    </>
  );
}

/** Turning a guest into a real account without losing anything. */
function ClaimAccount() {
  const { claim, user } = useAuth();
  const [form, setForm] = useState({ name: user.name, email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await claim(form); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="font-display text-lg font-semibold text-ivory">Keep this account</h2>
      <p className="text-sm text-mist">
        You're playing as a guest. Add an email and password and everything you've done so far —
        stats, games, this name — comes with you.
      </p>
      {['name', 'email', 'password'].map((field) => (
        <input
          key={field}
          value={form[field]}
          onChange={set(field)}
          type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
          placeholder={field === 'name' ? 'Name' : field === 'email' ? 'Email' : 'Password'}
          maxLength={field === 'name' ? 16 : undefined}
          className="h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-ivory placeholder:text-mist/40 focus:border-brass focus:outline-none"
        />
      ))}
      {error && <p className="text-sm text-dangerink">{error}</p>}
      <button disabled={busy} className="btn btn-brass h-11 w-full">
        {busy ? 'Saving…' : 'Claim account'}
      </button>
    </form>
  );
}

function EditProfile({ user, onSaved }) {
  const { features } = useAuth();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [state, setState] = useState({ busy: false, error: '', saved: false });
  const fileRef = useRef(null);

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', saved: false });
    try {
      const { user: next } = await usersApi.edit({ name, bio });
      onSaved(next);
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    }
  };

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState({ busy: true, error: '', saved: false });
    try {
      const { user: next } = await usersApi.uploadAvatar(file);
      onSaved(next);
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setState({ busy: true, error: '', saved: false });
    try {
      const { user: next } = await usersApi.removeAvatar();
      onSaved(next);
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      setState({ busy: false, error: err.message, saved: false });
    }
  };

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <h2 className="font-display text-lg font-semibold text-ivory">Edit profile</h2>

      <div className="flex items-center gap-4">
        <Avatar user={user} size="h-20 w-20" />
        <div className="space-y-2">
          {features.uploads ? (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={pickAvatar} className="hidden" id="avatar-input" />
              <label htmlFor="avatar-input" className="btn btn-ghost h-9 cursor-pointer px-3.5 text-sm">
                Upload picture
              </label>
              {user.avatarUrl && (
                <button type="button" onClick={removeAvatar} className="btn btn-ghost ml-2 h-9 px-3.5 text-sm">
                  Remove
                </button>
              )}
              <p className="text-xs text-mist">PNG, JPEG, WebP or GIF. Up to 4MB.</p>
            </>
          ) : (
            <p className="text-xs text-mist">
              Picture uploads are off on this server — Cloudinary isn't configured.
            </p>
          )}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-mist">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16}
          className="mt-1.5 h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-ivory focus:border-brass focus:outline-none" />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-mist">Bio</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3}
          className="mt-1.5 w-full rounded-lg border border-line bg-ink/60 px-3 py-2 text-ivory focus:border-brass focus:outline-none" />
        <span className="text-xs text-mist">{bio.length}/160</span>
      </label>

      {state.error && <p className="text-sm text-dangerink">{state.error}</p>}
      {state.saved && <p className="text-sm text-sage">Saved.</p>}
      <button disabled={state.busy} className="btn btn-brass h-11 px-6">
        {state.busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user: me, features, refresh, signedIn } = useAuth();
  const [profile, setProfile] = useState(null);
  const [relation, setRelation] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  const viewingSelf = !id || (me && (id === me.id || id === me.tag));

  useEffect(() => {
    if (!features.accounts || !signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        if (viewingSelf) {
          setProfile(me);
          setRelation(null);
        } else {
          const res = await usersApi.profile(id);
          if (!cancelled) { setProfile(res.user); setRelation(res.relation); }
        }
        const list = await gamesApi.list(viewingSelf ? '?limit=5' : `?limit=5&with=${id}`);
        if (!cancelled) setRecent(list.games);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [id, viewingSelf, me, features.accounts, signedIn]);

  if (!features.accounts)
    return <Page title="Profiles need an account server"><p className="text-sm text-mist">This server runs guest games only.</p></Page>;
  if (!signedIn)
    return (
      <Page title="Sign in to see profiles">
        <Link to="/sign-in" className="btn btn-brass h-11 px-5">Sign in</Link>
      </Page>
    );
  if (error) return <Page title="Profile"><p className="text-sm text-dangerink">{error}</p></Page>;
  if (!profile) return <Page title="Profile"><p className="text-sm text-mist">Loading…</p></Page>;

  const addFriend = async () => {
    try {
      await friendsApi.add(profile.id);
      setRelation({ status: 'pending', direction: 'outgoing' });
    } catch (err) { setError(err.message); }
  };

  return (
    <Page>
      <div className="fade-up card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar user={profile} size="h-20 w-20" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold text-ivory">{profile.name}</h1>
            <p className="text-sm text-mist">
              <span className="font-display tracking-[0.15em] text-brasslight">{profile.tag}</span>
              {profile.isGuest && ' · guest'}
              {profile.email && ` · ${profile.email}`}
            </p>
            {profile.bio && <p className="mt-1.5 text-sm">{profile.bio}</p>}
          </div>
          {!viewingSelf && (
            <div className="flex gap-2">
              {relation?.status === 'accepted' ? (
                <Link to={`/friends?with=${profile.id}`} className="btn btn-ghost h-10 px-4 text-sm">Message</Link>
              ) : relation?.status === 'pending' ? (
                <span className="btn btn-ghost h-10 px-4 text-sm opacity-60">
                  {relation.direction === 'outgoing' ? 'Request sent' : 'Wants to be friends'}
                </span>
              ) : (
                <button onClick={addFriend} className="btn btn-brass h-10 px-4 text-sm">Add friend</button>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">Record</h2>
        <StatGrid stats={profile.stats} />
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-mist">
          {viewingSelf ? 'Recent games' : 'Games together'}
        </h2>
        {recent.length === 0 ? (
          <p className="card p-4 text-sm text-mist">Nothing here yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((game) => (
              <Link key={game.id} to={`/history/${game.id}`}
                className="card flex items-center justify-between p-3.5 transition hover:border-brass/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ivory">
                    {game.seats.map((s) => s.name).join(' · ')}
                  </span>
                  <span className="text-xs text-mist">
                    {new Date(game.endedAt).toLocaleDateString()} · {game.turnCount} turns
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-lg font-semibold text-brasslight">
                    {game.you ? game.you.score : '—'}
                  </span>
                  <span className="text-xs text-mist">{game.winners.join(' & ')} won</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {viewingSelf && (
        <section className="mt-5">
          {me.isGuest ? <ClaimAccount /> : <EditProfile user={me} onSaved={refresh} />}
        </section>
      )}
    </Page>
  );
}
