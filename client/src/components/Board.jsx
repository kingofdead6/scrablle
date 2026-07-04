import { BONUS } from '../constants';

const LABELS = { DL: '2L', TL: '3L', DW: '2W', TW: '3W' };

export default function Board({ board, staged = new Map(), lastCells = new Set(), onCellTap, interactive = false }) {
  return (
    <div className="board w-full select-none">
      {board.map((row, r) =>
        row.map((cell, c) => {
          const key = `${r},${c}`;
          const bonus = BONUS[r][c];
          const stagedTile = staged.get(key);
          const isLast = lastCells.has(key);
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
              ].join(' ')}
              aria-label={`Row ${r + 1}, column ${c + 1}`}
            >
              {!cell && !stagedTile && (
                r === 7 && c === 7
                  ? <span className="cell-star">★</span>
                  : bonus && <span className="cell-label">{LABELS[bonus]}</span>
              )}
              {cell && (
                <span className={`tile ${isLast ? 'pop' : ''}`}>
                  {cell.isBlank && <span className="tile-blankmark" />}
                  <span className="tile-letter">{cell.letter}</span>
                  <span className="tile-value">{cell.value || ''}</span>
                </span>
              )}
              {stagedTile && (
                <span className="tile tile--staged pop">
                  {stagedTile.isBlank && <span className="tile-blankmark" />}
                  <span className="tile-letter">{stagedTile.letter}</span>
                  <span className="tile-value">{stagedTile.value || ''}</span>
                </span>
              )}
            </Comp>
          );
        })
      )}
    </div>
  );
}
