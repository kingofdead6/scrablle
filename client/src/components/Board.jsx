import { useMemo } from 'react';
import { BONUS } from '../constants';

const LABELS = { DL: '2L', TL: '3L', DW: '2W', TW: '3W' };

/** Empty squares touching a tile — where a play can actually start. */
function findTargets(board, staged) {
  const filled = (r, c) =>
    (r >= 0 && r < 15 && c >= 0 && c < 15) && (!!board[r][c] || staged.has(`${r},${c}`));
  const targets = new Set();
  let anyTile = false;
  for (let r = 0; r < 15 && !anyTile; r++)
    for (let c = 0; c < 15 && !anyTile; c++) if (filled(r, c)) anyTile = true;
  if (!anyTile) return new Set(['7,7']);

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      if (filled(r, c)) continue;
      if (filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1))
        targets.add(`${r},${c}`);
    }
  }
  return targets;
}

export default function Board({
  board,
  staged = new Map(),
  lastCells = new Set(),
  shadow = new Map(),
  onCellTap,
  interactive = false,
  showTargets = false,
  wordMarks = new Map(),
}) {
  const targets = useMemo(
    () => (showTargets ? findTargets(board, staged) : new Set()),
    [showTargets, board, staged]
  );

  return (
    <div className="board w-full select-none">
      {board.map((row, r) =>
        row.map((cell, c) => {
          const key = `${r},${c}`;
          const bonus = BONUS[r][c];
          const stagedTile = staged.get(key);
          const shadowTile = !stagedTile ? shadow.get(key) : null;
          const isLast = lastCells.has(key);
          const isTarget = targets.has(key) && !cell && !stagedTile;
          const mark = wordMarks.get(key); // 'ok' | 'bad' | undefined
          const Comp = interactive ? 'button' : 'div';
          return (
            <Comp
              key={key}
              type={interactive ? 'button' : undefined}
              onClick={interactive ? () => onCellTap?.(r, c) : undefined}
              className={[
                'cell',
                bonus ? `cell--${bonus}` : '',
                isLast ? 'cell--last' : '',
                isTarget ? 'cell--target' : '',
                mark ? `cell--${mark}` : '',
              ].join(' ')}
              aria-label={`Row ${r + 1}, column ${c + 1}`}
            >
              {!cell && !stagedTile && !shadowTile && (
                r === 7 && c === 7
                  ? <span className="cell-star">★</span>
                  : bonus && <span className="cell-label">{LABELS[bonus]}</span>
              )}
              {cell && (
                <span className={`tile ${isLast ? 'drop tile--fresh' : ''}`}>
                  {cell.isBlank && <span className="tile-blankmark" />}
                  <span className="tile-letter">{cell.letter}</span>
                  <span className="tile-value">{cell.value || ''}</span>
                </span>
              )}
              {stagedTile && (
                <span className="tile tile--staged drop">
                  {stagedTile.isBlank && <span className="tile-blankmark" />}
                  <span className="tile-letter">{stagedTile.letter}</span>
                  <span className="tile-value">{stagedTile.value || ''}</span>
                </span>
              )}
              {shadowTile && (
                <span className="tile tile--shadow pop" title={shadowTile.playerName ? `${shadowTile.playerName} is placing…` : undefined}>
                  {shadowTile.isBlank && <span className="tile-blankmark" />}
                  <span className="tile-letter">{shadowTile.letter}</span>
                </span>
              )}
            </Comp>
          );
        })
      )}
    </div>
  );
}
