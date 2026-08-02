import { useRef, useState } from 'react';
import { socket } from '../socket';

/**
 * Pulls a fresh copy of the game state from the server. If the socket dropped,
 * it reconnects first — that's usually why someone reaches for refresh.
 */
export function RefreshButton({ onDone, className = 'h-9 px-3 text-sm' }) {
  const [spinning, setSpinning] = useState(false);
  const timer = useRef(null);

  const refresh = () => {
    clearTimeout(timer.current);
    setSpinning(true);
    timer.current = setTimeout(() => setSpinning(false), 700);
    if (!socket.connected) {
      socket.connect(); // the reconnect handler re-joins and pulls state itself
      return;
    }
    socket.emit('client:refresh', (res) => {
      if (res?.error) onDone?.(res.error, 'error');
      else onDone?.('Board refreshed', 'ok');
    });
  };

  return (
    <button onClick={refresh} title="Refresh" aria-label="Refresh the board" className={`btn btn-ghost ${className}`}>
      <span className={spinning ? 'spin inline-block' : 'inline-block'} aria-hidden="true">⟳</span>
    </button>
  );
}
