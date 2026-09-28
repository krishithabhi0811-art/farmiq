import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n.jsx';
import { api } from '../../lib/api.js';
import { Icons, InfoBox, Spinner, useToast } from '../../components/ui.jsx';
import { fileToCompressedDataUrl } from '../../lib/utils.js';

export default function ScanPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const [live, setLive] = useState(false);
  const [camError, setCamError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState(null);

  useEffect(() => {
    api.health().then((h) => setAiReady(Boolean(h?.integrations?.gemini))).catch(() => setAiReady(false));
    return () => stopCam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCam = async () => {
    setCamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(t('scan.noCamera'));
      fileRef.current?.click();
      return;
    }
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
    } catch (e) {
      setLive(false);
      setCamError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? t('scan.denied') : t('scan.noCamera'));
    }
  };

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLive(false);
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const maxW = 900;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    setPhoto(canvas.toDataURL('image/jpeg', 0.75));
    setResult('');
    stopCam();
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await fileToCompressedDataUrl(file, 900, 0.75));
      setResult('');
      stopCam();
    } catch (err) {
      toast.error(err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const analyse = async () => {
    if (!photo) return;
    setBusy(true);
    setResult('');
    try {
      const { text } = await api.aiScan(photo);
      setResult(text);
    } catch (e) {
      setResult(`⚠️ ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const askFollowUp = () => {
    navigate('/app/assistant', { state: { prompt: `About my crop photo scan: ${result.slice(0, 220)}… What should I do next?` } });
  };

  return (
    <div>
      {aiReady === false && <div className="mb-4"><InfoBox tone="sun">{t('ai.offline')}</InfoBox></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* camera panel */}
        <div className="card overflow-hidden p-0">
          <div className="relative aspect-[4/3] w-full bg-slate-900">
            {photo ? (
              <img src={photo} alt="crop" className="h-full w-full object-cover" />
            ) : live ? (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-leaf-900 to-slate-900 text-center text-white/90">
                <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white/10 backdrop-blur"><Icons.camera className="h-8 w-8" /></span>
                <p className="max-w-[16rem] px-4 text-sm">{t('scan.tip')}</p>
              </div>
            )}

            {live && (
              <div className="pointer-events-none absolute inset-6 rounded-3xl border-2 border-dashed border-white/40" />
            )}
          </div>

          <div className="flex flex-wrap gap-3 p-4">
            {!photo && !live && (
              <>
                <button className="btn-primary flex-1" onClick={startCam}><Icons.camera className="h-4 w-4" /> {t('scan.open')}</button>
                <button className="btn-ghost flex-1" onClick={() => fileRef.current?.click()}><Icons.upload className="h-4 w-4" /> {t('scan.upload')}</button>
              </>
            )}
            {live && (
              <>
                <button className="btn-primary flex-1" onClick={shoot}><Icons.camera className="h-4 w-4" /> {t('scan.analyse')}</button>
                <button className="btn-ghost" onClick={stopCam}>{t('common.cancel')}</button>
              </>
            )}
            {photo && (
              <>
                <button className="btn-primary flex-1" onClick={analyse} disabled={busy}>
                  {busy ? <><Spinner className="h-4 w-4" /> {t('scan.analysing')}</> : <><Icons.sparkles className="h-4 w-4" /> {t('scan.analyse')}</>}
                </button>
                <button className="btn-ghost" onClick={() => { setPhoto(null); setResult(''); startCam(); }}>
                  <Icons.refresh className="h-4 w-4" /> {t('scan.retake')}
                </button>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickFile} />
          </div>

          {camError && <div className="px-4 pb-4"><InfoBox tone="sun">{camError}</InfoBox></div>}
        </div>

        {/* result panel */}
        <div className="card p-5">
          <h2 className="section-title"><Icons.sparkles className="h-4 w-4 text-leaf-600" /> {t('scan.result')}</h2>

          {busy && (
            <div className="mt-4 space-y-3">
              {[90, 75, 60].map((w) => <div key={w} className="skeleton h-4" style={{ width: `${w}%` }} />)}
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Spinner className="h-4 w-4 text-leaf-600" /> {t('scan.analysing')}</p>
            </div>
          )}

          {!busy && !result && (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
              <div className="text-3xl">🔎</div>
              <p className="mt-2 text-sm text-slate-500">{t('scan.tip')}</p>
            </div>
          )}

          {result && (
            <>
              <p className="ai-text mt-4 rounded-2xl border border-leaf-100 bg-leaf-50/50 p-4">{result}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-soft"
                  onClick={() => navigate('/app/records?new=1')}
                >
                  <Icons.plus className="h-4 w-4" /> Save as farm record
                </button>
                <button className="btn-ghost" onClick={askFollowUp}>
                  <Icons.chat className="h-4 w-4" /> Ask a follow-up
                </button>
              </div>
            </>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <InfoBox tone="slate">
              The scan is an AI guess from one photo. If the problem spreads, show the plant to your
              local agriculture officer before spraying.
            </InfoBox>
          </div>
        </div>
      </div>
    </div>
  );
}
