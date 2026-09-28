/**
 * Layout.jsx — app shell: glass top bar, side rail on desktop, thumb-friendly
 * bottom navigation on phones, language switcher, offline banner.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { Icons, Logo } from './ui.jsx';
import { cx } from '../lib/utils.js';

const NAV = [
  { to: '/app', key: 'nav.dashboard', icon: Icons.home, end: true },
  { to: '/app/records', key: 'nav.records', icon: Icons.sprout },
  { to: '/app/assistant', key: 'nav.assistant', icon: Icons.chat },
  { to: '/app/soil', key: 'nav.soil', icon: Icons.flask },
  { to: '/app/scan', key: 'nav.scan', icon: Icons.camera },
];

function LanguageMenu() {
  const { lang, setLang, languages, t } = useI18n();
  const { updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const choose = (code) => {
    setLang(code);
    setOpen(false);
    updateProfile({ language: code }).catch(() => {}); // sync choice to the account
  };

  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-icon w-auto gap-1.5 px-3 text-xs font-bold"
        aria-label={t('common.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icons.globe className="h-4 w-4" />
        <span className="hidden sm:inline">{current.native}</span>
        <span className="sm:hidden">{current.code.toUpperCase()}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift animate-pop-in">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => choose(l.code)}
              className={cx(
                'flex w-full items-center justify-between px-4 py-3 text-sm font-semibold transition hover:bg-leaf-50',
                l.code === lang ? 'bg-leaf-50 text-leaf-700' : 'text-slate-700',
              )}
            >
              <span>{l.native}</span>
              {l.code === lang && <Icons.check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const initials = (user?.full_name || user?.email || 'F')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      {/* ── top bar ── */}
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/app" className="shrink-0"><Logo /></Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition',
                    isActive ? 'bg-leaf-50 text-leaf-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                <n.icon style={{ width: 18, height: 18 }} />
                {t(n.key)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageMenu />
            <Link to="/app/profile" className="flex items-center gap-2 rounded-xl p-1 pr-2 transition hover:bg-slate-100">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-leaf-500 to-leaf-700 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden max-w-[110px] truncate text-sm font-semibold text-slate-700 sm:block">
                {user?.full_name || 'Profile'}
              </span>
            </Link>
            <button onClick={doLogout} className="btn-icon hidden sm:grid" title={t('common.logout')} aria-label={t('common.logout')}>
              <Icons.logout />
            </button>
          </div>
        </div>
      </header>

      {/* route transition key */}
      <main key={location.pathname} className="mx-auto max-w-6xl animate-fade-up px-4 pb-8 pt-5 safe-bottom md:pb-12">
        {children ?? <Outlet />}
      </main>

      {/* ── bottom nav (phones) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition',
                  isActive ? 'text-leaf-700' : 'text-slate-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-9 w-12 place-items-center rounded-xl transition', isActive && 'bg-leaf-50')}>
                    <n.icon style={{ width: 21, height: 21 }} />
                  </span>
                  <span className="truncate px-0.5">{t(n.key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }) {
  const navigate = useNavigate();
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {back && (
          <button onClick={() => navigate(-1)} className="btn-icon mt-0.5" aria-label="Back">
            <Icons.arrowLeft />
          </button>
        )}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
