import { useEffect, useMemo, useState } from 'react';
import { socket } from '../socket';
import { LETTER_VALUES, ALPHABET } from '../constants';
import Board from './Board';
import Confirm from './Confirm';
import ScoreBurst, { useScoreBurst } from './ScoreBurst';
import ThemeSheet, { ThemeButton } from './ThemePicker';
import { RefreshButton } from './GameBarButtons';
import { Toast, useToast } from './Toast';
import { useCountdown } from '../useCountdown';
import { scoreStaged } from '../scoring';

function Thinking() {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {[0, 1, 2].map((i) => <span key={i} className="think-dot" style={{ '--i': i }} />)}
    </span>
  );
}

export default function PlayerView({ state, rack, me, onLeave, theme, onTheme }) {
  const [order, setOrder] = useState([]);            // display order of rack indices
  const [selectedId, setSelectedId] = useState(null);
  const [staged, setStaged] = useState([]);          // {id, letter, isBlank, as, row, col}
  const [swapMode, setSwapMode] = useState(false);
  const [swapIds, setSwapIds] = useState(new Set());
  const [blankPick, setBlankPick] = useState(null);  // {id, row, col}
  const [passArmed, setPassArmed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, showToast] = useToast();
  const [burst, showBurst] = useScoreBurst();

  const myIdx = state.players.findIndex((p) => p.id === me);
  const myScore = state.players[myIdx]?.score ?? 0;
  const myTurn = state.status === 'playing' && state.turn === myIdx;
  const current = state.players[state.turn];
  const currentName = current?.name;

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

  // Broadcast a "shadow tile" preview of what's staged so far, so other
  // screens can see tiles land before this player confirms the move.
  useEffect(() => {
    if (!myTurn) return;
    const placements = staged.map((s) => ({
      row: s.row,
      col: s.col,
      letter: s.isBlank ? s.as : s.letter,
      isBlank: s.isBlank,
      as: s.isBlank ? s.as : undefined,
    }));
    const id = setTimeout(() => {
      socket.emit('player:preview', { placements });
    }, 150);
    return () => clearTimeout(id);
  }, [staged, myTurn]);

  const remaining = useCountdown(state.status === 'playing' ? state.turnEndsAt : null);

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
  // Other players' unconfirmed placements (shown as shadow tiles). Skip our
  // own preview — our staged tiles already render via stagedMap.
  const shadowMap = useMemo(() => {
    const m = new Map();
    if (state.preview && state.preview.playerIdx !== myIdx) {
      const shadowName = state.players[state.preview.playerIdx]?.name;
      for (const c of state.preview.cells)
        m.set(`${c.row},${c.col}`, { letter: c.isBlank ? (c.letter || '?') : c.letter, isBlank: c.isBlank, playerName: shadowName });
    }
    return m;
  }, [state.preview, state.players, myIdx]);

  // What the staged word is worth right now. The server still has the final
  // say on whether the word is real — this is only the arithmetic.
  const potential = useMemo(() => {
    if (staged.length === 0) return null;
    return scoreStaged(
      state.board,
      staged.map((s) => ({ row: s.row, col: s.col, letter: s.isBlank ? s.as : s.letter, isBlank: s.isBlank }))
    );
  }, [staged, state.board]);

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
      if (res?.error) return showToast(res.error);
      // The server reports what it actually scored — show the breakdown.
      showBurst(res);
      navigator.vibrate?.(res.bingo ? [40, 60, 40, 60, 120] : 40);
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

  const overlays = (
    <>
      {themeOpen && <ThemeSheet theme={theme} onPick={onTheme} onClose={() => setThemeOpen(false)} />}
      {confirmLeave && (
        <Confirm
          title={state.status === 'playing' ? 'Leave the game?' : 'Leave the room?'}
          body={
            state.status === 'playing'
              ? 'Your tiles go back to the bag and the others keep playing without you. You cannot rejoin this game.'
              : 'You can join again with the room code.'
          }
          confirmLabel="Leave"
          onConfirm={() => { setConfirmLeave(false); onLeave(); }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      <Toast msg={toast} />
    </>
  );

  // ── Lobby ──
  if (state.status === 'lobby') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
        <div className="fade-up card w-full p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Room {state.code}</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ivory">You're in.</h2>
          <p className="mt-1 text-sm text-mist">Waiting for the host to start…</p>
          <div className="mt-5 space-y-2">
            {state.players.map((p, i) => (
              <div
                key={p.id}
                className={`deal flex items-center justify-between rounded-lg border px-3 py-2 ${p.id === me ? 'border-brass/50 bg-brass/10' : 'border-line bg-panel2/50'}`}
                style={{ '--i': i }}
              >
                <span className="font-medium">
                  {p.isBot && <span className="mr-1.5" aria-hidden="true">🤖</span>}
                  {p.name}{p.id === me && ' (you)'}
                  {p.isBot && <span className="ml-1.5 text-xs uppercase tracking-wide text-mist">{p.difficulty}</span>}
                </span>
                {!p.isBot && <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-sage' : 'bg-cinnabar'}`} />}
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <ThemeButton onClick={() => setThemeOpen(true)} className="h-10 px-4 text-sm" />
          <RefreshButton onDone={showToast} className="h-10 px-4 text-sm" />
          <button onClick={() => setConfirmLeave(true)} className="btn btn-ghost h-10 px-5 text-sm">Leave room</button>
        </div>
        {overlays}
      </div>
    );
  }

  // ── Ended ──
  if (state.status === 'ended') {
    const standings = [...state.players].sort((a, b) => b.score - a.score);
    const iWon = state.winners?.includes(state.players[myIdx]?.name);
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5">
        <div className="fade-up card w-full p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mist">Game over</p>
          <h2 className="burst-number mt-1 font-display text-3xl font-semibold">
            {iWon ? 'You win!' : `${state.winners?.join(' & ')} wins`}
          </h2>
          <div className="mt-5 space-y-2 text-left">
            {standings.map((p, i) => (
              <div
                key={p.id}
                className={`deal flex items-center justify-between rounded-lg border px-3 py-2.5 ${p.id === me ? 'border-brass/50 bg-brass/10' : 'border-line bg-panel2/50'}`}
                style={{ '--i': i }}
              >
                <span className="font-medium">
                  {i + 1}. {p.isBot && <span aria-hidden="true">🤖 </span>}{p.name}
                  {p.left && <span className="ml-1.5 text-xs text-mist">left</span>}
                </span>
                <span className="font-display text-xl font-semibold text-ivory">{p.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-mist">The host screen can start a rematch.</p>
        </div>
        <div className="flex gap-2">
          <ThemeButton onClick={() => setThemeOpen(true)} className="h-10 px-4 text-sm" />
          <RefreshButton onDone={showToast} className="h-10 px-4 text-sm" />
          <button onClick={() => setConfirmLeave(true)} className="btn btn-ghost h-10 px-5 text-sm">Leave room</button>
        </div>
        {overlays}
      </div>
    );
  }

  // ── Playing ──
  const urgent = myTurn && remaining !== null && remaining <= 10;
  const botThinking = state.thinking && state.thinking.playerIdx === state.turn;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-3 pb-3 pt-3">
      <div className={`slide-down flex items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold ${myTurn ? 'bg-gradient-to-r from-brasslight to-brass text-onbrass' : 'card text-mist'}`}>
        <span>
          {myTurn
            ? 'Your turn — tap a tile, then a square'
            : botThinking
              ? <>{currentName} is thinking <Thinking /></>
              : `Waiting for ${currentName}…`}
        </span>
        {remaining !== null && (
          <span className={`font-display text-base font-semibold ${urgent ? 'text-cinnabar' : ''}`}>{remaining}s</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 px-1 text-xs text-mist">
        <span>You <span className="font-display text-base font-semibold text-brasslight">{myScore}</span></span>
        <span className="truncate">Bag {state.bagCount} · {state.code}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => setZoom((z) => !z)} className="btn btn-ghost h-7 px-2.5 text-xs">
            {zoom ? 'Fit' : 'Zoom'}
          </button>
          <ThemeButton onClick={() => setThemeOpen(true)} className="h-7 px-2 text-xs" />
          <RefreshButton onDone={showToast} className="h-7 px-2 text-xs" />
          <button onClick={() => setConfirmLeave(true)} className="btn btn-ghost h-7 px-2.5 text-xs">Leave</button>
        </span>
      </div>

      <div className="mt-2 overflow-auto rounded-2xl">
        <div style={{ width: zoom ? '160%' : '100%' }}>
          <Board
            board={state.board}
            staged={stagedMap}
            lastCells={lastCells}
            shadow={shadowMap}
            onCellTap={tapCell}
            interactive
            showTargets={myTurn && selectedId !== null}
          />
        </div>
      </div>

      {/* Live worth of what's on the board right now */}
      {potential && (
        <div key={potential.valid ? potential.score : 'bad'} className="fade-up mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
          {potential.valid ? (
            <>
              <span className="font-display text-lg font-semibold text-brasslight">+{potential.score}</span>
              {potential.words.map((w, i) => (
                <span key={i} className="text-mist">
                  <span className="font-display font-semibold text-ivory">{w.word}</span> {w.score}
                </span>
              ))}
              {potential.bingo && <span className="font-semibold text-sage">bingo +50</span>}
            </>
          ) : (
            <span className="text-mist">{potential.reason}</span>
          )}
        </div>
      )}

      {!potential && state.lastMove?.type === 'play' && (
        <p className="mt-2 px-1 text-xs text-mist">
          Last: <span className="text-ivory">{state.lastMove.playerName}</span> —{' '}
          {state.lastMove.words.map((w) => w.word).join(', ')}{' '}
          <span className="text-sage">+{state.lastMove.score}</span>
        </p>
      )}

      {/* Rack + actions dock */}
      <div className="card sticky bottom-2 mt-auto space-y-3 p-3">
        <div className="flex justify-center gap-1.5">
          {order.map((id, slot) => {
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
              <button
                key={id}
                onClick={() => tapRack(id)}
                disabled={ghost}
                className={`${cls} deal`}
                style={{ '--i': slot }}
              >
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
          <div className="flex gap-1.5">
            <button onClick={recall} disabled={staged.length === 0} className="btn btn-ghost h-11 px-2.5 text-xs">Recall</button>
            <button onClick={shuffle} className="btn btn-ghost h-11 px-2.5 text-xs">Shuffle</button>
            <button onClick={toggleSwap} disabled={!myTurn} className="btn btn-ghost h-11 px-2.5 text-xs">Swap</button>
            <button onClick={pass} disabled={!myTurn} className={`btn h-11 px-2.5 text-xs ${passArmed ? 'btn-danger shake' : 'btn-ghost'}`}>
              {passArmed ? 'Sure?' : 'Pass'}
            </button>
            <button
              onClick={submit}
              disabled={!myTurn || staged.length === 0}
              className="btn btn-brass h-11 min-w-0 flex-1 gap-1.5 whitespace-nowrap text-base"
            >
              Play
              {potential?.valid && (
                <span className="pop rounded-md bg-onbrass/15 px-1.5 py-0.5 font-display text-sm font-bold">
                  +{potential.score}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Blank tile letter picker */}
      {blankPick && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-5" onClick={() => setBlankPick(null)}>
          <div className="burst card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-semibold text-ivory">Blank tile — choose a letter</h3>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {ALPHABET.map((l, i) => (
                <button
                  key={l}
                  onClick={() => chooseBlank(l)}
                  className="rtile deal !h-11 !w-full"
                  style={{ '--i': i % 6 }}
                >
                  <span className="rtile-letter !text-xl">{l}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ScoreBurst burst={burst} />
      {overlays}
    </div>
  );
}
