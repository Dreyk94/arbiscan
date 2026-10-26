import type { ExchangeId, Opportunity } from '../types';

export type SortKey = 'spread' | 'profit' | 'price' | 'novelty' | 'popularity' | 'liquidity';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
  search: string;
  buyExchanges: ExchangeId[];
  sellExchanges: ExchangeId[];
  /** Порожній масив = усі мережі (фільтр мережі вимкнено) */
  networks: string[];
  /** Чи показувати зв'язки, мережу яких не вдалося перевірити, коли обрано мережі */
  includeUnverifiedNetworks: boolean;
  minSpreadPct: number;
  onlyProfitable: boolean;
  onlyEnoughLiquidity: boolean;
  onlyConfirmed: boolean;
  onlyOpenTransfer: boolean;
  /** Лише реально доступні: переказ відкритий, стакан достатній, не підозріла */
  onlyAvailable: boolean;
  showSuspicious: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
}

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  buyExchanges: [],
  sellExchanges: [],
  networks: [],
  includeUnverifiedNetworks: true,
  minSpreadPct: 0,
  onlyProfitable: false,
  onlyEnoughLiquidity: false,
  onlyConfirmed: false,
  onlyOpenTransfer: false,
  onlyAvailable: false,
  showSuspicious: false,
  sortKey: 'spread',
  sortDir: 'desc',
};

export type FilterKey =
  | 'search'
  | 'buyExchanges'
  | 'sellExchanges'
  | 'networks'
  | 'minSpreadPct'
  | 'onlyProfitable'
  | 'onlyEnoughLiquidity'
  | 'onlyConfirmed'
  | 'onlyOpenTransfer'
  | 'onlyAvailable'
  | 'showSuspicious';

export const FILTER_LABELS: Record<FilterKey, string> = {
  search: 'Пошук за тикером',
  buyExchanges: 'Біржа купівлі',
  sellExchanges: 'Біржа продажу',
  networks: 'Мережа переказу',
  minSpreadPct: 'Мінімальний спред',
  onlyProfitable: 'Лише прибуткові після комісій',
  onlyEnoughLiquidity: 'Лише з достатньою ліквідністю',
  onlyConfirmed: 'Лише перевірені стакан і мережа',
  onlyOpenTransfer: 'Лише з відкритим переказом',
  onlyAvailable: 'Лише доступні зв’язки',
  showSuspicious: 'Підозрілі зв’язки приховано',
};

const PREDICATES: Record<FilterKey, (o: Opportunity, f: FilterState) => boolean> = {
  search: (o, f) => !f.search.trim() || o.base.toLowerCase().includes(f.search.trim().toLowerCase()),
  buyExchanges: (o, f) => !f.buyExchanges.length || f.buyExchanges.includes(o.buyExchange),
  sellExchanges: (o, f) => !f.sellExchanges.length || f.sellExchanges.includes(o.sellExchange),
  networks: (o, f) => {
    if (!f.networks.length) return true;
    if (o.networkStatus === 'unverified' && f.includeUnverifiedNetworks) return true;
    return o.networks.some((n) => f.networks.includes(n));
  },
  minSpreadPct: (o, f) => o.spreadPct >= f.minSpreadPct,
  onlyProfitable: (o, f) => !f.onlyProfitable || o.trade.netProfitUsd > 0,
  onlyEnoughLiquidity: (o, f) => !f.onlyEnoughLiquidity || o.trade.enough === true,
  onlyConfirmed: (o, f) => !f.onlyConfirmed || o.profitStatus === 'confirmed',
  onlyOpenTransfer: (o, f) => !f.onlyOpenTransfer || o.transfer.status === 'open',
  onlyAvailable: (o, f) => !f.onlyAvailable || isAvailable(o),
  showSuspicious: (o, f) => f.showSuspicious || !o.suspicious,
};

export interface FilterResult {
  items: Opportunity[];
  total: number;
  /** Скільки зв'язок приховує кожен фільтр окремо (для пояснення порожнього списку) */
  hiddenBy: Partial<Record<FilterKey, number>>;
}

export function applyFilters(list: Opportunity[], f: FilterState): FilterResult {
  const hiddenBy: Partial<Record<FilterKey, number>> = {};
  const items: Opportunity[] = [];
  const keys = Object.keys(PREDICATES) as FilterKey[];
  for (const o of list) {
    let pass = true;
    for (const k of keys) {
      if (!PREDICATES[k](o, f)) {
        hiddenBy[k] = (hiddenBy[k] ?? 0) + 1;
        pass = false;
      }
    }
    if (pass) items.push(o);
  }
  return { items: sortOpportunities(items, f.sortKey, f.sortDir), total: list.length, hiddenBy };
}

const SORTERS: Record<SortKey, (o: Opportunity) => number> = {
  spread: (o) => o.spreadPct,
  profit: (o) => o.trade.netProfitUsd,
  price: (o) => o.buyPrice,
  novelty: (o) => o.firstSeenAt,
  popularity: (o) => o.volume24hUsd,
  liquidity: (o) => Math.min(o.buyDepthUsd, o.sellDepthUsd),
};

export function sortOpportunities(list: Opportunity[], key: SortKey, dir: SortDir): Opportunity[] {
  const get = SORTERS[key];
  const m = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => (get(a) - get(b)) * m || b.spreadPct - a.spreadPct || a.id.localeCompare(b.id));
}

/** Повертає фільтр до значення за замовчуванням (для кнопок «скинути» у поясненні). */
export function resetFilter(f: FilterState, key: FilterKey): FilterState {
  const next = { ...f };
  switch (key) {
    case 'networks':
      next.networks = [];
      next.includeUnverifiedNetworks = true;
      break;
    default:
      (next as Record<string, unknown>)[key] = DEFAULT_FILTERS[key];
  }
  return next;
}

export function activeFilterCount(f: FilterState): number {
  return (Object.keys(PREDICATES) as FilterKey[]).filter((k) => JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k])).length;
}

export function collectNetworks(list: Opportunity[]): Array<{ network: string; count: number }> {
  const counts = new Map<string, number>();
  for (const o of list) for (const n of o.networks) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].map(([network, count]) => ({ network, count })).sort((a, b) => b.count - a.count || a.network.localeCompare(b.network));
}

/** Зв'язку реально можна виконати: переказ відкритий у спільній мережі, обидва стакани покривають угоду, без ознак підозри, прибуток після всіх витрат додатний. */
export function isAvailable(o: Opportunity): boolean {
  return o.actionable && o.transfer.status === 'open' && o.orderbookStatus === 'verified';
}

/** Зв'язку не можна подавати як робочу: переказ заблоковано або є блокувальне попередження. */
export function isBlocked(o: Opportunity): boolean {
  return o.transfer.status === 'blocked' || o.warnings.some((w) => w.severity === 'block');
}
