import { useRef, useState, useCallback } from 'react';

export function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text) => {
    setMsg(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return [msg, show];
}

export function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
      <div className="fade-up rounded-xl border border-cinnabar/40 bg-[#2a1b1e] px-4 py-2.5 text-sm font-medium text-[#ffc0b8] shadow-lg">
        {msg}
      </div>
    </div>
  );
}
