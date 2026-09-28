import { useEffect, useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { api } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import {
  ConfirmDialog, EmptyState, ErrorBox, Field, Icons, InfoBox, ProgressRing, Spinner, useToast,
} from '../components/ui.jsx';
import { cx, formatDate, gradeColor } from '../lib/utils.js';

const EXAMPLE = { crop: 'paddy', area_acres: 2, ph: 7.4, organic_carbon: 0.42, nitrogen_n: 240, phosphorus_p: 14, potassium_k: 130, ec: 0.3 };
const BLANK = { crop: 'paddy', area_acres: 1, ph: 7, organic_carbon: 0.5, nitrogen_n: '', phosphorus_p: '', potassium_k: '', ec: '' };

const levelTone = (level) => ({
  low: 'bg-red-100 text-red-700',
  medium: 'bg-sun-100 text-amber-700',
  high: 'bg-leaf-100 text-leaf-700',
  unknown: 'bg-slate-100 text-slate-500',
}[level] || 'bg-slate-100 text-slate-500');

export default function Soil() {
  const { t, lang } = useI18n();
  const toast = useToast();

  const [crops, setCrops] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [planBusy, setPlanBusy] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.soilCrops().then((d) => setCrops(d.crops || [])).catch(() => {});
    loadHistory();
  }, []);

  const loadHistory = () =>
    api.soilTests().then((d) => setHistory(d.tests || [])).catch(() => {});

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { report: r } = await api.soilFertility({
        crop: form.crop,
        area_acres: Number(form.area_acres) || 1,
        ph: Number(form.ph),
        organic_carbon: Number(form.organic_carbon) || 0,
        nitrogen_n: form.nitrogen_n === '' ? null : Number(form.nitrogen_n),
        phosphorus_p: form.phosphorus_p === '' ? null : Number(form.phosphorus_p),
        potassium_k: form.potassium_k === '' ? null : Number(form.potassium_k),
        ec: form.ec === '' ? 0 : Number(form.ec),
      });
      setReport(r);
      setTimeout(() => document.getElementById('soil-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTest = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await api.saveSoilTest({ ...form, area_acres: Number(form.area_acres) || 1, report });
      toast.success(t('soil.saved'));
      loadHistory();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const aiPlan = async (test) => {
    setPlanBusy(test.id);
    try {
      const { plan } = await api.soilPlan(test.id);
      setHistory((h) => h.map((x) => (x.id === test.id ? { ...x, ai_plan: plan } : x)));
      toast.success('AI plan added ✓');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPlanBusy(null);
    }
  };

  const doDelete = async () => {
    const target = confirmDel;
    setConfirmDel(null);
    if (!target) return;
    const before = history;
    setHistory((h) => h.filter((x) => x.id !== target.id));
    try {
      await api.deleteSoilTest(target.id);
      toast.success(t('common.deleted'));
    } catch (e) {
      setHistory(before);
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title={t('soil.title')} subtitle={t('soil.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* input form */}
        <form onSubmit={submit} className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="section-title"><Icons.flask className="h-4 w-4 text-leaf-600" /> {t('soil.crop')}</h2>
            <button type="button" className="text-xs font-bold text-leaf-700 hover:underline" onClick={() => setForm(EXAMPLE)}>
              {t('soil.example')}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <ErrorBox>{error}</ErrorBox>

            <Field label={t('soil.crop')}>
              <select className="input" value={form.crop} onChange={set('crop')}>
                {crops.length === 0 && <option value="paddy">Paddy / Rice</option>}
                {crops.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('rec.area')}>
                <input className="input" type="number" min="0.1" step="0.1" inputMode="decimal" value={form.area_acres} onChange={set('area_acres')} />
              </Field>
              <Field label={t('soil.ph')} hint="6.0 – 7.5 is good">
                <input className="input" type="number" min="3" max="11" step="0.1" inputMode="decimal" value={form.ph} onChange={set('ph')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t('soil.oc')}><input className="input" type="number" min="0" max="5" step="0.01" inputMode="decimal" value={form.organic_carbon} onChange={set('organic_carbon')} /></Field>
              <Field label={t('soil.ec')}><input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={form.ec} onChange={set('ec')} placeholder="0.3" /></Field>
            </div>

            <Field label={t('soil.n')}><input className="input" type="number" min="0" inputMode="numeric" value={form.nitrogen_n} onChange={set('nitrogen_n')} placeholder="240" /></Field>
            <Field label={t('soil.p')}><input className="input" type="number" min="0" inputMode="numeric" value={form.phosphorus_p} onChange={set('phosphorus_p')} placeholder="14" /></Field>
            <Field label={t('soil.k')}><input className="input" type="number" min="0" inputMode="numeric" value={form.potassium_k} onChange={set('potassium_k')} placeholder="130" /></Field>

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? <><Spinner className="h-4 w-4" /> {t('common.loading')}</> : <><Icons.sprout className="h-4 w-4" /> {t('soil.calculate')}</>}
            </button>
            <p className="text-[11px] leading-relaxed text-slate-400">{t('soil.noTest')}</p>
          </div>
        </form>

        {/* result */}
        <div id="soil-result" className="space-y-4 lg:col-span-3">
          {!report ? (
            <EmptyState icon="🪱" title={t('soil.title')} subtitle={t('soil.noTest')} />
          ) : (
            <>
              <div className="glass-card p-5">
                <div className="flex flex-wrap items-center gap-5">
                  <ProgressRing value={report.fertility_score} color={gradeColor(report.fertility_score)} />
                  <div className="min-w-[180px] flex-1">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('soil.grade')}</div>
                    <div className="text-2xl font-extrabold" style={{ color: gradeColor(report.fertility_score) }}>{report.grade}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {report.crop_label} · {report.area_acres} {t('common.acres')} · pH {report.ph} ({report.ph_level})
                    </div>
                  </div>
                  <button className="btn-soft" onClick={saveTest} disabled={saving}>
                    {saving ? <Spinner className="h-4 w-4" /> : <Icons.check className="h-4 w-4" />} {t('soil.save')}
                  </button>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {Object.entries(report.nutrients).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
                      <span className="text-[13px] font-semibold text-slate-600">{v.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-slate-800">
                          {v.value === null ? '—' : v.value} <span className="text-[11px] font-medium text-slate-400">{v.unit}</span>
                        </span>
                        <span className={cx('chip capitalize', levelTone(v.level))}>{v.level}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4"><InfoBox tone="slate">{report.ph_advice}</InfoBox></div>
              </div>

              <div className="card p-5">
                <h2 className="section-title"><Icons.flask className="h-4 w-4 text-leaf-600" /> {t('soil.plan')}</h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    [t('soil.urea'), report.fertiliser.urea_kg, 'bg-leaf-50 text-leaf-700 border-leaf-100'],
                    [t('soil.dap'), report.fertiliser.dap_kg, 'bg-sky-50 text-sky-700 border-sky-100'],
                    [t('soil.mop'), report.fertiliser.mop_kg, 'bg-sun-50 text-amber-700 border-sun-100'],
                  ].map(([label, val, cls]) => (
                    <div key={label} className={cx('rounded-2xl border p-3.5 text-center', cls)}>
                      <div className="text-2xl font-extrabold">{val}</div>
                      <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">kg</div>
                      <div className="mt-1 text-[12px] font-semibold">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="text-sm font-bold text-slate-700">{t('soil.actions')}</div>
                  <ul className="mt-2.5 space-y-2">
                    {report.actions.map((a, i) => (
                      <li key={i} className="flex gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700">
                        <Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />{a}
                      </li>
                    ))}
                  </ul>
                </div>

                {report.warnings?.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-sun-100 bg-sun-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                      <Icons.alert className="h-4 w-4" /> {t('soil.warnings')}
                    </div>
                    <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-amber-900">
                      {report.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                    </ul>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-leaf-100 bg-leaf-50/60 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-leaf-800">
                    <Icons.leaf className="h-4 w-4" /> {t('soil.organic')}
                  </div>
                  <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-leaf-900">
                    {report.organic_first.map((o, i) => <li key={i}>• {o}</li>)}
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* history */}
          <div className="card p-5">
            <h2 className="section-title"><Icons.calendar className="h-4 w-4 text-leaf-600" /> {t('soil.history')}</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{t('soil.noHistory')}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-800">
                          {h.report?.crop_label || h.crop} · {h.area_acres} {t('common.acres')}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {formatDate(h.created_at, lang)} · pH {h.ph} · N {h.nitrogen_n} · P {h.phosphorus_p} · K {h.potassium_k}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {h.report?.fertility_score != null && (
                          <span className="chip bg-slate-100 text-slate-700">{h.report.fertility_score}/100</span>
                        )}
                        <button className="btn-soft h-9 px-3 text-xs" onClick={() => aiPlan(h)} disabled={planBusy === h.id}>
                          {planBusy === h.id ? <Spinner className="h-3.5 w-3.5" /> : <Icons.sparkles className="h-3.5 w-3.5" />} {t('soil.aiPlan')}
                        </button>
                        <button className="btn-icon h-9 w-9 text-red-500 hover:bg-red-50" onClick={() => setConfirmDel(h)} aria-label={t('common.delete')}>
                          <Icons.trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {h.ai_plan && (
                      <p className="ai-text mt-3 whitespace-pre-wrap rounded-xl border border-leaf-100 bg-leaf-50/60 p-3 text-[13px]">{h.ai_plan}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDel)}
        title={t('common.delete')}
        body={t('common.deleteConfirm')}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setConfirmDel(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}
