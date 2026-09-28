import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { api } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import { ErrorBox, Field, Icons, InfoBox, Spinner, useToast } from '../components/ui.jsx';
import { cx, formatDate } from '../lib/utils.js';

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const { t, lang, setLang, languages } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ full_name: '', district: '', land_size_acres: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        district: user.district || '',
        land_size_acres: user.land_size_acres ?? '',
      });
    }
  }, [user]);

  useEffect(() => {
    api.itemStats().then(setStats).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updateProfile({
        full_name: form.full_name.trim(),
        district: form.district.trim(),
        land_size_acres: form.land_size_acres === '' ? 0 : Number(form.land_size_acres),
      });
      toast.success(t('profile.saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pw.new_password.length < 6) return setPwError('New password must be at least 6 characters.');
    setPwBusy(true);
    try {
      await api.updateMe({ current_password: pw.current_password, new_password: pw.new_password });
      setPw({ current_password: '', new_password: '' });
      toast.success('Password updated ✓');
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const initials = (user?.full_name || user?.email || 'F').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* identity card */}
        <div className="glass-card p-6 lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <span className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-leaf-500 to-leaf-700 text-2xl font-extrabold text-white shadow-[0_12px_30px_-10px_rgba(22,163,74,.9)]">
              {initials}
            </span>
            <h2 className="mt-3 text-lg font-extrabold text-slate-900">{user?.full_name || 'Farmer'}</h2>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {user?.district && <span className="chip bg-slate-100 text-slate-600">📍 {user.district}</span>}
              {Number(user?.land_size_acres) > 0 && <span className="chip bg-leaf-50 text-leaf-700">🌾 {user.land_size_acres} {t('common.acres')}</span>}
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('profile.joined')}</dt>
              <dd className="font-semibold text-slate-800">{formatDate(user?.created_at, lang)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('dash.total')}</dt>
              <dd className="font-semibold text-slate-800">{stats?.total ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('dash.area')}</dt>
              <dd className="font-semibold text-slate-800">
                {stats ? `${Number(stats.area_acres).toFixed(1)} ${t('common.acres')}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('dash.atRisk')}</dt>
              <dd className="font-semibold text-slate-800">{stats?.at_risk ?? '—'}</dd>
            </div>
          </dl>

          <button
            className="btn-danger mt-6 w-full"
            onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
          >
            <Icons.logout className="h-4 w-4" /> {t('common.logout')}
          </button>
        </div>

        {/* settings */}
        <div className="space-y-4 lg:col-span-2">
          <form onSubmit={save} className="card p-5">
            <h2 className="section-title"><Icons.user className="h-4 w-4 text-leaf-600" /> {t('profile.account')}</h2>
            <div className="mt-4 space-y-4">
              <ErrorBox>{error}</ErrorBox>
              <Field label={t('auth.name')} required>
                <input className="input" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('auth.district')}>
                  <input className="input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} placeholder="Krishna, AP" />
                </Field>
                <Field label={t('auth.land')}>
                  <input className="input" type="number" min="0" step="0.1" inputMode="decimal"
                         value={form.land_size_acres} onChange={(e) => setForm((f) => ({ ...f, land_size_acres: e.target.value }))} />
                </Field>
              </div>

              <div>
                <span className="label">{t('common.language')}</span>
                <div className="flex gap-2">
                  {languages.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => { setLang(l.code); updateProfile({ language: l.code }).catch(() => {}); }}
                      className={cx(
                        'flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition',
                        lang === l.code ? 'border-leaf-400 bg-leaf-50 text-leaf-700 ring-4 ring-leaf-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {l.native}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn-primary w-full sm:w-auto" disabled={saving}>
                {saving ? <><Spinner className="h-4 w-4" /> {t('common.saving')}</> : <><Icons.check className="h-4 w-4" /> {t('common.save')}</>}
              </button>
            </div>
          </form>

          <form onSubmit={changePassword} className="card p-5">
            <h2 className="section-title"><Icons.shield className="h-4 w-4 text-leaf-600" /> {t('profile.changePw')}</h2>
            <div className="mt-4 space-y-4">
              <ErrorBox>{pwError}</ErrorBox>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('profile.current')} required>
                  <input className="input" type="password" autoComplete="current-password" value={pw.current_password}
                         onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} />
                </Field>
                <Field label={t('profile.new')} required hint="At least 6 characters">
                  <input className="input" type="password" autoComplete="new-password" value={pw.new_password}
                         onChange={(e) => setPw((p) => ({ ...p, new_password: e.target.value }))} />
                </Field>
              </div>
              <button className="btn-ghost w-full sm:w-auto" disabled={pwBusy}>
                {pwBusy ? <><Spinner className="h-4 w-4" /> {t('common.saving')}</> : <><Icons.shield className="h-4 w-4" /> {t('profile.updatePw')}</>}
              </button>
            </div>
          </form>

          <InfoBox tone="leaf">
            <div className="flex items-start gap-2">
              <Icons.shield className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('profile.dataNote')}</span>
            </div>
          </InfoBox>
        </div>
      </div>
    </div>
  );
}
