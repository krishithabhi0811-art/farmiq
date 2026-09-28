import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Icons, Logo, Spinner, useToast } from '../components/ui.jsx';

export default function Signup() {
  const { signup } = useAuth();
  const { t, lang, setLang, languages } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ full_name: '', email: '', password: '', district: '', land_size_acres: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState({});

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldError({});

    // friendly client-side checks first
    const errs = {};
    if (form.full_name.trim().length < 2) errs.full_name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) errs.email = 'Please enter a valid email.';
    if (form.password.length < 6) errs.password = 'Password must be at least 6 characters.';
    if (Object.keys(errs).length) return setFieldError(errs);

    setBusy(true);
    try {
      await signup({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        district: form.district.trim(),
        land_size_acres: form.land_size_acres === '' ? null : Number(form.land_size_acres),
        language: lang,
      });
      toast.success('Welcome to FARM-IQ! 🌱');
      navigate('/app', { replace: true });
    } catch (err) {
      if (err.field) setFieldError({ [err.field]: err.message });
      else setError(err.message || t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* left brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-leaf-600 via-leaf-700 to-leaf-900 p-10 text-white lg:flex">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative"><Logo size={44} text="FARM-IQ" sub={t('app.tagline')} /></div>
        <div className="relative max-w-sm">
          <h2 className="text-3xl font-extrabold leading-tight text-balance">{t('auth.createSub')}</h2>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              ['🆓', 'Free forever for small farmers'],
              ['📱', 'Works on any phone, no app store'],
              ['🔒', 'Your records stay private to you'],
              ['🗣️', 'English · हिन्दी · తెలుగు'],
            ].map(([e, s]) => (
              <li key={s} className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 backdrop-blur">
                <span className="text-lg">{e}</span>{s}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-leaf-100/80">{t('auth.trustBody')}</p>
      </div>

      {/* right form */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-6 flex justify-center lg:hidden"><Logo size={44} sub={t('app.tagline')} /></div>

          <div className="glass-card p-6 sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('auth.createTitle')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('auth.createSub')}</p>

            <div className="mt-5">
              <span className="label">{t('common.language')}</span>
              <div className="flex gap-2">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                      lang === l.code ? 'border-leaf-400 bg-leaf-50 text-leaf-700 ring-4 ring-leaf-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
              <ErrorBox>{error}</ErrorBox>

              <Field label={t('auth.name')} required error={fieldError.full_name}>
                <input className="input input-lg" value={form.full_name} onChange={set('full_name')}
                       placeholder="Ravi Kumar" autoComplete="name" required />
              </Field>

              <Field label={t('auth.email')} required error={fieldError.email}>
                <input className="input input-lg" type="email" inputMode="email" value={form.email} onChange={set('email')}
                       placeholder="farmer@example.com" autoComplete="email" required />
              </Field>

              <Field label={t('auth.password')} required error={fieldError.password} hint="At least 6 characters — stored only as a bcrypt hash.">
                <div className="relative">
                  <input className="input input-lg pr-24" type={show ? 'text' : 'password'} value={form.password}
                         onChange={set('password')} placeholder="••••••••" autoComplete="new-password" required />
                  <button type="button" onClick={() => setShow((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('auth.district')}>
                  <input className="input" value={form.district} onChange={set('district')} placeholder="Krishna, AP" />
                </Field>
                <Field label={t('auth.land')}>
                  <input className="input" type="number" step="0.1" min="0" inputMode="decimal"
                         value={form.land_size_acres} onChange={set('land_size_acres')} placeholder="4.5" />
                </Field>
              </div>

              <button className="btn-primary w-full text-[15px]" disabled={busy}>
                {busy ? <><Spinner className="h-4 w-4" /> {t('common.loading')}</> : <>{t('auth.signup')} <Icons.arrowLeft className="h-4 w-4 rotate-180" /></>}
              </button>
            </form>

            <Link to="/login" className="btn-ghost mt-4 w-full">{t('auth.haveAccount')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
