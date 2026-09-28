/**
 * FieldCameraMode.jsx — turns a spare phone into a field camera.
 *
 * Leave the phone in the field (plugged in, screen on). This page takes a
 * photo every N minutes and uploads it with the camera's device key — exactly
 * the same endpoint an ESP32-CAM or Raspberry Pi would use.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { api, cameraDevice } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorBox, Field, Icons, InfoBox, Spinner, useToast } from '../components/ui.jsx';
import { cx, timeAgo } from '../lib/utils.js';

const INTERVALS = [
  { v: 5, label: '5 min' }, { v: 15, label: '15 min' }, { v: 30, label: '30 min' },
  { v: 60, label: '1 hour' }, { v: 180, label: '3 hours' }, { v: 360, label: '6 hours' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function FieldCameraMode() {
  const { t } = useI18n();
  const toast = useToast();
  const [params] = useSearchParams();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const runningRef = useRef(false);
  const wakeLockRef = useRef(null);
  const nextAtRef = useRef(0);

  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cameraId, setCameraId] = useState(params.get('camera') || '');
  const [intervalMin, setIntervalMin] = useState(30);
  const [live, setLive] = useState(false);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [lastUpload, setLastUpload] = useState(null);
  const [status, setStatus] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [awake, setAwake] = useState(false);

  const camera = cameras.find((c) => c.id === cameraId) || null;

  /* ── load cameras ── */
  useEffect(() => {
    api.listCameras()
      .then((d) => {
        setCameras(d.cameras || []);
        if (!cameraId && d.cameras?.[0]) setCameraId(d.cameras[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── camera preview ── */
  const startPreview = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setLive(true);
      setError('');
      return true;
    } catch (e) {
      setError(e?.name === 'NotAllowedError' ? t('cam.cameraDenied') : t('scan.noCamera'));
      return false;
    }
  }, [t]);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => () => { stopPreview(); clearTimeout(timerRef.current); }, [stopPreview]);

  /* ── keep the screen awake (best effort) ── */
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setAwake(true);
        wakeLockRef.current.addEventListener?.('release', () => setAwake(false));
      }
    } catch { setAwake(false); }
  };

  /* ── capture one frame and upload it ── */
  const captureAndSend = useCallback(async (reason = 'timer') => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return false;

    const maxW = 900;
    const scale = Math.min(1, maxW / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.7);

    if (!cameraId || !camera) return false;

    try {
      setStatus(`${t('cam.uploaded')}…`);
      const res = await cameraDevice.upload(cameraId, camera.device_key, image, {
        note: reason === 'manual' ? 'sent from camera mode' : null,
        captured_at: new Date().toISOString(),
      });
      setCount((n) => n + 1);
      setLastUpload(new Date());
      setStatus(`✅ ${t('cam.uploaded')} (${new Date().toLocaleTimeString()})`);
      return res.ok !== false;
    } catch (e) {
      setStatus(`⚠️ ${e.message}`);
      return false;
    }
  }, [camera, cameraId, t]);

  /* ── the capture loop ── */
  const loop = useCallback(async () => {
    while (runningRef.current) {
      await captureAndSend('timer');
      if (!runningRef.current) break;
      const waitMs = Math.max(60, Number(intervalMin)) * 1000;
      nextAtRef.current = Date.now() + waitMs;
      while (runningRef.current && Date.now() < nextAtRef.current) {
        setSecondsLeft(Math.max(0, Math.round((nextAtRef.current - Date.now()) / 1000)));
        await sleep(500);
      }
    }
  }, [captureAndSend, intervalMin]);

  const start = async () => {
    if (!camera) return setError(t('cam.chooseCamera'));
    const ok = await startPreview();
    if (!ok) return;
    await requestWakeLock();
    runningRef.current = true;
    setRunning(true);
    setStatus(t('cam.cameraReady'));
    await captureAndSend('start');
    loop();
  };

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
    setSecondsLeft(0);
    setStatus('');
    stopPreview();
  };

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!loading && cameras.length === 0) {
    return (
      <div>
        <PageHeader title={t('cam.modeTitle')} subtitle={t('cam.modeHint')} back />
        <EmptyState
          icon="📷"
          title={t('cam.noCameras')}
          subtitle={t('cam.noCamerasSub')}
          action={<Link to="/app/scan?tab=cameras" className="btn-primary"><Icons.plus className="h-4 w-4" /> {t('cam.add')}</Link>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('cam.modeTitle')} subtitle={t('cam.modeHint')} back />

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* preview */}
        <div className="card overflow-hidden p-0">
          <div className="relative aspect-[4/3] w-full bg-slate-900">
            <video ref={videoRef} playsInline muted className={cx('h-full w-full object-cover', !live && 'hidden')} />
            {!live && (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-leaf-900 to-slate-900 text-center text-white/90">
                <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white/10"><Icons.camera className="h-8 w-8" /></span>
                <p className="max-w-[17rem] px-4 text-sm">{t('cam.screenMustStay')}</p>
              </div>
            )}
            {running && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1.5 text-[11px] font-bold text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC · {count} {t('cam.uploaded')}
              </div>
            )}
            {awake && (
              <div className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-bold text-white/90 backdrop-blur">
                ☀️ {t('cam.keepAwake')}
              </div>
            )}
          </div>

          <div className="space-y-3 p-4">
            {status && <InfoBox tone={status.startsWith('⚠️') ? 'sun' : 'leaf'}>{status}</InfoBox>}

            <div className="flex flex-wrap gap-3">
              {!running ? (
                <button className="btn-primary flex-1" onClick={start} disabled={!camera}>
                  <Icons.camera className="h-4 w-4" /> {t('cam.start')}
                </button>
              ) : (
                <>
                  <button className="btn-primary flex-1" onClick={() => captureAndSend('manual')}>
                    <Icons.upload className="h-4 w-4" /> {t('cam.uploadNow')}
                  </button>
                  <button className="btn-danger" onClick={stop}>
                    <Icons.close className="h-4 w-4" /> {t('cam.stop')}
                  </button>
                </>
              )}
            </div>

            {running && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                <span className="text-[13px] font-semibold text-slate-600">{t('cam.nextIn')}</span>
                <span className="text-xl font-extrabold tabular-nums text-leaf-700">{mmss(secondsLeft)}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{t('cam.lastUpload')}: {lastUpload ? `${timeAgo(lastUpload)}` : t('cam.never')}</span>
              <span>{count} {t('cam.uploaded')}</span>
            </div>
          </div>
        </div>

        {/* settings */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="section-title"><Icons.camera className="h-4 w-4 text-leaf-600" /> {t('cam.settings')}</h2>
            <div className="mt-4 space-y-4">
              <Field label={t('cam.chooseCamera')}>
                <select className="input" value={cameraId} onChange={(e) => setCameraId(e.target.value)} disabled={running}>
                  {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}{c.field_name ? ` — ${c.field_name}` : ''}</option>)}
                </select>
              </Field>
              <Field label={t('cam.interval')}>
                <select className="input" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} disabled={running}>
                  {INTERVALS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
                </select>
              </Field>

              {camera && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-[12px] text-slate-600">
                  <div className="font-mono text-[11px] text-slate-500">key: {camera.device_key.slice(0, 14)}…</div>
                  <div className="mt-1">{camera.field_name ? `📍 ${camera.field_name}` : ''}</div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="section-title"><Icons.alert className="h-4 w-4 text-sun-500" /> {t('cam.screenMustStay')}</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-600">
              <li>• {t('cam.screenMustStay')}</li>
              <li>• {t('cam.keyNote')}</li>
              <li>• {t('scan.tip')}</li>
            </ul>
            <Link to={`/app/scan?tab=cameras`} className="btn-soft mt-4 w-full">
              <Icons.grid className="h-4 w-4" /> {t('cam.viewPhotos')}
            </Link>
          </div>

          {loading && <div className="card p-5"><Spinner className="h-5 w-5 text-leaf-600" /></div>}
        </div>
      </div>
    </div>
  );
}
