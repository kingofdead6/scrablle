import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth';

export function Avatar({ user, size = 'h-8 w-8', className = '' }) {
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();
  if (user?.avatarUrl)
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={`${size} shrink-0 rounded-full border border-line object-cover ${className}`}
      />
    );
  return (
    <span
      className={`${size} grid shrink-0 place-items-center rounded-full border border-line bg-panel2 font-display font-semibold text-brasslight ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

const linkClass = ({ isActive }) =>
  `btn h-9 px-3 text-sm ${isActive ? 'btn-brass' : 'btn-ghost'}`;

/**
 * The bar above every page except the game itself — the game screen has its own
 * chrome and needs the whole viewport.
 */
export default function SiteNav() {
  const { user, features, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
        <Link to="/" className="mr-1 font-display text-lg font-semibold text-ivory">
          Scrabble<span className="text-brasslight">Live</span>
        </Link>

        <NavLink to="/" end className={linkClass}>Play</NavLink>
        <NavLink to="/dictionary" className={linkClass}>Dictionary</NavLink>
        {features.accounts && user && !user.isGuest && (
          <>
            <NavLink to="/friends" className={linkClass}>Friends</NavLink>
            <NavLink to="/history" className={linkClass}>Games</NavLink>
          </>
        )}

        <span className="ml-auto flex items-center gap-2">
          {!features.accounts ? (
            <span className="text-xs text-mist">Guest play only</span>
          ) : user ? (
            <>
              <Link to="/me" className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-panel2/60">
                <Avatar user={user} />
                <span className="hidden text-sm font-semibold text-ivory sm:inline">{user.name}</span>
              </Link>
              <button onClick={signOut} className="btn btn-ghost h-9 px-3 text-sm">Sign out</button>
            </>
          ) : (
            <NavLink to="/sign-in" className={linkClass}>Sign in</NavLink>
          )}
        </span>
      </nav>
    </header>
  );
}

/** Page wrapper: nav plus a centred column. */
export function Page({ title, subtitle, children, wide = false }) {
  return (
    <div className="min-h-dvh">
      <SiteNav />
      <main className={`mx-auto w-full px-4 py-6 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {title && (
          <header className="fade-up mb-5">
            <h1 className="font-display text-2xl font-semibold text-ivory">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-mist">{subtitle}</p>}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
