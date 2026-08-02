import { useRef, useState, useCallback, useEffect } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  // show(text) for a problem, show(text, 'ok') for a confirmation.
  const show = useCallback((text, tone = 'error') => {
    setToast({ text, tone, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return [toast, show];
}

export function Toast({ msg }) {
  if (!msg) return null;
  const { text, tone, key } = typeof msg === 'string' ? { text: msg, tone: 'error' } : msg;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
      <div key={key} className={`toast fade-up px-4 py-2.5 text-sm font-medium shadow-lg ${tone === 'ok' ? 'toast--ok' : ''}`}>
        {text}
      </div>
    </div>
  );
}
