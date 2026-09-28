/**
 * Scan.jsx — CAMERA hub.
 *   • "Scan a crop"  → take a photo now and get an AI diagnosis (phone in hand)
 *   • "Field cameras" → cameras that live in the field and send photos on their own
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { Icons } from '../components/ui.jsx';
import { cx } from '../lib/utils.js';
import ScanPanel from './scan/ScanPanel.jsx';
import CamerasPanel from './scan/CamerasPanel.jsx';

const TABS = [
  { id: 'scan', key: 'cam.tabScan', icon: Icons.camera },
  { id: 'cameras', key: 'cam.tabDevices', icon: Icons.grid },
];

export default function Scan() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'cameras' ? 'cameras' : 'scan');

  // support ?tab=cameras from other screens (e.g. the dashboard camera card)
  useEffect(() => {
    const wanted = params.get('tab') === 'cameras' ? 'cameras' : 'scan';
    setTab((current) => (current === wanted ? current : wanted));
  }, [params]);

  const choose = (id) => {
    setTab(id);
    setParams((p) => {
      if (id === 'scan') p.delete('tab'); else p.set('tab', id);
      return p;
    }, { replace: true });
  };

  return (
    <div>
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-soft">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => choose(tb.id)}
            className={cx(
              'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold transition',
              tab === tb.id ? 'bg-leaf-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
            )}
            aria-pressed={tab === tb.id}
          >
            <tb.icon className="h-4 w-4" /> {t(tb.key)}
          </button>
        ))}
      </div>

      {tab === 'scan' ? <ScanPanel /> : <CamerasPanel />}
    </div>
  );
}
