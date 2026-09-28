import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { Icons, Logo } from '../components/ui.jsx';

const FEATURES = [
  { icon: Icons.chat, title: 'Ask AI in your language', body: 'Get simple answers about crops, pests, water and market — English, हिन्दी or తెలుగు.', tone: 'bg-leaf-50 text-leaf-700' },
  { icon: Icons.flask, title: 'Soil fertility score', body: 'Enter your soil test values and get an exact urea / DAP / potash plan per acre.', tone: 'bg-soil-100 text-soil-700' },
  { icon: Icons.camera, title: 'Photo crop scan', body: 'Snap a leaf. Find out what is wrong and what to do in the next 48 hours.', tone: 'bg-sky-50 text-sky-600' },
  { icon: Icons.sprout, title: 'Your farm records', body: 'Crops, soil, irrigation and expenses saved safely — open on any phone.', tone: 'bg-violet-50 text-violet-600' },
];

export default function Landing() {
  const { t, lang, setLang, languages } = useI18n();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo sub={t('app.tagline')} />
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-xl bg-slate-100/80 p-1 sm:flex">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    lang === l.code ? 'bg-white text-leaf-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {l.native}
                </button>
              ))}
            </div>
            <Link to="/login" className="btn-ghost">{t('auth.login')}</Link>
            <Link to="/signup" className="btn-primary hidden sm:inline-flex">{t('auth.signup')}</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* hero */}
        <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2">
          <div className="animate-fade-up">
            <span className="chip border border-leaf-100 bg-leaf-50 text-leaf-700">
              🌾 {t('app.tagline')}
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
              Farm smarter with <span className="bg-gradient-to-r from-leaf-600 to-sky-500 bg-clip-text text-transparent">FARM-IQ</span>
            </h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-slate-600">
              Track every crop, check your soil fertility, scan plant photos and get AI advice in
              simple words — on any phone, in your own language.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/signup" className="btn-primary px-6 text-[15px]">
                {t('auth.signup')} <Icons.arrowLeft className="h-4 w-4 rotate-180" />
              </Link>
              <Link to="/login" className="btn-ghost px-6 text-[15px]">{t('auth.login')}</Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5"><Icons.shield className="h-4 w-4 text-leaf-600" /> bcrypt-protected logins</span>
              <span className="flex items-center gap-1.5"><Icons.cloud className="h-4 w-4 text-leaf-600" /> Syncs across devices</span>
              <span className="flex items-center gap-1.5"><Icons.globe className="h-4 w-4 text-leaf-600" /> 3 languages</span>
            </div>
          </div>

          {/* hero visual — pure SVG/CSS, no external images */}
          <div className="relative animate-fade-up">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">Soil health — Field A</div>
                <span className="chip bg-leaf-100 text-leaf-700">Good · 78/100</span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ['Nitrogen (N)', 42, 'bg-leaf-500'],
                  ['Phosphorus (P)', 66, 'bg-sky-500'],
                  ['Potassium (K)', 81, 'bg-sun-500'],
                  ['Organic carbon', 55, 'bg-soil-400'],
                ].map(([label, val, color]) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs font-semibold text-slate-600">
                      <span>{label}</span><span>{val}%</span>
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-leaf-100 bg-leaf-50/70 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-leaf-800">
                  <Icons.sparkles className="h-4 w-4" /> AI plan
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-leaf-900">
                  Add 21 kg urea in 3 splits, DAP 26 kg at sowing and MOP 20 kg at flowering.
                  Mix 2 t compost per acre to raise carbon.
                </p>
              </div>
            </div>
            <div className="absolute -right-2 -top-4 hidden animate-float rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-lift backdrop-blur sm:block">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-50 text-sky-600"><Icons.camera /></span>
                <div className="text-xs">
                  <div className="font-bold text-slate-800">Leaf scan</div>
                  <div className="text-slate-500">Stem borer · act now</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 left-2 hidden animate-float rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-lift backdrop-blur sm:block" style={{ animationDelay: '1.2s' }}>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-leaf-50 text-leaf-600"><Icons.chat /></span>
                <div className="text-xs">
                  <div className="font-bold text-slate-800">నేల ఎరువులు</div>
                  <div className="text-slate-500">AI in తెలుగు</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="grid gap-4 pb-14 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-5">
              <span className={`grid h-11 w-11 place-items-center rounded-2xl ${f.tone}`}>
                <f.icon />
              </span>
              <h3 className="mt-3.5 text-[15px] font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mb-16 overflow-hidden rounded-3xl border border-leaf-100 bg-gradient-to-br from-leaf-50 via-white to-sky-50 p-8 text-center">
          <h2 className="text-2xl font-extrabold text-slate-900">Start free today</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            No paperwork. Just your name and email — your farm records stay private and safe.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/signup" className="btn-primary px-6">{t('auth.signup')}</Link>
            <Link to="/login" className="btn-ghost px-6">{t('auth.login')}</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/70 bg-white/60 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} FARM-IQ · Made for farmers 🌱</span>
          <span>Advice is a guide — always confirm with your local agriculture officer.</span>
        </div>
      </footer>
    </div>
  );
}
