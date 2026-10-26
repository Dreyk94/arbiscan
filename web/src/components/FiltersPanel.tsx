import clsx from 'clsx';
import { RotateCcw, X } from 'lucide-react';
import { useEffect } from 'react';
import { DEFAULT_FILTERS, type FilterState, type SortKey, activeFilterCount } from '../lib/filters';
import { SORT_LABELS } from '../lib/labels';
import { ALL_EXCHANGES, EXCHANGE_LABELS, type ExchangeId } from '../types';


interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  networks: Array<{ network: string; count: number }>;
  tradeSizeUsd: number;
  open: boolean;
  onClose: () => void;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function FiltersBody({ filters: f, onChange, networks, tradeSizeUsd }: Omit<Props, 'open' | 'onClose'>) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...f, [k]: v });
  const exchangeChips = (key: 'buyExchanges' | 'sellExchanges') => (
    <div className="flex flex-wrap gap-1.5">
      <button className={f[key].length === 0 ? 'chip-on' : 'chip-off'} onClick={() => set(key, [])}>
        Усі
      </button>
      {ALL_EXCHANGES.map((ex: ExchangeId) => (
        <button key={ex} className={f[key].includes(ex) ? 'chip-on' : 'chip-off'} onClick={() => set(key, toggle(f[key], ex))}>
          {EXCHANGE_LABELS[ex]}
        </button>
      ))}
    </div>
  );
  const check = (k: 'onlyProfitable' | 'onlyEnoughLiquidity' | 'onlyConfirmed' | 'onlyOpenTransfer' | 'onlyAvailable' | 'showSuspicious', label: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-white/5">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-400" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
      <span className="text-sm">
        <span className="text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="f-search">Пошук</label>
        <input id="f-search" className="input" placeholder="Тикер, напр. SOL" value={f.search} onChange={(e) => set('search', e.target.value)} />
      </div>

      <div>
        <span className="label">Сортування</span>
        <div className="flex gap-2">
          <select className="input" value={f.sortKey} onChange={(e) => set('sortKey', e.target.value as SortKey)} aria-label="Поле сортування">
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="btn-outline shrink-0" onClick={() => set('sortDir', f.sortDir === 'asc' ? 'desc' : 'asc')} title="Напрям сортування">
            {f.sortDir === 'desc' ? '↓ спад.' : '↑ зрост.'}
          </button>
        </div>
      </div>

      <div>
        <span className="label">Біржа купівлі</span>
        {exchangeChips('buyExchanges')}
      </div>
      <div>
        <span className="label">Біржа продажу</span>
        {exchangeChips('sellExchanges')}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="label">Мережа переказу</span>
          <span className="text-[11px] text-slate-500">{f.networks.length ? `обрано: ${f.networks.length}` : 'усі мережі'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={f.networks.length === 0 ? 'chip-on' : 'chip-off'} onClick={() => set('networks', [])}>
            Усі
          </button>
          {networks.map(({ network, count }) => (
            <button key={network} className={f.networks.includes(network) ? 'chip-on' : 'chip-off'} onClick={() => set('networks', toggle(f.networks, network))}>
              {network} <span className="text-slate-500">{count}</span>
            </button>
          ))}
          {f.networks
            .filter((n) => !networks.some((x) => x.network === n))
            .map((n) => (
              <button key={n} className="chip-on opacity-70" onClick={() => set('networks', toggle(f.networks, n))} title="Наразі немає зв’язок у цій мережі">
                {n} <span className="text-slate-500">0</span>
              </button>
            ))}
        </div>
        {f.networks.length > 0 && (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" className="h-3.5 w-3.5 accent-emerald-400" checked={f.includeUnverifiedNetworks} onChange={(e) => set('includeUnverifiedNetworks', e.target.checked)} />
            Показувати зв’язки з неперевіреною мережею
          </label>
        )}
      </div>

      <div>
        <label className="label" htmlFor="f-spread">Мінімальний спред: {f.minSpreadPct.toFixed(1).replace('.', ',')}%</label>
        <input id="f-spread" type="range" min={0} max={10} step={0.1} value={f.minSpreadPct} onChange={(e) => set('minSpreadPct', Number(e.target.value))} className="w-full accent-emerald-400" />
      </div>

      <div className="space-y-0.5">
        {check('onlyProfitable', 'Лише прибуткові', 'Після комісій обох бірж і мережі')}
        {check('onlyEnoughLiquidity', `Достатньо обсягу на $${tradeSizeUsd}`, 'За глибиною стакана на обох біржах')}
        {check('onlyConfirmed', 'Лише перевірені', 'Стакан і мережа перевірені')}
        {check('onlyAvailable', 'Лише доступні', 'Переказ відкритий, стакан достатній, не підозріла')}
        {check('onlyOpenTransfer', 'Відкритий переказ', 'Вивід і депозит доступні у спільній мережі')}
        {check('showSuspicious', 'Показувати підозрілі', 'Різні контракти, аномальний спред, цінові викиди')}
      </div>

      <button className="btn-outline w-full" onClick={() => onChange({ ...DEFAULT_FILTERS, sortKey: f.sortKey, sortDir: f.sortDir })} disabled={activeFilterCount(f) === 0}>
        <RotateCcw size={14} /> Скинути фільтри
      </button>
    </div>
  );
}

export function FiltersPanel(props: Props) {
  const { open, onClose } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <>
      <aside className="card sticky top-[76px] hidden max-h-[calc(100vh-96px)] w-72 shrink-0 overflow-y-auto p-4 lg:block">
        <h2 className="mb-4 text-sm font-semibold text-white">Фільтри</h2>
        <FiltersBody {...props} />
      </aside>
      <div className={clsx('fixed inset-0 z-40 lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!open}>
        <div className={clsx('absolute inset-0 bg-black/60 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
        <div
          role="dialog"
          aria-label="Фільтри"
          className={clsx(
            'absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col border-r border-white/10 bg-ink-900 shadow-2xl transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <h2 className="text-base font-semibold text-white">Фільтри</h2>
            <button className="btn-ghost -mr-2" onClick={onClose} aria-label="Закрити фільтри">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <FiltersBody {...props} />
          </div>
          <div className="border-t border-white/5 p-3">
            <button className="btn-primary w-full" onClick={onClose}>Показати результати</button>
          </div>
        </div>
      </div>
    </>
  );
}
