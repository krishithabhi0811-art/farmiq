import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { api } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import {
  BarChart, EmptyState, ErrorBox, Icons, StatCard, Spinner, useToast,
} from '../components/ui.jsx';
import {
  CATEGORY_ICONS, CATEGORY_STYLES, STATUS_DOT, cx, formatDate, pick, timeAgo,
} from '../lib/utils.js';

const QUICK = [
  { to: '/app/records?new=1', icon: Icons.plus, key: 'dash.addRecord', tone: 'from-leaf-500 to-leaf-700' },
  { to: '/app/assistant', icon: Icons.chat, key: 'dash.askAi', tone: 'from-sky-500 to-sky-700' },
  { to: '/app/scan', icon: Icons.camera, key: 'dash.scan', tone: 'from-violet-500 to-violet-700' },
  { to: '/app/soil', icon: Icons.flask, key: 'dash.soil', tone: 'from-soil-500 to-soil-700' },
];

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [s, list] = await Promise.all([api.itemStats(), api.listItems({ limit: 5 })]);
        if (!alive) return;
        setStats(s);
        setItems(list.items || []);
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const chartData = useMemo(() => {
    const by = stats?.byCategory || {};
    const rows = Object.entries(by).map(([k, v]) => ({ label: pick(t, 'cat', k, k).slice(0, 7), value: v }));
    return rows.length ? rows : [];
  }, [stats, t]);

  const firstName = (user?.full_name || '').split(' ')[0];

  return (
    <div>
      <PageHeader
        title={`${t('dash.hello')}${firstName ? `, ${firstName}` : ''} 👋`}
        subtitle={user?.district ? `${user.district} · ${t('dash.subtitle')}` : t('dash.subtitle')}
        action={
          <Link to="/app/records?new=1" className="btn-primary hidden sm:inline-flex">
            <Icons.plus className="h-4 w-4" /> {t('rec.new')}
          </Link>
        }
      />

      {/* quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to}
                className="group flex flex-col items-start gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <span className={cx('grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm transition group-hover:scale-105', q.tone)}>
              <q.icon />
            </span>
            <span className="text-[13px] font-bold leading-snug text-slate-800">{t(q.key)}</span>
          </Link>
        ))}
      </div>

      {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}

      {/* stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {loading && !stats ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[92px]" />)
        ) : (
          <>
            <StatCard icon={<Icons.grid className="h-4 w-4" />} label={t('dash.total')} value={stats?.total ?? 0} tone="leaf" />
            <StatCard icon={<Icons.sprout className="h-4 w-4" />} label={t('dash.area')} value={Number(stats?.area_acres ?? 0).toFixed(1)} unit={t('common.acres')} tone="sky" />
            <StatCard icon={<Icons.chart className="h-4 w-4" />} label={t('dash.yield')} value={Math.round(stats?.expected_yield_kg ?? 0)} unit="kg" tone="sun" />
            <StatCard icon={<Icons.alert className="h-4 w-4" />} label={t('dash.atRisk')} value={stats?.at_risk ?? 0} tone={stats?.at_risk ? 'red' : 'leaf'} />
          </>
        )}
      </div>

      {/* recent + chart */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title"><Icons.sprout className="h-4 w-4 text-leaf-600" /> {t('dash.recent')}</h2>
            <Link to="/app/records" className="text-xs font-bold text-leaf-700 hover:underline">{t('dash.viewAll')} →</Link>
          </div>

          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-[76px]" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="🌱"
              title={t('dash.empty')}
              subtitle={t('dash.emptySub')}
              action={<Link to="/app/records?new=1" className="btn-primary"><Icons.plus className="h-4 w-4" /> {t('dash.addRecord')}</Link>}
            />
          ) : (
            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.id}>
                  <button
                    onClick={() => navigate(`/app/records?open=${it.id}`)}
                    className="card card-hover flex w-full items-start gap-3 p-4 text-left"
                  >
                    <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl', CATEGORY_STYLES[it.category] || CATEGORY_STYLES.other)}>
                      {CATEGORY_ICONS[it.category] || '📌'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-bold text-slate-900">{it.title}</span>
                        <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[it.status] || 'bg-slate-300')} />
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-[13px] text-slate-500">
                        {it.description || it.crop_name || pick(t, 'cat', it.category)}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                        <span>{timeAgo(it.created_at)}</span>
                        {it.area_acres > 0 && <span>· {it.area_acres} {t('common.acres')}</span>}
                        {it.field_name && <span>· {it.field_name}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="section-title"><Icons.chart className="h-4 w-4 text-leaf-600" /> {t('dash.byCategory')}</h2>
            {chartData.length ? <div className="mt-4"><BarChart data={chartData} height={130} /></div>
              : <p className="mt-3 text-sm text-slate-500">{t('dash.emptySub')}</p>}
          </div>

          <div className="rounded-2xl border border-leaf-100 bg-gradient-to-br from-leaf-50 to-white p-5">
            <h2 className="section-title"><Icons.sparkles className="h-4 w-4 text-leaf-600" /> {t('dash.quickTips')}</h2>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-slate-700">
              {['dash.tip1', 'dash.tip2', 'dash.tip3'].map((k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-0.5 text-leaf-600">•</span><span>{t(k)}</span>
                </li>
              ))}
            </ul>
            <Link to="/app/assistant" className="btn-soft mt-4 w-full">
              <Icons.chat className="h-4 w-4" /> {t('dash.askAi')}
            </Link>
          </div>

          {items[0] && (
            <div className="card p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Latest</div>
              <div className="mt-1 font-bold text-slate-900">{items[0].title}</div>
              <div className="text-xs text-slate-500">{formatDate(items[0].created_at, lang)}</div>
              {items[0].ai_summary && (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600">{items[0].ai_summary}</p>
              )}
            </div>
          )}
        </aside>
      </div>

      <button
        onClick={() => navigate('/app/records?new=1')}
        className="fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center rounded-2xl bg-leaf-600 text-white shadow-[0_12px_30px_-8px_rgba(22,163,74,.9)] transition active:scale-95 sm:hidden"
        aria-label={t('rec.new')}
      >
        <Icons.plus className="h-6 w-6" />
      </button>
    </div>
  );
}
