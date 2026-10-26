import { FilterX, Radar } from 'lucide-react';
import { FILTER_LABELS, type FilterKey, type FilterResult } from '../lib/filters';
import type { ScanMeta } from '../types';

interface Props {
  result: FilterResult;
  meta?: ScanMeta;
  onReset: (key: FilterKey) => void;
  onResetAll: () => void;
}

/** Пояснює, чому список порожній: немає даних зі сканера чи все приховано фільтрами. */
export function EmptyState({ result, meta, onReset, onResetAll }: Props) {
  if (result.total === 0) {
    const enabled = meta?.exchanges.filter((e) => e.enabled) ?? [];
    const okCount = enabled.filter((e) => e.ok).length;
    let reason = 'Сканер ще не завершив перший цикл.';
    if (meta?.cycle) {
      if (enabled.length < 2) reason = 'Увімкнено менше двох бірж — порівнювати нема з чим. Увімкніть біржі в панелі адміністратора.';
      else if (okCount < 2) reason = 'Менше двох бірж відповіли успішно — перевірте статус API вище.';
      else reason = `Порівняно ${meta.basesCompared} спільних активів — жодна пара не перевищила мінімальний спред для перевірки стакана.`;
    }
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Radar className="text-slate-500" size={36} />
        <h3 className="text-base font-semibold text-white">Зв’язок поки немає</h3>
        <p className="max-w-md text-sm text-slate-400">{reason}</p>
      </div>
    );
  }
  const entries = (Object.entries(result.hiddenBy) as Array<[FilterKey, number]>).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
      <FilterX className="text-amber-300" size={36} />
      <div>
        <h3 className="text-base font-semibold text-white">Усі {result.total} зв’язок приховано фільтрами</h3>
        <p className="mt-1 text-sm text-slate-400">Ось які фільтри їх приховують (одна зв’язка може не пройти кілька фільтрів):</p>
      </div>
      <ul className="w-full max-w-md space-y-1.5 text-left">
        {entries.map(([key, count]) => (
          <li key={key} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span>
              {FILTER_LABELS[key]} — <b className="text-white">приховує {count}</b>
            </span>
            <button className="btn-ghost px-2 py-1 text-xs text-emerald-300" onClick={() => onReset(key)}>
              {key === 'showSuspicious' ? 'Показати' : 'Скинути'}
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-primary" onClick={onResetAll}>Скинути всі фільтри</button>
    </div>
  );
}
