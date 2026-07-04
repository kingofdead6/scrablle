import { useEffect, useState } from 'react';

// Ticks down the seconds remaining until `endsAt` (epoch ms). Returns null when there's no limit.
export function useCountdown(endsAt) {
  const [remaining, setRemaining] = useState(() =>
    endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}
