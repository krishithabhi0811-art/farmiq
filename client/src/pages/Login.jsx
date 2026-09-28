import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Field, Icons, Logo, Spinner, useToast } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/app';

  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(form.email.trim(), form.password);
      toast.success(`${t('auth.welcome')} ${user.full_name || ''}`.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || t('common.tryAgain'));
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
        <div className="relative">
          <Logo size={44} text="FARM-IQ" sub={t('app.tagline')} />
        </div>
        <div className="relative max-w-sm">
          <h2 className="text-3xl font-extrabold leading-tight text-balance">
            {t('auth.welcome')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-leaf-100">{t('auth.welcomeSub')}</p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              ['🪱', 'Soil fertility score & fertiliser plan'],
              ['📷', 'Photo crop scan for pests'],
              ['🌾', 'All your farm records in one place'],
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
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('auth.welcome')}</h1>
            <p className="mt-1 text-sm text-slate-500">{t('auth.welcomeSub')}</p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <ErrorBox>{error}</ErrorBox>

              <Field label={t('auth.email')} required>
                <input
                  className="input input-lg"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="farmer@example.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </Field>

              <Field label={t('auth.password')} required>
                <div className="relative">
                  <input
                    className="input input-lg pr-24"
                    type={show ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </Field>

              <button className="btn-primary w-full text-[15px]" disabled={busy}>
                {busy ? <><Spinner className="h-4 w-4" /> {t('common.loading')}</> : <>{t('auth.login')} <Icons.arrowLeft className="h-4 w-4 rotate-180" /></>}
              </button>
            </form>

            <div className="mt-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
            </div>

            <Link to="/signup" className="btn-ghost mt-5 w-full">{t('auth.noAccount')}</Link>

            <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
              <Icons.shield className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
              {t('auth.trustBody')}
            </p>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            <Link to="/" className="font-semibold text-slate-500 hover:text-leaf-700">← {t('common.back')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
