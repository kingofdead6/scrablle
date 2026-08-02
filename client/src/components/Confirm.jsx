export default function Confirm({ title, body, confirmLabel, onConfirm, onCancel, danger = true }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-5" onClick={onCancel}>
      <div className="burst card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-ivory">{title}</h3>
        {body && <p className="mt-1.5 text-sm text-mist">{body}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn btn-ghost h-11 flex-1">Stay</button>
          <button onClick={onConfirm} className={`btn h-11 flex-1 ${danger ? 'btn-danger' : 'btn-brass'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
