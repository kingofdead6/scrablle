import { useEffect, useState } from 'react';
import { socket } from './socket';
import Landing from './components/Landing';
import HostView from './components/HostView';
import PlayerView from './components/PlayerView';

const SKEY = 'scrabble-live-session';
const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(SKEY)) || null; } catch { return null; }
};

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [session, setSessionState] = useState(loadSession);
  const [state, setState] = useState(null);
  const [rack, setRack] = useState([]);
  const [landingError, setLandingError] = useState('');

  const setSession = (s) => {
    setSessionState(s);
    if (s) localStorage.setItem(SKEY, JSON.stringify(s));
    else localStorage.removeItem(SKEY);
  };

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const s = loadSession();
      if (s?.code) {
        socket.emit('rejoin', s, (res) => {
          if (res?.error) {
            setSession(null);
            setState(null);
            setRack([]);
          }
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (st) => setState(st);
    const onRack = (r) => setRack(r);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    socket.on('rack', onRack);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
      socket.off('rack', onRack);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHost = () => {
    socket.emit('host:create', (res) => {
      if (res?.ok) {
        setSession({ role: 'host', code: res.code, hostToken: res.hostToken });
        setState(res.state);
        setLandingError('');
      }
    });
  };

  const handleJoin = (code, name, done) => {
    socket.emit('player:join', { code, name }, (res) => {
      done?.();
      if (res?.error) return setLandingError(res.error);
      setSession({ role: 'player', code: res.code, playerId: res.playerId });
      setLandingError('');
    });
  };

  const handleLeave = () => {
    setSession(null);
    setState(null);
    setRack([]);
    socket.disconnect(); // frees the seat server-side
    socket.connect();
  };

  if (!session)
    return <Landing connected={connected} onHost={handleHost} onJoin={handleJoin} error={landingError} />;

  if (!state)
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-mist">
        {connected ? 'Rejoining your game…' : 'Reconnecting to server…'}
      </div>
    );

  if (session.role === 'host') return <HostView state={state} onLeave={handleLeave} />;
  return <PlayerView state={state} rack={rack} me={session.playerId} onLeave={handleLeave} />;
}
