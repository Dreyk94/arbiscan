import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { AlertsStack, Toast } from './components/AlertsStack';
import { EmptyState } from './components/EmptyState';
import { FiltersPanel } from './components/FiltersPanel';
import { Header } from './components/Header';
import { OpportunityTable } from './components/OpportunityTable';
import { StatusStrip } from './components/StatusStrip';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useNotifications } from './hooks/useNotifications';
import { useOpportunities } from './hooks/useOpportunities';
import { SORT_LABELS } from './lib/labels';
import { DEFAULT_FILTERS, type FilterState, type SortKey, activeFilterCount, applyFilters, collectNetworks, isAvailable, resetFilter } from './lib/filters';

export default function App() {
  const { data, error, loading, reload } = useOpportunities();
  const [filters, setFilters] = useLocalStorage<FilterState>('arbiscan.filters.v1', DEFAULT_FILTERS, (s) => ({ ...DEFAULT_FILTERS, ...s }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; action?: { label: string; onClick: () => void } } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sessionStart] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const all = useMemo(() => data?.opportunities ?? [], [data]);
  const result = useMemo(() => applyFilters(all, filters), [all, filters]);
  const networks = useMemo(() => collectNetworks(all), [all]);

  const openOpportunity = useCallback(
    (id: string) => {
      // Не змінюємо фільтри: якщо зв'язка прихована, лише повідомляємо про це.
      const visible = result.items.some((o) => o.id === id);
      if (visible) {
        setExpanded(id);
        setHighlight(id);
        window.setTimeout(() => setHighlight(null), 2600);
      } else {
        const exists = all.some((o) => o.id === id);
        setToast({
          text: exists ? 'Ця зв’язка зараз прихована вашими фільтрами.' : 'Ця зв’язка вже зникла з ринку.',
          action: exists ? { label: 'Скинути фільтри', onClick: () => { setFilters({ ...DEFAULT_FILTERS, sortKey: filters.sortKey, sortDir: filters.sortDir }); setToast(null); } } : undefined,
        });
      }
    },
    [result.items, all, filters.sortKey, filters.sortDir, setFilters],
  );

  const notify = useNotifications(data?.opportunities, data?.config.notifications, openOpportunity);

  const onSort = (k: SortKey) =>
    setFilters((f) => ({ ...f, sortKey: k, sortDir: f.sortKey === k ? (f.sortDir === 'desc' ? 'asc' : 'desc') : 'desc' }));

  const activeCount = activeFilterCount(filters);
  const suspiciousHidden = result.hiddenBy.showSuspicious ?? 0;

  return (
    <div className="min-h-screen">
      <Header
        meta={data?.meta}
        notifyEnabled={notify.enabled}
        notifyPermission={notify.permission}
        onToggleNotify={() => void notify.toggle()}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilters={activeCount}
      />
      <main className="mx-auto flex max-w-[1600px] gap-5 px-3 py-4 sm:px-6">
        <FiltersPanel filters={filters} onChange={setFilters} networks={networks} tradeSizeUsd={data?.config.tradeSizeUsd ?? 100} open={filtersOpen} onClose={() => setFiltersOpen(false)} />
        <section className="min-w-0 flex-1 space-y-3">
          <StatusStrip data={data} now={now} error={error} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-white">
              Зв’язки <span className="text-slate-500">{result.items.length}{result.total !== result.items.length ? ` з ${result.total}` : ''}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${filters.onlyAvailable ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
                title="Переказ відкритий у спільній мережі, стакан покриває угоду, без ознак підозри"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-500"
                  checked={filters.onlyAvailable}
                  onChange={(e) => setFilters((f) => ({ ...f, onlyAvailable: e.target.checked }))}
                />
                Лише доступні
                <span className="text-xs text-slate-400">({all.filter(isAvailable).length})</span>
              </label>
              {suspiciousHidden > 0 && !filters.showSuspicious && (
                <button className="chip-off" onClick={() => setFilters((f) => ({ ...f, showSuspicious: true }))} title="Різні контракти, аномальний спред або ціна-викид">
                  Приховано підозрілих: {suspiciousHidden}
                </button>
              )}
              {filters.networks.length > 0 && (
                <button className="chip-on" onClick={() => setFilters((f) => resetFilter(f, 'networks'))} title="Скинути фільтр мережі">
                  Мережі: {filters.networks.join(', ')} ✕
                </button>
              )}
              <label className="flex items-center gap-1.5 md:hidden">
                Сорт.:
                <select className="rounded-md border border-white/10 bg-ink-850 px-2 py-1 text-xs" value={filters.sortKey} onChange={(e) => onSort(e.target.value as SortKey)}>
                  {Object.entries(SORT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {loading && !data ? (
            <div className="card animate-pulse p-10 text-center text-sm text-slate-400">Завантаження даних сканера…</div>
          ) : result.items.length === 0 ? (
            <EmptyState
              result={result}
              meta={data?.meta}
              onReset={(k) => setFilters((f) => resetFilter(f, k))}
              onResetAll={() => setFilters({ ...DEFAULT_FILTERS, sortKey: filters.sortKey, sortDir: filters.sortDir })}
            />
          ) : (
            <OpportunityTable
              items={result.items}
              sortKey={filters.sortKey}
              sortDir={filters.sortDir}
              onSort={onSort}
              expanded={expanded}
              onToggle={(id) => setExpanded((e) => (e === id ? null : id))}
              highlight={highlight}
              now={now}
              newSince={sessionStart}
            />
          )}
          <p className="pt-2 text-[11px] leading-relaxed text-slate-500">
            Розрахунки орієнтовні та не є фінансовою порадою. «Перевірено» означає, що на момент сканування підтверджено глибину стакана і доступність переказу у спільній мережі з тим самим контрактом; ціни змінюються, тож прибуток ніколи не гарантований.
          </p>
        </section>
      </main>
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} onChanged={() => void reload()} />
      <AlertsStack alerts={notify.alerts} onDismiss={notify.dismiss} onOpen={openOpportunity} />
      {toast && <Toast text={toast.text} action={toast.action} onClose={() => setToast(null)} />}
    </div>
  );
}
