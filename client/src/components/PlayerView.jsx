import { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket';
import { LETTER_VALUES, ALPHABET } from '../constants';
import Board from './Board';
import { Toast, useToast } from './Toast';

export default function PlayerView({ state, rack, me, onLeave }) {
  const [order, setOrder] = useState([]);            // display order of rack indices
  const [selectedId, setSelectedId] = useState(null);
  const [staged, setStaged] = useState([]);          // {id, letter, isBlank, as, row, col}
  const [swapMode, setSwapMode] = useState(false);
  const [swapIds, setSwapIds] = useState(new Set());
  const [blankPick, setBlankPick] = useState(null);  // {id, row, col}
  const [passArmed, setPassArmed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [toast, showToast] = useToast();

  const myIdx = state.players.findIndex((p) => p.id === me);
  const myScore = state.players[myIdx]?.score ?? 0;
  const myTurn = state.status === 'playing' && state.turn === myIdx;
  const currentName = state.players[state.turn]?.name;

  // Reset local staging whenever the server rack actually changes
  const rackKey = rack.join('');
  useEffect(() => {
    setOrder(rack.map((_, i) => i));
    setStaged([]);
    setSelectedId(null);
    setSwapMode(false);
    setSwapIds(new Set());
    setBlankPick(null);
  }, [rackKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop staged tiles whose square got taken by another player's move
  useEffect(() => {
    setStaged((prev) => prev.filter((s) => !state.board[s.row][s.col]));
  }, [state.board]);

  // Nudge the phone when it becomes your turn
  useEffect(() => {
    if (myTurn) navigator.vibrate?.(150);
    setPassArmed(false);
  }, [myTurn]);

  const usedIds = useMemo(() => new Set(staged.map((s) => s.id)), [staged]);
  const stagedMap = useMemo(() => {
    const m = new Map();
    for (const s of staged)
      m.set(`${s.row},${s.col}`, {
        letter: s.isBlank ? s.as : s.letter,
        value: s.isBlank ? 0 : LETTER_VALUES[s.letter],
        isBlank: s.isBlank,
      });
    return m;
  }, [staged]);
  const lastCells = useMemo(
    () => new Set((state.lastMove?.cells || []).map((c) => `${c.row},${c.col}`)),
    [state.lastMove]
  );

  // ── Interactions ──
  const tapRack = (id) => {
    if (swapMode) {
      setSwapIds((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      return;
    }
    if (usedIds.has(id)) return;
    setSelectedId((prev) => (prev === id ? null : id));
  };

  const tapCell = (r, c) => {
    if (!myTurn) return showToast(`Waiting for ${currentName}…`);
    if (swapMode) return;
    const key = `${r},${c}`;
    if (stagedMap.has(key)) {
      setStaged((prev) => prev.filter((s) => !(s.row === r && s.col === c)));
      return;
    }
    if (state.board[r][c]) return;
    if (selectedId === null) return showToast('Pick a tile from your rack first.');
    const letter = rack[selectedId];
    if (letter === '_') {
      setBlankPick({ id: selectedId, row: r, col: c });
    } else {
      setStaged((prev) => [...prev, { id: selectedId, letter, isBlank: false, row: r, col: c }]);
    }
    setSelectedId(null);
  };

  const chooseBlank = (as) => {
    setStaged((prev) => [...prev, { ...blankPick, letter: '_', isBlank: true, as }]);
    setBlankPick(null);
  };

  const recall = () => { setStaged([]); setSelectedId(null); };

  const shuffle = () =>
    setOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });

  const submit = () => {
    const placements = staged.map((s) => ({
      row: s.row,
      col: s.col,
      letter: s.isBlank ? s.as : s.letter,
      isBlank: s.isBlank,
    }));
    socket.emit('player:move', { placements }, (res) => {
      if (res?.error) showToast(res.error);
    });
  };

  const pass = () => {
    if (!passArmed) {
      setPassArmed(true);
      setTimeout(() => setPassArmed(false), 3000);
      return;
    }
    socket.emit('player:pass', (res) => res?.error && showToast(res.error));
  };

  const toggleSwap = () => {
    if (!swapMode) recall();
    setSwapIds(new Set());
    setSwapMode((v) => !v);
  };

  const confirmSwap = () => {
    const letters = [...swapIds].map((id) => rack[id]);
    socket.emit('player:swap', { letters }, (res) => res?.error && showToast(res.error));
  };

  // ── Lobby ──
  if (state.status === 'lobby') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="fade-up card w-full p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Room {state.code}</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ivory">You're in.</h2>
          <p className="mt-1 text-sm text-mist">Waiting for the host to start…</p>
          <div className="mt-5 space-y-2">
            {state.players.map((p) => (
              <div key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${p.id === me ? 'border-brass/50 bg-brass/10' : 'border-line bg-panel2/50'}`}>
                <span className="font-medium">{p.name}{p.id === me && ' (you)'}</span>
                <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-sage' : 'bg-cinnabar'}`} />
              </div>
            ))}
          </div>
        </div>
        <button onClick={onLeave} className="btn btn-ghost h-10 px-5 text-sm">Leave room</button>
      </div>
    );
  }

  // ── Ended ──
  if (state.status === 'ended') {
    const standings = [...state.players].sort((a, b) => b.score - a.score);
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5">
        <div className="fade-up card w-full p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Game over</p>
          <h2 className="mt-1 font-display text-3xl font-semibold text-brasslight">
            {state.winners?.includes(state.players[myIdx]?.name) ? 'You win!' : `${state.winners?.join(' & ')} wins`}
          </h2>
          <div className="mt-5 space-y-2 text-left">
            {standings.map((p, i) => (
              <div key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${p.id === me ? 'border-brass/50 bg-brass/10' : 'border-line bg-panel2/50'}`}>
                <span className="font-medium">{i + 1}. {p.name}</span>
                <span className="font-display text-xl font-semibold text-ivory">{p.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-mist">The host screen can start a rematch.</p>
        </div>
        <button onClick={onLeave} className="btn btn-ghost h-10 px-5 text-sm">Leave room</button>
      </div>
    );
  }

  // ── Playing ──
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-3 pb-3 pt-3">
      <div className={`rounded-xl px-4 py-2.5 text-center text-sm font-semibold ${myTurn ? 'bg-gradient-to-r from-brasslight to-brass text-[#241a0d]' : 'card text-mist'}`}>
        {myTurn ? 'Your turn — tap a tile, then a square' : `Waiting for ${currentName}…`}
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-xs text-mist">
        <span>You <span className="font-display text-base font-semibold text-brasslight">{myScore}</span></span>
        <span>Bag {state.bagCount} · Room {state.code}</span>
        <button onClick={() => setZoom((z) => !z)} className="btn btn-ghost h-7 px-2.5 text-xs">
          {zoom ? 'Fit board' : 'Zoom board'}
        </button>
      </div>

      <div className="mt-2 overflow-auto rounded-2xl">
        <div style={{ width: zoom ? '160%' : '100%' }}>
          <Board
            board={state.board}
            staged={stagedMap}
            lastCells={lastCells}
            onCellTap={tapCell}
            interactive
          />
        </div>
      </div>

      {state.lastMove?.type === 'play' && (
        <p className="mt-2 px-1 text-xs text-mist">
          Last: <span className="text-ivory">{state.lastMove.playerName}</span> —{' '}
          {state.lastMove.words.map((w) => w.word).join(', ')}{' '}
          <span className="text-sage">+{state.lastMove.score}</span>
        </p>
      )}

      {/* Rack + actions dock */}
      <div className="card sticky bottom-2 mt-auto space-y-3 p-3">
        <div className="flex justify-center gap-1.5">
          {order.map((id) => {
            const letter = rack[id];
            if (letter === undefined) return null;
            const ghost = usedIds.has(id);
            const cls = ghost
              ? 'rtile rtile--ghost'
              : swapMode && swapIds.has(id)
                ? 'rtile rtile--swap'
                : selectedId === id
                  ? 'rtile rtile--selected'
                  : 'rtile';
            return (
              <button key={id} onClick={() => tapRack(id)} disabled={ghost} className={cls}>
                {letter === '_' && !ghost && <span className="tile-blankmark" style={{ width: 6, height: 6 }} />}
                <span className="rtile-letter">{letter === '_' ? '' : letter}</span>
                <span className="rtile-value">{LETTER_VALUES[letter] || ''}</span>
              </button>
            );
          })}
        </div>

        {swapMode ? (
          <div className="flex gap-2">
            <button onClick={toggleSwap} className="btn btn-ghost h-11 flex-1">Cancel</button>
            <button onClick={confirmSwap} disabled={!myTurn || swapIds.size === 0} className="btn btn-danger h-11 flex-1">
              Swap {swapIds.size || ''} & end turn
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={recall} disabled={staged.length === 0} className="btn btn-ghost h-11 px-3 text-sm">Recall</button>
            <button onClick={shuffle} className="btn btn-ghost h-11 px-3 text-sm">Shuffle</button>
            <button onClick={toggleSwap} disabled={!myTurn} className="btn btn-ghost h-11 px-3 text-sm">Swap</button>
            <button onClick={pass} disabled={!myTurn} className={`btn h-11 px-3 text-sm ${passArmed ? 'btn-danger' : 'btn-ghost'}`}>
              {passArmed ? 'Sure?' : 'Pass'}
            </button>
            <button onClick={submit} disabled={!myTurn || staged.length === 0} className="btn btn-brass h-11 flex-1 text-base">
              Play
            </button>
          </div>
        )}
      </div>

      {/* Blank tile letter picker */}
      {blankPick && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-5" onClick={() => setBlankPick(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ivory">Blank tile — choose a letter</h3>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {ALPHABET.map((l) => (
                <button
                  key={l}
                  onClick={() => chooseBlank(l)}
                  className="rtile !h-11 !w-full"
                >
                  <span className="rtile-letter !text-xl">{l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast} />
    </div>
  );
}
