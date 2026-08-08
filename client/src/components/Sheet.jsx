/**
 * The popup shell shared by chat, tiles and history: a bottom sheet on a phone,
 * a corner panel on the board screen. Children fill the scrollable body unless
 * `footer` is given, which stays pinned.
 */
export default function Sheet({ title, badge, onClose, children, footer, bodyRef, bodyClass = '' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:justify-end" onClick={onClose}>
      <div
        className="slide-up card m-0 flex h-[70dvh] w-full flex-col sm:m-5 sm:h-[28rem] sm:w-[22rem] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-display text-base font-semibold text-ivory">
            {title}
            {badge && (
              <span className="ml-2 align-middle text-xs font-semibold tracking-[0.2em] text-brasslight">
                {badge}
              </span>
            )}
          </h3>
          <button onClick={onClose} className="btn btn-ghost h-8 px-3 text-sm">Close</button>
        </div>

        <div ref={bodyRef} className={`flex-1 overflow-y-auto ${bodyClass || 'px-4 py-3'}`}>{children}</div>

        {footer}
      </div>
    </div>
  );
}
