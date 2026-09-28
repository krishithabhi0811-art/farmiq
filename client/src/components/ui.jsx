/**
 * ui.jsx — small reusable building blocks (icons, cards, modal, toasts…).
 * Icons are inline SVG (no external requests) and drawn to feel obvious.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { cx } from '../lib/utils.js';

/* ─────────────── icons (stroke style, 24px grid) ─────────────── */
const Svg = ({ children, className = 'h-5 w-5', ...rest }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const Icons = {
  leaf: (p) => <Svg {...p}><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></Svg>,
  home: (p) => <Svg {...p}><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M9 21v-8h6v8" /></Svg>,
  sprout: (p) => <Svg {...p}><path d="M7 20h10" /><path d="M12 20v-8" /><path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5Z" /><path d="M12 12c0-3-2-5-5-5 0 3 2 5 5 5Z" /></Svg>,
  grid: (p) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></Svg>,
  chat: (p) => <Svg {...p}><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.4-4.2A8 8 0 1 1 21 12Z" /></Svg>,
  sparkles: (p) => <Svg {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" /><path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" /></Svg>,
  flask: (p) => <Svg {...p}><path d="M9 3h6" /><path d="M10 3v5.5L5.6 16A3 3 0 0 0 8.2 20h7.6a3 3 0 0 0 2.6-4.5L14 8.5V3" /><path d="M7.5 14h9" /></Svg>,
  camera: (p) => <Svg {...p}><path d="M4 8h2.2l1.3-2h9l1.3 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></Svg>,
  user: (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></Svg>,
  plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  search: (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>,
  edit: (p) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Svg>,
  trash: (p) => <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></Svg>,
  close: (p) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>,
  check: (p) => <Svg {...p}><path d="m5 13 4 4L19 7" /></Svg>,
  alert: (p) => <Svg {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></Svg>,
  drop: (p) => <Svg {...p}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /></Svg>,
  chart: (p) => <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>,
  logout: (p) => <Svg {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></Svg>,
  globe: (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" /></Svg>,
  send: (p) => <Svg {...p}><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4Z" /></Svg>,
  arrowLeft: (p) => <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>,
  refresh: (p) => <Svg {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></Svg>,
  cloud: (p) => <Svg {...p}><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.6 1.6A3.7 3.7 0 0 0 6.5 19Z" /></Svg>,
  shield: (p) => <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></Svg>,
  rupee: (p) => <Svg {...p}><path d="M6 4h12M6 9h12" /><path d="M6 4c5 0 7 2 7 5s-2 5-7 5h5l5 6" /></Svg>,
  calendar: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></Svg>,
  upload: (p) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /></Svg>,
  menu: (p) => <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>,
};

/* ─────────────── Logo ─────────────── */
export function Logo({ size = 36, withText = true, text = 'FARM-IQ', sub }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="grid place-items-center rounded-2xl bg-gradient-to-br from-leaf-500 to-leaf-700 text-white shadow-[0_8px_20px_-8px_rgba(22,163,74,.8)]"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21v-7" />
          <path d="M12 14c0-3.3 2.2-5.5 5.5-5.5 0 3.3-2.2 5.5-5.5 5.5Z" fill="currentColor" fillOpacity=".25" />
          <path d="M12 14c0-3.3-2.2-5.5-5.5-5.5 0 3.3 2.2 5.5 5.5 5.5Z" fill="currentColor" fillOpacity=".25" />
          <path d="M4 21h16" />
        </svg>
      </div>
      {withText && (
        <div className="leading-tight">
          <div className="text-[17px] font-extrabold tracking-tight text-slate-900">{text}</div>
          {sub && <div className="text-[11px] font-medium text-leaf-700">{sub}</div>}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Card / Badge / Stat ─────────────── */
export function Card({ className, children, as: As = 'div', ...rest }) {
  return <As className={cx('card p-5', className)} {...rest}>{children}</As>;
}

export function Badge({ children, className }) {
  return <span className={cx('chip', className)}>{children}</span>;
}

export function StatCard({ icon, label, value, unit, tone = 'leaf' }) {
  const tones = {
    leaf: 'from-leaf-50 to-white text-leaf-700 border-leaf-100',
    sky: 'from-sky-50 to-white text-sky-600 border-sky-100',
    sun: 'from-sun-50 to-white text-sun-600 border-sun-100',
    red: 'from-red-50 to-white text-red-600 border-red-100',
    soil: 'from-soil-100 to-white text-soil-700 border-soil-200',
  };
  return (
    <div className={cx('rounded-2xl border bg-gradient-to-br p-4 shadow-soft', tones[tone])}>
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide opacity-80">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/80 shadow-sm">{icon}</span>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-extrabold text-slate-900">{value}</span>
        {unit && <span className="text-xs font-semibold text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-leaf-50 text-3xl">{icon}</div>
      <h3 className="mt-4 text-base font-bold text-slate-800">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="block">
      <span className="label">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="help">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}

export function ErrorBox({ children, className }) {
  if (!children) return null;
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm font-medium text-red-700', className)}>
      <Icons.alert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function InfoBox({ children, tone = 'leaf' }) {
  const tones = {
    leaf: 'border-leaf-100 bg-leaf-50 text-leaf-800',
    sun: 'border-sun-100 bg-sun-50 text-amber-800',
    sky: 'border-sky-100 bg-sky-50 text-sky-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return <div className={cx('rounded-xl border px-3.5 py-3 text-sm leading-relaxed', tones[tone])}>{children}</div>;
}

/* ─────────────── Modal ─────────────── */
export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative z-10 w-full animate-pop-in rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
          'max-h-[92vh] overflow-y-auto',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-3xl border-b border-slate-100 bg-white/90 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="btn-icon" aria-label="Close"><Icons.close /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">{footer}</div>}
      </div>
    </div>
  );
}

/* ─────────────── Toasts ─────────────── */
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(
    () => ({
      toast: push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
    }),
    [push],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lift animate-fade-up backdrop-blur-xl',
              t.type === 'success' && 'border-leaf-200 bg-leaf-50/95 text-leaf-800',
              t.type === 'error' && 'border-red-200 bg-red-50/95 text-red-700',
              t.type === 'info' && 'border-sky-200 bg-sky-50/95 text-sky-800',
            )}
          >
            {t.type === 'success' ? <Icons.check className="mt-0.5 h-4 w-4 shrink-0" />
              : t.type === 'error' ? <Icons.alert className="mt-0.5 h-4 w-4 shrink-0" />
              : <Icons.sparkles className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/* ─────────────── Confirm dialog (promise based) ─────────────── */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, danger }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn bg-red-600 text-white flex-1 hover:bg-red-700' : 'btn-primary flex-1'} onClick={onConfirm}>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      }>
      <p className="text-sm leading-relaxed text-slate-600">{body}</p>
    </Modal>
  );
}

/* ─────────────── simple SVG bar chart (no chart library) ─────────────── */
export function BarChart({ data = [], color = '#16a34a', height = 120 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] font-bold text-slate-500 opacity-0 transition group-hover:opacity-100">{d.value}</span>
          <div
            className="w-full rounded-t-lg transition-all duration-500"
            style={{ height: `${Math.max(4, (d.value / max) * (height - 34))}px`, background: color, opacity: 0.85 }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="truncate text-[10px] font-semibold text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressRing({ value = 0, size = 84, stroke = 9, color = '#16a34a' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-lg font-extrabold leading-none text-slate-900">{Math.round(pct)}</div>
        <div className="text-[10px] font-semibold text-slate-400">/ 100</div>
      </div>
    </div>
  );
}
