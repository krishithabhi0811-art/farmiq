/**
 * scan/CamerasPanel.jsx — FIELD CAMERAS
 * A camera lives in the field and sends photos on its own; the farmer opens
 * them here, plays them as a timelapse, and can ask the AI what it sees.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n.jsx';
import { api, cameraDevice, API_BASE } from '../../lib/api.js';
import {
  ConfirmDialog, EmptyState, ErrorBox, Field, Icons, InfoBox, Modal, Spinner, useToast,
} from '../../components/ui.jsx';
import { cx, timeAgo, formatDate } from '../../lib/utils.js';

const INTERVALS = [
  { v: 5, label: '5 min' }, { v: 15, label: '15 min' }, { v: 30, label: '30 min' },
  { v: 60, label: '1 hour' }, { v: 180, label: '3 hours' }, { v: 360, label: '6 hours' },
  { v: 720, label: '12 hours' },
];

const isOffline = (camera) => {
  if (!camera.last_seen_at) return true;
  const gap = Date.now() - new Date(camera.last_seen_at).getTime();
  return gap > Math.max(camera.capture_interval_minutes || 60, 30) * 2.5 * 60 * 1000;
};

function CopyButton({ text, label }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost h-9 shrink-0 px-3 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
          setDone(true); setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? <Icons.check className="h-3.5 w-3.5" /> : null}
      {done ? t('cam.copied') : (label || t('cam.copy'))}
    </button>
  );
}

/* ────────── small helper: loads the newest photo for a card ────────── */
function LatestThumb({ cameraId, refreshKey }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    api.cameraPhotos(cameraId, { limit: 1 })
      .then((d) => { if (alive) setSrc(d.photos?.[0]?.image || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [cameraId, refreshKey]);

  if (!src) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-100 text-2xl text-slate-300">
        <Icons.camera className="h-7 w-7" />
      </div>
    );
  }
  return <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />;
}

/* ────────── connect instructions shown after creating a camera ────────── */
function ConnectHelp({ camera, onTest, testing, testResult, onStartMode }) {
  const { t } = useI18n();
  const [showKey, setShowKey] = useState(false);
  const [open, setOpen] = useState('phone');
  const uploadUrl = `${API_BASE || window.location.origin}/api/cameras/${camera.id}/upload`;

  const options = [
    { id: 'phone', title: t('cam.connectPhone'), body: t('cam.connectPhoneBody') },
    { id: 'esp', title: t('cam.connectEsp'), body: t('cam.connectEspBody') },
    { id: 'pi', title: t('cam.connectPi'), body: t('cam.connectPiBody') },
    { id: 'curl', title: t('cam.connectCurl'), body: t('cam.connectCurlBody') },
  ];

  return (
    <div className="space-y-4">
      <InfoBox tone="leaf">{t('cam.connectHint')}</InfoBox>

      <div className="space-y-3">
        <Field label={t('cam.deviceKey')} hint={t('cam.keyNote')}>
          <div className="flex items-center gap-2">
            <input
              className="input font-mono text-[12px]"
              readOnly
              type={showKey ? 'text' : 'password'}
              value={camera.device_key}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="btn-icon h-11 w-11" onClick={() => setShowKey((s) => !s)}
                    aria-label={showKey ? t('cam.hideKey') : t('cam.showKey')}>
              {showKey ? <Icons.close className="h-4 w-4" /> : <Icons.shield className="h-4 w-4" />}
            </button>
            <CopyButton text={camera.device_key} />
          </div>
        </Field>

        <Field label={t('cam.uploadUrl')}>
          <div className="flex items-center gap-2">
            <input className="input font-mono text-[11px]" readOnly value={uploadUrl} onFocus={(e) => e.target.select()} />
            <CopyButton text={uploadUrl} />
          </div>
        </Field>
        <p className="text-xs text-slate-500">
          <span className="font-semibold">camera id:</span>{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">{camera.id}</code>
          <CopyButton text={camera.id} label="id" />
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-soft" onClick={onTest} disabled={testing}>
          {testing ? <Spinner className="h-4 w-4" /> : <Icons.refresh className="h-4 w-4" />} {t('cam.testConnection')}
        </button>
        <button className="btn-primary" onClick={onStartMode}>
          <Icons.camera className="h-4 w-4" /> {t('cam.startMode')}
        </button>
      </div>
      {testResult && (
        <InfoBox tone={testResult.ok ? 'leaf' : 'sun'}>
          {testResult.ok ? `✅ ${t('cam.connected')}` : `⚠️ ${testResult.message}`}
        </InfoBox>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-800">{t('cam.connectTitle')}</h3>
        <div className="mt-2 space-y-2">
          {options.map((o) => (
            <div key={o.id} className="overflow-hidden rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setOpen(open === o.id ? '' : o.id)}
                className="flex w-full items-center justify-between gap-2 bg-white px-3.5 py-3 text-left text-[13px] font-bold text-slate-700 hover:bg-slate-50"
              >
                {o.title}
                <Icons.plus className={cx('h-4 w-4 shrink-0 transition', open === o.id && 'rotate-45')} />
              </button>
              {open === o.id && <p className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">{o.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────── photo lightbox with timelapse + AI reading ────────── */
function Lightbox({ camera, photos, index, onIndex, onDelete, onAnalyse, onClose }) {
  const { t, lang } = useI18n();
  const [playing, setPlaying] = useState(false);
  const busy = useRef(false);

  const photo = photos[index];

  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const id = setInterval(() => {
      // newest → oldest while playing, so it reads like a growing crop
      onIndex((i) => (i + 1) % photos.length);
    }, 700);
    return () => clearInterval(id);
  }, [playing, photos.length, onIndex]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-900/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{camera.name}</div>
          <div className="text-xs text-white/60">
            {formatDate(photo.captured_at, lang)} · {timeAgo(photo.captured_at)}
            {photos.length > 1 && ` · ${index + 1}/${photos.length}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {photos.length > 1 && (
            <button onClick={() => setPlaying((p) => !p)}
                    className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">
              {playing ? `⏸ ${t('cam.pause')}` : `▶ ${t('cam.timelapse')}`}
            </button>
          )}
          <button onClick={onClose} className="rounded-xl bg-white/10 p-2 hover:bg-white/20" aria-label={t('common.close')}>
            <Icons.close className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden px-2 pb-2">
        <img src={photo.image} alt="" className="h-full w-full rounded-2xl object-contain" />

        {photos.length > 1 && (
          <>
            <button onClick={() => onIndex((i) => (i + 1) % photos.length)}
                    className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
              <Icons.arrowLeft className="h-5 w-5" />
            </button>
            <button onClick={() => onIndex((i) => (i - 1 + photos.length) % photos.length)}
                    className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
              <Icons.arrowLeft className="h-5 w-5 rotate-180" />
            </button>
          </>
        )}
      </div>

      <div className="max-h-[42vh] overflow-y-auto border-t border-white/10 bg-white/5 p-4 text-white">
        {photo.ai_note ? (
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-leaf-200">
              <Icons.sparkles className="h-4 w-4" /> {t('cam.aiReading')}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-white/90">{photo.ai_note}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-white/15 text-white hover:bg-white/25"
              disabled={busy.current}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                await onAnalyse(photo);
                busy.current = false;
              }}
            >
              <Icons.sparkles className="h-4 w-4" /> {t('cam.analyse')}
            </button>
          </div>
        )}

        {photo.note && <p className="mt-3 text-xs text-white/60">📝 {photo.note}</p>}
        {photo.battery && <p className="mt-1 text-xs text-white/60">🔋 {photo.battery}</p>}

        <button className="btn mt-4 bg-red-500/20 text-red-100 hover:bg-red-500/30" onClick={() => onDelete(photo)}>
          <Icons.trash className="h-4 w-4" /> {t('cam.deletePhoto')}
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────── the panel ────────────────────────── */
export default function CamerasPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', field_name: '', location_note: '', capture_interval_minutes: 60, auto_analyse: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [createdCamera, setCreatedCamera] = useState(null); // show connect help after create
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [gallery, setGallery] = useState(null);   // { camera, photos, total, limit, offset }
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [lightbox, setLightbox] = useState(-1);

  const load = useCallback(async () => {
    try {
      setError('');
      const d = await api.listCameras();
      setCameras(d.cameras || []);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // keep the field view fresh while this page is open
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const openEditor = (camera) => {
    setEditing(camera || null);
    setCreatedCamera(null);
    setTestResult(null);
    setFormError('');
    setForm(camera ? {
      name: camera.name || '',
      field_name: camera.field_name || '',
      location_note: camera.location_note || '',
      capture_interval_minutes: camera.capture_interval_minutes || 60,
      auto_analyse: Boolean(camera.auto_analyse),
    } : { name: '', field_name: '', location_note: '', capture_interval_minutes: 60, auto_analyse: false });
    setEditorOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault();
    setFormError('');
    if (form.name.trim().length < 2) return setFormError(t('cam.name') + ' — ' + t('common.required'));
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), capture_interval_minutes: Number(form.capture_interval_minutes) };
      if (editing) {
        const { camera } = await api.updateCamera(editing.id, payload);
        setCameras((list) => list.map((c) => (c.id === camera.id ? { ...c, ...camera } : c)));
        toast.success(t('common.saved'));
        setEditorOpen(false);
      } else {
        const { camera } = await api.createCamera(payload);
        setCreatedCamera(camera);
        load();
        toast.success('Camera added ✓');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rotateKey = async (camera) => {
    try {
      const { camera: updated } = await api.updateCamera(camera.id, { rotate_key: true });
      setCreatedCamera(updated);
      setCameras((list) => list.map((c) => (c.id === camera.id ? { ...c, ...updated } : c)));
      toast.success('New camera key created — update the device.');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doDelete = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    const before = cameras;
    setCameras((list) => list.filter((c) => c.id !== target.id));
    try {
      await api.deleteCamera(target.id);
      toast.success(t('common.deleted'));
    } catch (e) {
      setCameras(before);
      toast.error(e.message);
    }
  };

  const testConnection = async (camera) => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await cameraDevice.ping(camera.id, camera.device_key);
      setTestResult({ ok: true, ...r });
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  const openGallery = async (camera) => {
    setGalleryBusy(true);
    try {
      const d = await api.cameraPhotos(camera.id, { limit: 24, offset: 0 });
      setGallery({ camera: d.camera || camera, photos: d.photos || [], total: d.total || 0, offset: 0 });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGalleryBusy(false);
    }
  };

  const loadMore = async () => {
    if (!gallery) return;
    setGalleryBusy(true);
    try {
      const d = await api.cameraPhotos(gallery.camera.id, { limit: 24, offset: gallery.photos.length });
      setGallery((g) => ({ ...g, photos: [...g.photos, ...(d.photos || [])], total: d.total || g.total }));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGalleryBusy(false);
    }
  };

  const analysePhoto = async (photo) => {
    try {
      const { ai_note } = await api.analyseCameraPhoto(gallery.camera.id, photo.id);
      setGallery((g) => ({ ...g, photos: g.photos.map((p) => (p.id === photo.id ? { ...p, ai_note } : p)) }));
      toast.success('AI reading saved ✓');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removePhoto = async (photo) => {
    try {
      await api.deleteCameraPhoto(gallery.camera.id, photo.id);
      setGallery((g) => {
        const photos = g.photos.filter((p) => p.id !== photo.id);
        return { ...g, photos, total: Math.max(0, g.total - 1) };
      });
      setLightbox(-1);
      toast.success(t('common.deleted'));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const offlineCount = useMemo(() => cameras.filter(isOffline).length, [cameras]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">{t('cam.title')}</h2>
          <p className="text-sm text-slate-500">{t('cam.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={load} title={t('common.loading')}>
            <Icons.refresh className="h-4 w-4" />
          </button>
          <button className="btn-primary" onClick={() => openEditor(null)}>
            <Icons.plus className="h-4 w-4" /> {t('cam.add')}
          </button>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}
      {offlineCount > 0 && cameras.length > 0 && (
        <div className="mb-4">
          <InfoBox tone="sun">
            {offlineCount} · {t('cam.offline')} — check the camera power and internet.
          </InfoBox>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-[210px]" />)}</div>
      ) : cameras.length === 0 ? (
        <EmptyState
          icon="📷"
          title={t('cam.noCameras')}
          subtitle={t('cam.noCamerasSub')}
          action={<button className="btn-primary" onClick={() => openEditor(null)}><Icons.plus className="h-4 w-4" /> {t('cam.add')}</button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameras.map((c) => {
            const offline = isOffline(c);
            return (
              <article key={c.id} className="card overflow-hidden p-0">
                <button onClick={() => openGallery(c)} className="relative block h-40 w-full overflow-hidden bg-slate-100 text-left">
                  <LatestThumb cameraId={c.id} refreshKey={refreshKey} />
                  <span className={cx(
                    'absolute left-3 top-3 chip backdrop-blur',
                    offline ? 'bg-sun-100/90 text-amber-800' : 'bg-leaf-100/90 text-leaf-800',
                  )}>
                    <span className={cx('h-1.5 w-1.5 rounded-full', offline ? 'bg-amber-500' : 'bg-leaf-600')} />
                    {offline ? t('cam.offline') : t('cam.online')}
                  </span>
                  {galleryBusy && <span className="absolute right-3 top-3 chip bg-white/90 text-slate-600"><Spinner className="h-3 w-3" /></span>}
                </button>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-bold text-slate-900">{c.name}</h3>
                      <p className="truncate text-xs text-slate-500">
                        {c.field_name ? `${c.field_name} · ` : ''}
                        {t('cam.lastSeen')}: {c.last_seen_at ? timeAgo(c.last_seen_at) : t('cam.never')}
                      </p>
                    </div>
                    {!c.is_active && <span className="chip bg-slate-100 text-slate-500">{t('cam.paused')}</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className="chip bg-slate-100 text-slate-600">🖼 {c.photo_count} {t('cam.photoCount')}</span>
                    <span className="chip bg-slate-100 text-slate-600">⏱ {INTERVALS.find((i) => i.v === c.capture_interval_minutes)?.label || `${c.capture_interval_minutes} min`}</span>
                    {c.auto_analyse && <span className="chip bg-leaf-50 text-leaf-700">🤖 AI</span>}
                    {c.battery && <span className="chip bg-slate-100 text-slate-600">🔋 {c.battery}</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-soft h-10 px-3 text-xs" onClick={() => openGallery(c)}>
                      <Icons.grid className="h-4 w-4" /> {t('cam.viewPhotos')}
                    </button>
                    <button className="btn-ghost h-10 px-3 text-xs"
                            onClick={() => navigate(`/app/camera-mode?camera=${c.id}`)}>
                      <Icons.camera className="h-4 w-4" /> {t('cam.startMode')}
                    </button>
                    <button className="btn-ghost h-10 px-3 text-xs" onClick={() => { openEditor(c); }}>
                      <Icons.edit className="h-4 w-4" /> {t('common.edit')}
                    </button>
                    <button className="btn-icon h-10 w-10 text-red-500 hover:bg-red-50" onClick={() => setConfirmDelete(c)} aria-label={t('common.delete')}>
                      <Icons.trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* add / edit modal */}
      <Modal
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setCreatedCamera(null); }}
        title={createdCamera ? t('cam.connectTitle') : (editing ? `${t('common.edit')} — ${editing.name}` : t('cam.add'))}
        wide
        footer={
          createdCamera ? (
            <button className="btn-primary w-full" onClick={() => { setEditorOpen(false); setCreatedCamera(null); }}>
              <Icons.check className="h-4 w-4" /> {t('common.close')}
            </button>
          ) : (
            <div className="flex gap-3">
              <button className="btn-ghost flex-1" onClick={() => setEditorOpen(false)}>{t('common.cancel')}</button>
              <button className="btn-primary flex-1" onClick={save} disabled={saving}>
                {saving ? <><Spinner className="h-4 w-4" /> {t('common.saving')}</> : <><Icons.check className="h-4 w-4" /> {t('common.save')}</>}
              </button>
            </div>
          )
        }
      >
        {createdCamera ? (
          <>
            <div className="mb-3">
              <InfoBox tone="leaf">
                📷 <strong>{createdCamera.name}</strong> — {t('cam.connectHint')}
              </InfoBox>
            </div>
            <ConnectHelp
              camera={createdCamera}
              testing={testing}
              testResult={testResult}
              onTest={() => testConnection(createdCamera)}
              onStartMode={() => navigate(`/app/camera-mode?camera=${createdCamera.id}`)}
            />
            <div className="mt-4 border-t border-slate-100 pt-4">
              <button className="btn-ghost w-full" onClick={() => rotateKey(createdCamera)}>
                <Icons.refresh className="h-4 w-4" /> {t('cam.regenerateKey')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={save} className="space-y-4" noValidate>
            <ErrorBox>{formError}</ErrorBox>
            <Field label={t('cam.name')} required>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                     placeholder={t('cam.namePh')} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('cam.fieldName')}>
                <input className="input" value={form.field_name} onChange={(e) => setForm((f) => ({ ...f, field_name: e.target.value }))} placeholder="Field A" />
              </Field>
              <Field label={t('cam.every')}>
                <select className="input" value={form.capture_interval_minutes}
                        onChange={(e) => setForm((f) => ({ ...f, capture_interval_minutes: Number(e.target.value) }))}>
                  {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label={t('cam.notes')}>
              <input className="input" value={form.location_note} onChange={(e) => setForm((f) => ({ ...f, location_note: e.target.value }))}
                     placeholder={t('cam.notesPh')} />
            </Field>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-slate-300 text-leaf-600 focus:ring-leaf-200"
                     checked={form.auto_analyse} onChange={(e) => setForm((f) => ({ ...f, auto_analyse: e.target.checked }))} />
              <span className="text-[13px] font-semibold text-slate-700">{t('cam.autoAnalyse')}</span>
            </label>
            {editing && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button type="button" className="btn-ghost" onClick={() => rotateKey(editing)}>
                  <Icons.refresh className="h-4 w-4" /> {t('cam.regenerateKey')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => testConnection(editing)} disabled={testing}>
                  {testing ? <Spinner className="h-4 w-4" /> : <Icons.cloud className="h-4 w-4" />} {t('cam.testConnection')}
                </button>
                {testResult && (
                  <span className={cx('chip', testResult.ok ? 'bg-leaf-50 text-leaf-700' : 'bg-sun-50 text-amber-800')}>
                    {testResult.ok ? `✅ ${t('cam.connected')}` : `⚠️ ${testResult.message}`}
                  </span>
                )}
              </div>
            )}
          </form>
        )}
      </Modal>

      {/* gallery modal */}
      <Modal
        open={Boolean(gallery)}
        onClose={() => { setGallery(null); setLightbox(-1); }}
        title={gallery ? `${gallery.camera.name} — ${gallery.total} ${t('cam.photoCount')}` : ''}
        wide
      >
        {gallery && gallery.photos.length === 0 ? (
          <EmptyState icon="🖼" title={t('cam.noPhotos')} subtitle={t('cam.screenMustStay')} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gallery?.photos.map((p, i) => (
                <button key={p.id} onClick={() => setLightbox(i)}
                        className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                  <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/70 to-transparent px-2 py-1.5 text-left text-[10px] font-semibold text-white">
                    {timeAgo(p.captured_at)}
                  </span>
                  {p.ai_note && <span className="absolute right-1.5 top-1.5 rounded-full bg-leaf-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white">AI</span>}
                </button>
              ))}
            </div>
            {gallery && gallery.photos.length < gallery.total && (
              <button className="btn-ghost mt-4 w-full" onClick={loadMore} disabled={galleryBusy}>
                {galleryBusy ? <Spinner className="h-4 w-4" /> : <Icons.arrowLeft className="h-4 w-4 -rotate-90" />} {t('cam.loadMore')}
              </button>
            )}
          </>
        )}
      </Modal>

      {gallery && lightbox >= 0 && (
        <Lightbox
          camera={gallery.camera}
          photos={gallery.photos}
          index={lightbox}
          onIndex={(updater) => setLightbox((i) => (typeof updater === 'function' ? updater(i) : updater))}
          onAnalyse={analysePhoto}
          onDelete={removePhoto}
          onClose={() => setLightbox(-1)}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={t('common.delete')}
        body={t('cam.confirmDelete')}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}
