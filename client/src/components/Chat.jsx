import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket';

/**
 * Room chat. Holds the message log, tracks how many arrived while the panel was
 * shut, and exposes the open/close state both the button and panel need.
 */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onHistory = (list) => {
      setMessages(Array.isArray(list) ? list : []);
      setUnread(0);
    };
    const onNew = (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (!openRef.current) setUnread((n) => n + 1);
    };
    socket.on('chat:history', onHistory);
    socket.on('chat:new', onNew);
    return () => {
      socket.off('chat:history', onHistory);
      socket.off('chat:new', onNew);
    };
  }, []);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) setUnread(0);
      return !wasOpen;
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);
  const clear = useCallback(() => { setMessages([]); setUnread(0); setOpen(false); }, []);

  return { messages, open, unread, toggle, close, clear };
}

export function ChatButton({ unread, onClick, className = 'h-9 px-3 text-sm' }) {
  return (
    <button
      onClick={onClick}
      title="Chat"
      aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
      className={`btn btn-ghost relative ${className}`}
    >
      <span aria-hidden="true">💬</span>
      {unread > 0 && (
        <span className="pop absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-cinnabar px-1 text-[0.6rem] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

const clock = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Message({ msg, mine }) {
  if (msg.kind === 'system')
    return (
      <p className="fade-up py-1 text-center text-xs text-mist">
        <span className="rounded-full bg-panel2/70 px-2.5 py-1">{msg.text}</span>
      </p>
    );

  return (
    <div className={`fade-up flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <span className="px-1 text-[0.65rem] text-mist">
        {/* Other people's host messages are already signed "Host" by the server. */}
        {mine ? 'You' : msg.name}{mine && msg.isHost && ' · host'} · {clock(msg.ts)}
      </span>
      <span
        className={`max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm ${
          mine
            ? 'rounded-br-sm bg-brass/25 text-ivory'
            : 'rounded-bl-sm border border-line bg-panel2/70'
        }`}
      >
        {msg.text}
      </span>
    </div>
  );
}

export default function ChatPanel({ messages, me, isHost, code, onClose, onError }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Stick to the newest message, and focus the box when the panel opens.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    socket.emit('chat:send', { text }, (res) => {
      if (res?.error) {
        onError?.(res.error);
        setDraft(text); // hand it back rather than losing what they typed
      }
    });
  };

  const isMine = (msg) =>
    msg.playerId ? msg.playerId === me : isHost && msg.isHost;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-end sm:justify-end" onClick={onClose}>
      <div
        className="slide-up card m-0 flex h-[70dvh] w-full flex-col sm:m-5 sm:h-[28rem] sm:w-[22rem] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-display text-base font-semibold text-ivory">
            Table chat
            {code && <span className="ml-2 align-middle text-xs font-semibold tracking-[0.2em] text-brasslight">{code}</span>}
          </h3>
          <button onClick={onClose} className="btn btn-ghost h-8 px-3 text-sm">Close</button>
        </div>

        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {messages.length === 0 ? (
            <p className="pt-6 text-center text-sm text-mist">
              Nothing yet. Say hello — everyone in the room sees it.
            </p>
          ) : (
            messages.map((msg) => <Message key={msg.id} msg={msg} mine={isMine(msg)} />)
          )}
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the table…"
            maxLength={240}
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-ink/60 px-3 text-sm text-ivory placeholder:text-mist/50 focus:border-brass focus:outline-none"
          />
          <button type="submit" disabled={!draft.trim()} className="btn btn-brass h-11 px-4 text-sm">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
