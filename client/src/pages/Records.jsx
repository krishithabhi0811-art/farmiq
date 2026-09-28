import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { api } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import {
  ConfirmDialog, EmptyState, ErrorBox, Field, Icons, Modal, Spinner, useToast,
} from '../components/ui.jsx';
import {
  CATEGORIES, CATEGORY_ICONS, CATEGORY_STYLES, STATUSES, STATUS_STYLES, STATUS_DOT,
  cx, fileToCompressedDataUrl, formatDate, pick, timeAgo,
} from '../lib/utils.js';

const EMPTY = {
  title: '', description: '', category: 'crop', status: 'planned', crop_name: '',
  field_name: '', area_acres: '', sowing_date: '', expected_yield_kg: '', photo: null,
};

export default function Records() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [total, setTotal] = useState(0);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // null = create
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fileRef = useRef(null);
  const openedFromQuery = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.listItems({ q, category: cat, limit: 100 });
      setItems(res.items || []);
      setTotal(res.total ?? (res.items || []).length);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, cat]);

  // debounce search
  useEffect(() => {
    const id = setTimeout(load, q || cat ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, q, cat]);

  // deep links: ?new=1 opens the form, ?open=<id> opens that record
  useEffect(() => {
    if (openedFromQuery.current) return;
    const newFlag = params.get('new');
    const openId = params.get('open');
    if (newFlag === '1') {
      openedFromQuery.current = true;
      setEditing(null);
      setForm(EMPTY);
      setEditorOpen(true);
      setParams((p) => { p.delete('new'); return p; }, { replace: true });
    } else if (openId) {
      openedFromQuery.current = true;
      api.getItem(openId)
        .then(({ item }) => openEditor(item))
        .catch(() => toast.error('That record no longer exists.'))
        .finally(() => setParams((p) => { p.delete('open'); return p; }, { replace: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const openEditor = (item) => {
    setEditing(item);
    setFieldErrors({});
    setFormError('');
    setForm(item ? {
      title: item.title || '', description: item.description || '', category: item.category || 'crop',
      status: item.status || 'planned', crop_name: item.crop_name || '', field_name: item.field_name || '',
      area_acres: item.area_acres ?? '', sowing_date: item.sowing_date ? String(item.sowing_date).slice(0, 10) : '',
      expected_yield_kg: item.expected_yield_kg ?? '', photo: item.photo || null,
    } : EMPTY);
    setEditorOpen(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file, 900, 0.7);
      setForm((f) => ({ ...f, photo: dataUrl }));
      toast.info('Photo added — small size keeps saving fast.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError('');
    const errs = {};
    if (!form.title.trim() || form.title.trim().length < 2) errs.title = t('rec.titleF') + ' — ' + t('common.required');
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      status: form.status,
      crop_name: form.crop_name.trim(),
      field_name: form.field_name.trim(),
      area_acres: form.area_acres === '' ? 0 : Number(form.area_acres),
      sowing_date: form.sowing_date || null,
      expected_yield_kg: form.expected_yield_kg === '' ? 0 : Number(form.expected_yield_kg),
      photo: form.photo || null,
    };

    setSaving(true);
    try {
      if (editing) {
        const { item } = await api.updateItem(editing.id, payload);
        setItems((list) => list.map((x) => (x.id === item.id ? item : x)));
        toast.success(t('common.saved'));
      } else {
        const { item } = await api.createItem(payload);
        setItems((list) => [item, ...list]);
        setTotal((n) => n + 1);
        toast.success(t('common.saved'));
      }
      setEditorOpen(false);
      load(); // stay in sync with the database
    } catch (err) {
      if (err.field) setFieldErrors({ [err.field]: err.message });
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    const before = items;
    setItems((list) => list.filter((x) => x.id !== target.id)); // optimistic
    setTotal((n) => Math.max(0, n - 1));
    try {
      await api.deleteItem(target.id);
      toast.success(t('common.deleted'));
    } catch (err) {
      setItems(before);
      setTotal((n) => n + 1);
      toast.error(err.message);
    }
  };

  const summarize = async () => {
    if (!editing) return;
    setSummarizing(true);
    try {
      const { ai_summary } = await api.aiSummarize(editing.id);
      toast.success('AI summary saved to this record ✓');
      setEditing((prev) => ({ ...prev, ai_summary }));
      setItems((list) => list.map((x) => (x.id === editing.id ? { ...x, ai_summary } : x)));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSummarizing(false);
    }
  };

  const counts = useMemo(
    () => CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: items.filter((i) => i.category === c).length }), {}),
    [items],
  );

  return (
    <div>
      <PageHeader
        title={t('rec.title')}
        subtitle={t('rec.subtitle')}
        action={<button onClick={() => openEditor(null)} className="btn-primary"><Icons.plus className="h-4 w-4" /> {t('rec.new')}</button>}
      />

      {/* search + filters */}
      <div className="card p-3.5">
        <div className="relative">
          <Icons.search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" style={{ width: 18, height: 18 }} />
          <input
            className="input pl-11"
            placeholder={`${t('common.search')}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('common.search')}
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 btn-icon border-0 bg-transparent" aria-label="Clear">
              <Icons.close className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setCat('')}
            className={cx('chip shrink-0 border transition', cat === '' ? 'border-leaf-300 bg-leaf-50 text-leaf-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
          >
            {t('rec.all')} {items.length > 0 && cat === '' ? `(${total})` : ''}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(cat === c ? '' : c)}
              className={cx('chip shrink-0 border transition', cat === c ? 'border-leaf-300 bg-leaf-50 text-leaf-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
            >
              <span>{CATEGORY_ICONS[c]}</span> {pick(t, 'cat', c)}{counts[c] ? ` (${counts[c]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}

      {/* list */}
      <div className="mt-4">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-[132px]" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon="🔍"
            title={t('rec.empty')}
            subtitle={t('rec.emptySub')}
            action={<button onClick={() => openEditor(null)} className="btn-primary"><Icons.plus className="h-4 w-4" /> {t('rec.new')}</button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((it) => (
              <article key={it.id} className="card card-hover flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl', CATEGORY_STYLES[it.category] || CATEGORY_STYLES.other)}>
                    {CATEGORY_ICONS[it.category] || '📌'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-[15px] font-bold text-slate-900">{it.title}</h3>
                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => openEditor(it)} className="btn-icon h-9 w-9" title={t('common.edit')} aria-label={t('common.edit')}>
                          <Icons.edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(it)} className="btn-icon h-9 w-9 text-red-500 hover:bg-red-50" title={t('common.delete')} aria-label={t('common.delete')}>
                          <Icons.trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={cx('chip', STATUS_STYLES[it.status] || STATUS_STYLES.planned)}>
                        <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_DOT[it.status] || 'bg-slate-400')} />
                        {pick(t, 'st', it.status)}
                      </span>
                      {it.crop_name && <span className="chip bg-slate-100 text-slate-600">🌿 {it.crop_name}</span>}
                      {Number(it.area_acres) > 0 && <span className="chip bg-slate-100 text-slate-600">{it.area_acres} {t('common.acres')}</span>}
                    </div>
                  </div>
                </div>

                {it.description && <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-slate-600">{it.description}</p>}

                {it.ai_summary && (
                  <div className="mt-3 rounded-xl border border-leaf-100 bg-leaf-50/70 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-leaf-700">
                      <Icons.sparkles className="h-3.5 w-3.5" /> AI summary
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-leaf-900">{it.ai_summary}</p>
                  </div>
                )}

                {it.photo && (
                  <img src={it.photo} alt={it.title} loading="lazy"
                       className="mt-3 h-36 w-full rounded-xl object-cover" />
                )}

                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-400">
                  <Icons.calendar className="h-3.5 w-3.5" />
                  {it.sowing_date ? `${t('rec.sown')}: ${formatDate(it.sowing_date, lang)}` : timeAgo(it.created_at)}
                  {Number(it.expected_yield_kg) > 0 && <span className="ml-auto">{Math.round(it.expected_yield_kg)} kg</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* editor modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? t('rec.edit') : t('rec.new')}
        wide
        footer={
          <div className="flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setEditorOpen(false)}>{t('common.cancel')}</button>
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>
              {saving ? <><Spinner className="h-4 w-4" /> {t('common.saving')}</> : <><Icons.check className="h-4 w-4" /> {t('common.save')}</>}
            </button>
          </div>
        }
      >
        <form onSubmit={save} className="space-y-4" noValidate>
          <ErrorBox>{formError}</ErrorBox>

          <Field label={t('rec.titleF')} required error={fieldErrors.title}>
            <input className="input" value={form.title} onChange={set('title')} placeholder="Paddy — Field A" autoFocus />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('rec.category')}>
              <select className="input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICONS[c]} {pick(t, 'cat', c)}</option>)}
              </select>
            </Field>
            <Field label={t('rec.status')}>
              <select className="input" value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => <option key={s} value={s}>{pick(t, 'st', s)}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('rec.crop')}><input className="input" value={form.crop_name} onChange={set('crop_name')} placeholder="Paddy / Chilli" /></Field>
            <Field label={t('rec.field')}><input className="input" value={form.field_name} onChange={set('field_name')} placeholder="Field A" /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('rec.area')}><input className="input" type="number" min="0" step="0.1" inputMode="decimal" value={form.area_acres} onChange={set('area_acres')} placeholder="2" /></Field>
            <Field label={t('rec.sown')}><input className="input" type="date" value={form.sowing_date} onChange={set('sowing_date')} /></Field>
            <Field label={t('rec.yield')}><input className="input" type="number" min="0" step="1" inputMode="numeric" value={form.expected_yield_kg} onChange={set('expected_yield_kg')} placeholder="4000" /></Field>
          </div>

          <Field label={t('rec.desc')} hint="What did you do? What did you notice?">
            <textarea className="input min-h-[104px] resize-y" value={form.description} onChange={set('description')}
                      placeholder="Transplanted on 20 June, applied first urea split…" />
          </Field>

          <Field label={t('rec.photo')} hint={t('common.optional')}>
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                {photoBusy ? <Spinner className="h-4 w-4" /> : <Icons.camera className="h-4 w-4" />} {t('scan.upload')}
              </button>
              {form.photo && (
                <div className="relative">
                  <img src={form.photo} alt="preview" className="h-16 w-16 rounded-xl object-cover" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, photo: null }))}
                          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-white shadow">
                    <Icons.close className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </Field>

          {editing && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-700">
                  {editing.ai_summary ? 'AI summary' : t('rec.summarize')}
                </div>
                <button type="button" className="btn-soft" onClick={summarize} disabled={summarizing}>
                  {summarizing ? <><Spinner className="h-4 w-4" /> {t('rec.summarizing')}</> : <><Icons.sparkles className="h-4 w-4" /> {editing.ai_summary ? 'Re-run' : t('rec.summarize')}</>}
                </button>
              </div>
              {editing.ai_summary && (
                <p className="ai-text mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-[13px]">{editing.ai_summary}</p>
              )}
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('common.delete')}
        body={`${t('common.deleteConfirm')}${deleteTarget ? `\n\n“${deleteTarget.title}”` : ''}`}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
