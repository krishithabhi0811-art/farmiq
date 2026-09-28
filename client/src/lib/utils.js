/** Small shared helpers. */

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function formatDate(value, lang = 'en') {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return String(value).slice(0, 10);
  }
}

export function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export const CATEGORY_ICONS = {
  crop: '🌾', soil: '🪱', pest: '🐛', irrigation: '💧',
  fertilizer: '🧪', weather: '☁️', expense: '💰', other: '📌',
};

export const CATEGORY_STYLES = {
  crop: 'bg-leaf-50 text-leaf-700 border border-leaf-100',
  soil: 'bg-soil-100 text-soil-700 border border-soil-200',
  pest: 'bg-red-50 text-red-600 border border-red-100',
  irrigation: 'bg-sky-50 text-sky-600 border border-sky-100',
  fertilizer: 'bg-violet-50 text-violet-600 border border-violet-100',
  weather: 'bg-slate-100 text-slate-600 border border-slate-200',
  expense: 'bg-sun-50 text-sun-600 border border-sun-100',
  other: 'bg-slate-100 text-slate-600 border border-slate-200',
};

export const STATUS_STYLES = {
  planned: 'bg-slate-100 text-slate-600',
  growing: 'bg-leaf-100 text-leaf-700',
  harvested: 'bg-amber-100 text-amber-700',
  at_risk: 'bg-red-100 text-red-700',
  solved: 'bg-sky-100 text-sky-700',
};

export const STATUS_DOT = {
  planned: 'bg-slate-400', growing: 'bg-leaf-500', harvested: 'bg-amber-500',
  at_risk: 'bg-red-500', solved: 'bg-sky-500',
};

export const CATEGORIES = ['crop', 'soil', 'pest', 'irrigation', 'fertilizer', 'weather', 'expense', 'other'];
export const STATUSES = ['planned', 'growing', 'harvested', 'at_risk', 'solved'];

export const pick = (t, prefix, key, fallback = key) => {
  const v = t(`${prefix}.${key}`);
  return v === `${prefix}.${key}` ? fallback : v;
};

/**
 * Compress a camera/photo file to a small JPEG data-URL.
 * Keeps uploads fast on village networks and inside Postgres.
 */
export function fileToCompressedDataUrl(file, maxSize = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'));
    if (!/^image\//.test(file.type)) return reject(new Error('Please choose a photo file.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file does not look like a photo.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const gradeColor = (score) =>
  score >= 85 ? '#16a34a' : score >= 70 ? '#65a30d' : score >= 55 ? '#f59e0b' : '#ef4444';
