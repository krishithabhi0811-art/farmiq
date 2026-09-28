import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { api } from '../lib/api.js';
import { PageHeader } from '../components/Layout.jsx';
import { Icons, InfoBox, Spinner, useToast } from '../components/ui.jsx';
import { cx, fileToCompressedDataUrl } from '../lib/utils.js';

const MODES = ['chat', 'advisory', 'fertilizer', 'pest', 'market', 'calendar'];
const MODE_ICONS = {
  chat: Icons.chat, advisory: Icons.check, fertilizer: Icons.flask,
  pest: Icons.alert, market: Icons.rupee, calendar: Icons.calendar,
};

export default function Assistant() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const location = useLocation();
  const [mode, setMode] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(location.state?.prompt || '');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiReady, setAiReady] = useState(null);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // pre-fill from other screens, e.g. a record's "ask about this"
  useEffect(() => {
    if (location.state?.prompt) inputRef.current?.focus();
  }, [location.state]);

  useEffect(() => {
    api.health().then((h) => setAiReady(Boolean(h?.integrations?.gemini))).catch(() => setAiReady(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const attach = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await fileToCompressedDataUrl(file, 900, 0.7);
      setImage(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async (text) => {
    const prompt = (text ?? input).trim();
    if ((!prompt && !image) || busy) return;

    const userMsg = { role: 'user', content: prompt || '📷 (photo)', image: image || undefined };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    const sentImage = image;
    setImage(null);
    setBusy(true);

    try {
      const { text: reply } = await api.aiGenerate({
        prompt: prompt || 'Please look at this photo of my crop and tell me what is wrong.',
        mode,
        image: sentImage || undefined,
        messages: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-10.5rem)] flex-col">
      <PageHeader
        title={t('ai.title')}
        subtitle={t('ai.subtitle')}
        action={
          messages.length > 0 && (
            <button className="btn-ghost" onClick={() => { setMessages([]); setImage(null); }}>
              <Icons.refresh className="h-4 w-4" /> {t('ai.clear')}
            </button>
          )
        }
      />

      {aiReady === false && <div className="mb-4"><InfoBox tone="sun">{t('ai.offline')}</InfoBox></div>}

      {/* mode chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {MODES.map((m) => {
          const Icon = MODE_ICONS[m];
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx(
                'chip shrink-0 gap-2 border px-3.5 py-2 transition',
                mode === m ? 'border-leaf-300 bg-leaf-50 text-leaf-700 ring-2 ring-leaf-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t(`mode.${m}`)}
            </button>
          );
        })}
      </div>

      {/* conversation */}
      <div ref={scrollRef} className="glass-card flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" style={{ maxHeight: '58vh', minHeight: '320px' }}>
        {messages.length === 0 && (
          <>
            <Bubble role="assistant">{t('ai.greeting')}</Bubble>
            <div className="grid gap-2 sm:grid-cols-2">
              {['ai.suggest1', 'ai.suggest2', 'ai.suggest3', 'ai.suggest4'].map((k) => (
                <button
                  key={k}
                  onClick={() => send(t(k))}
                  className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left text-[13px] font-semibold text-slate-600 transition hover:-translate-y-0.5 hover:border-leaf-200 hover:text-leaf-800 hover:shadow-soft"
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} error={m.error} image={m.image}>
            {m.content}
          </Bubble>
        ))}

        {busy && (
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-leaf-600 text-white"><Icons.sprout className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} /></span>
            <span className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500">
              <Spinner className="h-4 w-4 text-leaf-600" /> {t('ai.thinking')}
            </span>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="sticky bottom-20 z-20 mt-3 md:bottom-4">
        {image && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-2.5">
            <img src={image} alt="attachment" className="h-14 w-14 rounded-xl object-cover" />
            <span className="text-xs font-semibold text-leaf-800">Photo attached — ask your question</span>
            <button onClick={() => setImage(null)} className="btn-icon ml-auto h-9 w-9"><Icons.close className="h-4 w-4" /></button>
          </div>
        )}
        <div className="glass flex items-end gap-2 rounded-2xl p-2">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={attach} />
          <button className="btn-icon h-11 w-11" onClick={() => fileRef.current?.click()} title={t('scan.upload')} aria-label={t('scan.upload')}>
            <Icons.camera className="h-5 w-5" />
          </button>
          <textarea
            ref={inputRef}
            className="max-h-32 min-h-[46px] flex-1 resize-none border-0 bg-transparent px-2 py-3 text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
            rows={1}
            placeholder={t('ai.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          <button
            className="btn-primary h-11 w-11 shrink-0 rounded-xl p-0"
            onClick={() => send()}
            disabled={busy || (!input.trim() && !image)}
            aria-label={t('ai.send')}
          >
            {busy ? <Spinner className="h-5 w-5" /> : <Icons.send className="h-5 w-5" />}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          AI advice is a guide. Confirm pesticide doses with your local agriculture officer.
        </p>
      </div>
    </div>
  );
}

function Bubble({ role, children, error, image }) {
  const isUser = role === 'user';
  return (
    <div className={cx('flex items-start gap-2.5', isUser && 'flex-row-reverse')}>
      <span className={cx(
        'grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white',
        isUser ? 'bg-slate-700' : 'bg-gradient-to-br from-leaf-500 to-leaf-700',
      )}>
        {isUser ? <Icons.user className="h-4 w-4" /> : <Icons.sprout className="h-4 w-4" />}
      </span>
      <div className={cx('max-w-[85%] sm:max-w-[75%]', isUser && 'text-right')}>
        <div className={cx(
          'inline-block rounded-2xl px-4 py-3 text-left text-[15px] leading-relaxed whitespace-pre-wrap shadow-soft',
          isUser ? 'bg-slate-800 text-white'
            : error ? 'border border-red-100 bg-red-50 text-red-700'
            : 'border border-slate-200 bg-white text-slate-700',
        )}>
          {image && <img src={image} alt="attachment" className="mb-2 max-h-52 w-full rounded-xl object-cover" />}
          {children}
        </div>
      </div>
    </div>
  );
}
