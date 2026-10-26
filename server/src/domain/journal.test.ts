import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/settings.js';
import { evaluatePair } from './arbitrage.js';
import { Journal, journalToCsv, verdictOf } from './journal.js';
import type { AssetInfo, Opportunity, OrderBook, SpotMarket } from './types.js';

const now = 1_700_000_000_000;
const market = (exchange: SpotMarket['exchange'], bid: number, ask: number): SpotMarket => ({
  exchange, symbol: `ABC${exchange}`, base: 'ABC', quote: 'USDT', bestBid: bid, bestAsk: ask, last: (bid + ask) / 2, volume24hUsd: 1e6, ts: now,
});
const book = (mid: number): OrderBook => ({
  asks: Array.from({ length: 20 }, (_, i) => [mid * (1.0005 + i * 0.001), 1000 / mid] as [number, number]),
  bids: Array.from({ length: 20 }, (_, i) => [mid * (0.9995 - i * 0.001), 1000 / mid] as [number, number]),
  ts: now,
});
const asset = (exchange: AssetInfo['exchange'], withdrawEnabled = true): AssetInfo => ({
  exchange, coin: 'ABC', chains: [{ network: 'ETH', rawChain: 'ERC20', contract: '0xabc', depositEnabled: true, withdrawEnabled, withdrawFee: 0.5 }],
});

function opp(spreadPct: number, opts: { blocked?: boolean; sellEx?: SpotMarket['exchange']; at?: number } = {}): Opportunity {
  const sellMid = 1 + spreadPct / 100;
  const t = opts.at ?? now;
  const e = evaluatePair({
    buy: market('okx', 0.9995, 1.0005),
    sell: market(opts.sellEx ?? 'bybit', sellMid - 0.0005, sellMid + 0.0005),
    buyBook: book(1),
    sellBook: book(sellMid),
    buyAsset: asset('okx', !opts.blocked),
    sellAsset: asset(opts.sellEx ?? 'bybit'),
    settings: DEFAULT_SETTINGS,
    now: t,
  });
  return { ...e, firstSeenAt: t, lastSeenAt: t, seenCount: 1 };
}

const opts = { minSpreadPct: 2, maxEntries: 5000 };

describe('Journal', () => {
  it('записує лише спреди від порога, оновлює максимум і закриває при зникненні', () => {
    const saved: unknown[] = [];
    const j = new Journal([], (e) => saved.push(e.length));
    j.observe([opp(3), opp(1.5, { sellEx: 'gate' })], now, opts);
    expect(j.list()).toHaveLength(1);
    const first = j.list()[0];
    expect(first.spreadPct).toBeCloseTo(2.9, 1);
    expect(first.closedAt).toBeNull();
    expect(first.buyExchange).toBe('okx');
    expect(first.orderbookStatus).toBe('verified');
    expect(first.transferStatus).toBe('open');
    expect(first.verdict).toBe('actionable');

    j.observe([opp(4, { at: now + 10_000 })], now + 10_000, opts);
    const touched = j.list()[0];
    expect(j.list()).toHaveLength(1);
    expect(touched.seenCount).toBe(2);
    expect(touched.maxSpreadPct).toBeGreaterThan(3.8);
    expect(touched.spreadPct).toBeCloseTo(2.9, 1);

    j.observe([], now + 20_000, opts);
    expect(j.list()[0].closedAt).toBe(now + 20_000);
    expect(j.stats().active).toBe(0);

    // нова поява — новий запис
    j.observe([opp(2.5, { at: now + 30_000 })], now + 30_000, opts);
    expect(j.list()).toHaveLength(2);
    expect(saved.length).toBeGreaterThan(0);
  });

  it('падіння нижче порога закриває запис', () => {
    const j = new Journal();
    j.observe([opp(3)], now, opts);
    j.observe([opp(1)], now + 1000, opts);
    expect(j.list()[0].closedAt).toBe(now + 1000);
  });

  it('вердикт і хибні сигнали: заблокований переказ ніколи не був робочим', () => {
    const j = new Journal();
    j.observe([opp(3, { blocked: true }), opp(3, { sellEx: 'gate' })], now, opts);
    const s = j.stats();
    expect(s.total).toBe(2);
    expect(s.byVerdict.blocked).toBe(1);
    expect(s.byVerdict.actionable).toBe(1);
    expect(s.falseSignalPct).toBe(50);
    expect(j.list({ verdict: 'blocked' })[0].warnings).toContain('transfer_blocked');
  });

  it('обмеження кількості записів видаляє найстаріші закриті', () => {
    const j = new Journal();
    const small = { minSpreadPct: 2, maxEntries: 100 };
    for (let i = 0; i < 3; i++) {
      j.observe([opp(3, { at: now + i * 1000 })], now + i * 1000, small);
      j.observe([], now + i * 1000 + 500, small);
    }
    expect(j.list()).toHaveLength(3);
    j.observe([opp(3, { at: now + 9000 })], now + 9000, { minSpreadPct: 2, maxEntries: 2 });
    expect(j.list()).toHaveLength(2);
    expect(j.list()[0].closedAt).toBeNull();
  });

  it('відновлює активні записи з попереднього запуску', () => {
    const j1 = new Journal();
    j1.observe([opp(3)], now, opts);
    const j2 = new Journal(j1.list());
    j2.observe([opp(3.5, { at: now + 1000 })], now + 1000, opts);
    expect(j2.list()).toHaveLength(1);
    expect(j2.list()[0].seenCount).toBe(2);
  });

  it('CSV містить заголовок і всі записи', () => {
    const j = new Journal();
    j.observe([opp(3)], now, opts);
    const csv = journalToCsv(j.list());
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('first_seen,last_seen');
    expect(lines[1]).toContain('okx,bybit');
  });

  it('verdictOf: збиткова і підозріла', () => {
    const o = opp(3);
    expect(verdictOf({ ...o, suspicious: true })).toBe('suspicious');
    expect(verdictOf({ ...o, trade: { ...o.trade, netProfitUsd: -1 } })).toBe('unprofitable');
    expect(verdictOf({ ...o, profitStatus: 'preliminary' })).toBe('unverified');
  });
});
