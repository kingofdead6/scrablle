import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { socket } from './socket';
import { useTheme } from './components/ThemePicker';
import Game from './pages/Game';
import SignIn from './pages/SignIn';
import Profile from './pages/Profile';
import Friends from './pages/Friends';
import Dictionary from './pages/Dictionary';
import History from './pages/History';

/**
 * A friend pulled you into a room. Shows wherever you are in the app, because
 * an invite is worthless if you have to be on the right page to see it.
 */
function InviteBanner({ invite, onJoin, onDismiss }) {
  if (!invite) return null;
  return (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div className="slide-down card flex flex-wrap items-center gap-3 border-brass/50 px-4 py-3 shadow-lg">
        <span className="text-sm">
          <span className="font-semibold text-ivory">{invite.from.name}</span> invited you to room{' '}
          <span className="font-display tracking-[0.2em] text-brasslight">{invite.code}</span>
          {invite.players?.length > 0 && (
            <span className="text-mist"> · {invite.players.map((p) => p.name).join(', ')}</span>
          )}
        </span>
        <span className="ml-auto flex gap-2">
          <button onClick={onDismiss} className="btn btn-ghost h-9 px-3 text-sm">Not now</button>
          <button onClick={() => onJoin(invite)} className="btn btn-brass h-9 px-4 text-sm">Join</button>
        </span>
      </div>
    </div>
  );
}

function Shell() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [joinCode, setJoinCode] = useState('');

  // Themes are chosen per device and apply to every page, not just the board,
  // so the choice lives here rather than inside the game screen.
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    const onInvite = (payload) => setInvite(payload);
    const onDeclined = () => setInvite(null);
    socket.on('invite:incoming', onInvite);
    socket.on('invite:declined', onDeclined);
    return () => {
      socket.off('invite:incoming', onInvite);
      socket.off('invite:declined', onDeclined);
    };
  }, []);

  const acceptInvite = useCallback((payload) => {
    setJoinCode(payload.code);
    setInvite(null);
    navigate('/');
  }, [navigate]);

  const declineInvite = useCallback(() => {
    if (invite) socket.emit('invite:decline', { toUserId: invite.from.id, code: invite.code });
    setInvite(null);
  }, [invite]);

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-mist">
        <span className="fade-up">Starting up…</span>
      </div>
    );

  return (
    <>
      <InviteBanner invite={invite} onJoin={acceptInvite} onDismiss={declineInvite} />
      <Routes>
        <Route
          path="/"
          element={
            <Game
              joinCode={joinCode}
              onJoined={() => setJoinCode('')}
              theme={theme}
              onTheme={setTheme}
            />
          }
        />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/me" element={<Profile />} />
        <Route path="/players/:id" element={<Profile />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/dictionary" element={<Dictionary />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
