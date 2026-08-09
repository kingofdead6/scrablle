import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { socket } from '../socket';
import { friends as friendsApi, users as usersApi, messages as messagesApi } from '../api';
import { Page, Avatar } from '../components/SiteNav';

function Dot({ online }) {
  return (
    <span
      title={online ? 'Online' : 'Offline'}
      className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-sage' : 'bg-mist/40'}`}
    />
  );
}

function PersonRow({ person, presence, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel2/50 p-3">
      <Avatar user={person} size="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ivory">
          <Link to={`/players/${person.id}`} className="truncate hover:underline">{person.name}</Link>
          {presence && <Dot online={presence.online} />}
        </p>
        <p className="truncate text-xs text-mist">
          <span className="tracking-[0.12em]">{person.tag}</span>
          {presence?.room && ` · in room ${presence.room}`}
          {person.stats?.games > 0 && ` · ${person.stats.games} games`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{children}</div>
    </div>
  );
}

/** Find people by name, tag, email or id. */
function FindPeople({ onChanged, onError }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [matchedOn, setMatchedOn] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setMatchedOn(''); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.search(q, controller.signal);
        setResults(res.results);
        setMatchedOn(res.matchedOn);
      } catch (err) {
        if (err.name !== 'AbortError') onError(err.message);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, onError]);

  const add = async (person) => {
    try {
      await friendsApi.add(person.id);
      setResults((prev) => prev.map((p) =>
        p.id === person.id ? { ...p, relation: { status: 'pending', direction: 'outgoing' } } : p));
      onChanged();
    } catch (err) { onError(err.message); }
  };

  return (
    <section className="card p-4">
      <h2 className="font-display text-lg font-semibold text-ivory">Find players</h2>
      <p className="mt-1 text-xs text-mist">Search by name, player tag (SCR-XXXX), exact email, or id.</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, SCR-XXXX, or email"
        className="mt-3 h-11 w-full rounded-lg border border-line bg-ink/60 px-3 text-ivory placeholder:text-mist/40 focus:border-brass focus:outline-none"
      />
      {matchedOn && results.length > 0 && (
        <p className="mt-2 text-xs text-mist">Matched on {matchedOn}.</p>
      )}
      <div className="mt-3 space-y-2">
        {searching && results.length === 0 && <p className="text-sm text-mist">Searching…</p>}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-mist">Nobody matched that.</p>
        )}
        {results.map((person) => (
          <PersonRow key={person.id} person={person} presence={person.presence}>
            {person.relation?.status === 'accepted' ? (
              <span className="text-xs text-sage">Friends</span>
            ) : person.relation?.status === 'pending' ? (
              <span className="text-xs text-mist">
                {person.relation.direction === 'outgoing' ? 'Requested' : 'Wants to add you'}
              </span>
            ) : (
              <button onClick={() => add(person)} className="btn btn-ghost h-9 px-3 text-xs">Add</button>
            )}
          </PersonRow>
        ))}
      </div>
    </section>
  );
}

/** A conversation with one friend. */
function Conversation({ friend, onError }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const bodyRef = useRef(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      const res = await messagesApi.with(friend.id);
      setMessages(res.messages);
    } catch (err) { onError(err.message); }
  }, [friend.id, onError]);

  useEffect(() => { load(); }, [load]);

  // New DMs arrive over the socket while the page is open.
  useEffect(() => {
    const onNew = ({ message }) => {
      if (message.from === friend.id || message.to === friend.id)
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    };
    socket.on('dm:new', onNew);
    return () => socket.off('dm:new', onNew);
  }, [friend.id]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const res = await messagesApi.send(friend.id, text);
      setMessages((prev) => [...prev, res.message]);
    } catch (err) { onError(err.message); setDraft(text); }
  };

  return (
    <div className="card flex h-[26rem] flex-col">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Avatar user={friend} />
        <span className="font-display font-semibold text-ivory">{friend.name}</span>
      </div>
      <div ref={bodyRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 && <p className="pt-6 text-center text-sm text-mist">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.from === user.id;
          return (
            <div key={m.id} className={`fade-up flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="px-1 text-[0.65rem] text-mist">
                {mine ? 'You' : friend.name} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm ${
                mine ? 'rounded-br-sm bg-brass/25 text-ivory' : 'rounded-bl-sm border border-line bg-panel2/70'
              }`}>
                {m.text}
              </span>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000}
          placeholder={`Message ${friend.name}…`}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-ink/60 px-3 text-sm text-ivory placeholder:text-mist/50 focus:border-brass focus:outline-none" />
        <button disabled={!draft.trim()} className="btn btn-brass h-11 px-4 text-sm">Send</button>
      </form>
    </div>
  );
}

export default function Friends() {
  const { features, signedIn, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [roomCode, setRoomCode] = useState('');

  const openWith = params.get('with');
  const chatting = list.find((f) => f.id === openWith) || null;

  const reload = useCallback(async () => {
    try {
      const [{ friends }, reqs] = await Promise.all([friendsApi.list(), friendsApi.requests()]);
      setList(friends);
      setRequests(reqs);
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => { if (features.accounts && signedIn) reload(); }, [features.accounts, signedIn, reload]);

  // Presence changes arrive live.
  useEffect(() => {
    const onPresence = ({ userId, online }) =>
      setList((prev) => prev.map((f) => (f.id === userId ? { ...f, presence: { ...f.presence, online } } : f)));
    socket.on('friend:presence', onPresence);
    return () => socket.off('friend:presence', onPresence);
  }, []);

  // The play screen stashes the code of the room you're hosting.
  useEffect(() => {
    try {
      const session = JSON.parse(localStorage.getItem('scrabble-live-session') || 'null');
      setRoomCode(session?.code || '');
    } catch { setRoomCode(''); }
  }, []);

  if (!features.accounts)
    return <Page title="Friends need an account server"><p className="text-sm text-mist">This server runs guest games only.</p></Page>;
  if (!signedIn || user?.isGuest)
    return (
      <Page title="Friends" subtitle={user?.isGuest ? 'Guests cannot add friends — claim your account first.' : 'Sign in to add friends.'}>
        <Link to={user?.isGuest ? '/me' : '/sign-in'} className="btn btn-brass h-11 px-5">
          {user?.isGuest ? 'Claim your account' : 'Sign in'}
        </Link>
      </Page>
    );

  const respond = async (id, accept) => {
    try {
      await (accept ? friendsApi.accept(id) : friendsApi.decline(id));
      reload();
    } catch (err) { setError(err.message); }
  };

  const unfriend = async (id) => {
    try { await friendsApi.remove(id); reload(); } catch (err) { setError(err.message); }
  };

  const togglePick = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const invite = () => {
    if (!roomCode) return setError('Start a room on the play screen first, then invite from here.');
    socket.emit('invite:send', { code: roomCode, to: [...picked] }, (res) => {
      if (res?.error) return setError(res.error);
      const offline = (res.skipped || []).filter((s) => s.reason === 'offline').length;
      setNotice(
        `Invited ${res.sent.length} ${res.sent.length === 1 ? 'friend' : 'friends'} to room ${roomCode}` +
        (offline ? ` — ${offline} offline and could not be reached.` : '.')
      );
      setPicked(new Set());
    });
  };

  return (
    <Page title="Friends" subtitle="Search for players, keep a list, chat, and pull them into a game." wide>
      {error && <p className="shake mb-4 rounded-lg border border-cinnabar/40 bg-cinnabar/15 px-4 py-2.5 text-sm text-dangerink">{error}</p>}
      {notice && <p className="mb-4 rounded-lg border border-sage/40 bg-sage/15 px-4 py-2.5 text-sm text-sage">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {requests.incoming.length > 0 && (
            <section className="card p-4">
              <h2 className="font-display text-lg font-semibold text-ivory">
                Friend requests <span className="text-brasslight">{requests.incoming.length}</span>
              </h2>
              <div className="mt-3 space-y-2">
                {requests.incoming.map((r) => (
                  <PersonRow key={r.id} person={r.from}>
                    <button onClick={() => respond(r.id, true)} className="btn btn-brass h-9 px-3 text-xs">Accept</button>
                    <button onClick={() => respond(r.id, false)} className="btn btn-ghost h-9 px-3 text-xs">Decline</button>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-ivory">
                Your friends <span className="text-mist">{list.length}</span>
              </h2>
              {picked.size > 0 && (
                <button onClick={invite} className="btn btn-brass h-9 px-3.5 text-sm">
                  Invite {picked.size} to {roomCode || 'a game'}
                </button>
              )}
            </div>
            {roomCode ? (
              <p className="mt-1 text-xs text-mist">
                You're in room <span className="font-display tracking-[0.15em] text-brasslight">{roomCode}</span> —
                tick friends to invite them. They need to be online.
              </p>
            ) : (
              <p className="mt-1 text-xs text-mist">
                <Link to="/" className="text-brasslight underline">Create a room</Link> to invite friends into a game.
              </p>
            )}

            <div className="mt-3 space-y-2">
              {list.length === 0 && <p className="text-sm text-mist">No friends yet — find some below.</p>}
              {list.map((friend) => (
                <PersonRow key={friend.id} person={friend} presence={friend.presence}>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-mist">
                    <input type="checkbox" checked={picked.has(friend.id)} onChange={() => togglePick(friend.id)}
                      className="accent-[var(--color-brass)]" />
                    invite
                  </label>
                  <button
                    onClick={() => setParams(openWith === friend.id ? {} : { with: friend.id })}
                    className="btn btn-ghost h-9 px-3 text-xs"
                  >
                    {openWith === friend.id ? 'Close' : 'Chat'}
                  </button>
                  <button onClick={() => unfriend(friend.id)} className="btn btn-ghost h-9 px-3 text-xs">Remove</button>
                </PersonRow>
              ))}
            </div>
          </section>

          <FindPeople onChanged={reload} onError={setError} />
        </div>

        <div className="space-y-4">
          {chatting ? (
            <Conversation friend={chatting} onError={setError} />
          ) : (
            <section className="card p-4 text-sm text-mist">
              Pick a friend and hit <span className="text-ivory">Chat</span> to talk to them here.
            </section>
          )}

          {requests.outgoing.length > 0 && (
            <section className="card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Requests you sent</h2>
              <div className="mt-2 space-y-2">
                {requests.outgoing.map((r) => (
                  <PersonRow key={r.id} person={r.to}>
                    <span className="text-xs text-mist">Waiting</span>
                  </PersonRow>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}
