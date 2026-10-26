import { AlertTriangle, Info } from 'lucide-react';
import { timeAgo } from '../lib/format';
import type { OpportunitiesResponse } from '../types';
import { EXCHANGE_LABELS } from '../types';

export function StatusStrip({ data, now, error }: { data: OpportunitiesResponse | null; now: number; error: string | null }) {
  if (!data) return null;
  const { meta, config } = data;
  const failing = meta.exchanges.filter((e) => e.enabled && e.updatedAt && !e.ok);
  const noAssetInfo = meta.exchanges.filter((e) => e.enabled && e.assetInfo === 'unavailable' && e.updatedAt);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          Оновлено: <b className="text-slate-200">{meta.scannedAt ? timeAgo(meta.scannedAt, now) : 'очікування…'}</b>
        </span>
        <span>Цикл #{meta.cycle}</span>
        <span>Ринків: {meta.marketsTotal}</span>
        <span>Спільних активів: {meta.basesCompared}</span>
        <span>Перевірено стаканів: {meta.booksFetched}{meta.booksFailed ? ` (помилок: ${meta.booksFailed})` : ''}</span>
        <span>
          Угода: <b className="text-slate-200">${config.tradeSizeUsd}</b> · вікно глибини ±{config.depthWindowPct}%
        </span>
        <span>
          Комісії: {config.exchanges.map((e) => `${e.label} ${config.fees[e.id]}%`).join(' · ')}
        </span>
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Немає з’єднання з сервером: {error}. Показано останні отримані дані.
        </div>
      )}
      {failing.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            {failing.map((e) => (
              <div key={e.exchange}>
                <b>{EXCHANGE_LABELS[e.exchange]}</b>: API недоступний — {e.error}
              </div>
            ))}
          </div>
        </div>
      )}
      {noAssetInfo.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-2 text-xs text-sky-200/90">
          <Info size={14} className="mt-0.5 shrink-0" />
          <div>
            Дані про мережі/контракти недоступні для:{' '}
            {noAssetInfo.map((e) => (
              <span key={e.exchange} title={e.assetInfoReason} className="underline decoration-dotted">
                {EXCHANGE_LABELS[e.exchange]}{' '}
              </span>
            ))}
            — прибуток для зв’язок з цими біржами позначається як <b>попередній</b>.
          </div>
        </div>
      )}
    </div>
  );
}
