import { useMemo } from 'react';
import Sheet from './Sheet';
import { unseenTiles } from '../tiles';

function TileCount({ row }) {
  const gone = row.left === 0;
  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-2 py-1.5 transition ${
        gone
          ? 'border-line/60 bg-panel2/30 opacity-40'
          : 'border-line bg-panel2/60'
      }`}
    >
      <span className="flex items-baseline gap-0.5">
        <span className="font-display text-base font-bold text-ivory">
          {row.letter === '_' ? '▢' : row.letter}
        </span>
        <span className="text-[0.6rem] text-mist">{row.letter === '_' ? '' : row.value}</span>
      </span>
      <span className={`font-display text-base font-semibold ${gone ? 'text-mist' : 'text-brasslight'}`}>
        {row.left}
        <span className="text-[0.6rem] text-mist">/{row.of}</span>
      </span>
    </div>
  );
}

/**
 * What's still to come. Shows unseen tiles — the bag plus the racks you can't
 * see — which is what tile-tracking at a real table gives you. Showing the bag
 * alone would let you subtract and read an opponent's rack.
 */
export default function TilesPanel({ board, myRack = [], bagCount, onClose }) {
  const { rows, total, vowels, consonants, blanks } = useMemo(
    () => unseenTiles(board, myRack),
    [board, myRack]
  );
  const onRacks = Math.max(0, total - bagCount);

  return (
    <Sheet title="Tiles left" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Unseen', value: total, accent: true },
          { label: 'In the bag', value: bagCount },
          { label: 'On racks', value: onRacks },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-line bg-panel2/60 px-2 py-2.5">
            <p className={`font-display text-2xl font-semibold ${stat.accent ? 'text-brasslight' : 'text-ivory'}`}>
              {stat.value}
            </p>
            <p className="text-[0.6rem] uppercase tracking-[0.12em] text-mist">{stat.label}</p>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-mist">
        Unseen means the bag <em>plus</em> the racks you can't see
        {myRack.length > 0 && ' — your own tiles are already taken off'}.
        {' '}<span className="text-ivory">{vowels}</span> vowels ·{' '}
        <span className="text-ivory">{consonants}</span> consonants ·{' '}
        <span className="text-ivory">{blanks}</span> blank{blanks === 1 ? '' : 's'}.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-1.5 min-[380px]:grid-cols-4">
        {rows.map((row) => <TileCount key={row.letter} row={row} />)}
      </div>
    </Sheet>
  );
}
