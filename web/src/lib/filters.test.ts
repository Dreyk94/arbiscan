import { describe, expect, it } from 'vitest';
import type { Opportunity } from '../types';
import { DEFAULT_FILTERS, applyFilters, resetFilter } from './filters';

const opp = (p: Partial<Opportunity>): Opportunity =>
  ({
    id: p.id ?? 'X',
    base: 'X',
    buyExchange: 'okx',
    sellExchange: 'bybit',
    buySymbol: 'X-USDT',
    sellSymbol: 'XUSDT',
    buyPrice: 1,
    sellPrice: 1.02,
    spreadPct: 2,
    buyDepthUsd: 1000,
    sellDepthUsd: 1000,
    maxProfitableUsd: 500,
    maxProfitUsd: 5,
    trade: { targetUsd: 100, enough: true, netProfitUsd: 1, netProfitPct: 1 } as Opportunity['trade'],
    orderbookStatus: 'verified',
    networkStatus: 'verified',
    profitStatus: 'confirmed',
    networks: ['SOL'],
    suspicious: false,
    suspiciousReasons: [],
    notes: [],
    transfer: { status: 'open', legs: [], checkedAt: 1 },
    slippage: { buySlippagePct: 0, sellSlippagePct: 0, vwapSpreadPct: 2, slippagePct: 0, slippageShareOfSpreadPct: 0 },
    costs: { grossSpreadUsd: 2, slippageUsd: 0, tradingFeesUsd: 0.2, networkFeeUsd: 0.5, networkFeeShareOfSpreadPct: 25, netProfitUsd: 1 },
    volatility: { level: 'low', buyMovePct: 0, sellMovePct: 0, rangePct: 0, windowSec: 60, samples: 6 },
    warnings: [],
    actionable: true,
    volume24hUsd: 1e6,
    firstSeenAt: 1,
    lastSeenAt: 1,
    seenCount: 1,
    updatedAt: 1,
    ...p,
  }) as Opportunity;

describe('applyFilters', () => {
  const list = [
    opp({ id: 'a', networks: ['SOL'], spreadPct: 3, firstSeenAt: 5 }),
    opp({ id: 'b', networks: ['ETH'], spreadPct: 1, firstSeenAt: 10 }),
    opp({ id: 'c', networks: [], networkStatus: 'unverified', profitStatus: 'preliminary' }),
    opp({ id: 'd', suspicious: true, suspiciousReasons: ['abnormal_spread'], spreadPct: 60 }),
  ];

  it('за замовчуванням фільтр мережі нічого не приховує, підозрілі приховані', () => {
    const r = applyFilters(list, DEFAULT_FILTERS);
    expect(r.items.map((o) => o.id)).toEqual(['a', 'c', 'b']);
    expect(r.hiddenBy).toEqual({ showSuspicious: 1 });
  });

  it('фільтр мережі пояснює, скільки зв’язок приховано, і не ховає неперевірені за замовчуванням', () => {
    const r = applyFilters(list, { ...DEFAULT_FILTERS, networks: ['TRX'] });
    expect(r.items.map((o) => o.id)).toEqual(['c']);
    expect(r.hiddenBy.networks).toBe(3);
    const strict = applyFilters(list, { ...DEFAULT_FILTERS, networks: ['TRX'], includeUnverifiedNetworks: false });
    expect(strict.items).toHaveLength(0);
    expect(resetFilter({ ...DEFAULT_FILTERS, networks: ['TRX'] }, 'networks').networks).toEqual([]);
  });

  it('сортування за новизною', () => {
    const r = applyFilters(list, { ...DEFAULT_FILTERS, sortKey: 'novelty', sortDir: 'desc' });
    expect(r.items[0].id).toBe('b');
  });
});
