import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/settings.js';
import { evaluatePair } from './arbitrage.js';
import type { AssetInfo, ChainInfo, OrderBook, SpotMarket } from './types.js';

const now = 1_700_000_000_000;
const market = (exchange: SpotMarket['exchange'], bid: number, ask: number): SpotMarket => ({
  exchange,
  symbol: `ABC${exchange}`,
  base: 'ABC',
  quote: 'USDT',
  bestBid: bid,
  bestAsk: ask,
  last: (bid + ask) / 2,
  volume24hUsd: 1e6,
  ts: now,
});
const deepBook = (mid: number, levelUsd = 1000): OrderBook => ({
  asks: Array.from({ length: 20 }, (_, i) => [mid * (1.0005 + i * 0.001), levelUsd / mid] as [number, number]),
  bids: Array.from({ length: 20 }, (_, i) => [mid * (0.9995 - i * 0.001), levelUsd / mid] as [number, number]),
  ts: now,
});
const chain = (opts: Partial<ChainInfo> = {}): ChainInfo => ({
  network: 'TRX',
  rawChain: 'TRC20',
  contract: 'Tabc',
  depositEnabled: true,
  withdrawEnabled: true,
  withdrawFee: 0.5,
  ...opts,
});
const asset = (exchange: AssetInfo['exchange'], chains: ChainInfo[]): AssetInfo => ({ exchange, coin: 'ABC', chains });

const base = {
  buy: market('okx', 0.9995, 1.0005),
  sell: market('bybit', 1.0295, 1.0305),
  buyBook: deepBook(1),
  sellBook: deepBook(1.03),
  settings: DEFAULT_SETTINGS,
  now,
};

describe('статус переказу (withdraw/deposit)', () => {
  it('вивід закрито на біржі купівлі → «Недоступна для переказу», зв\'язка не робоча', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain({ withdrawEnabled: false })]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.networkStatus).toBe('suspended');
    expect(o.transfer.status).toBe('blocked');
    expect(o.transfer.legs).toEqual([expect.objectContaining({ network: 'TRX', withdrawEnabled: false, depositEnabled: true })]);
    expect(o.warnings.map((w) => w.code)).toContain('transfer_blocked');
    expect(o.warnings.find((w) => w.code === 'transfer_blocked')!.severity).toBe('block');
    expect(o.actionable).toBe(false);
    expect(o.profitStatus).toBe('preliminary');
    expect(o.notes.join(' ')).toMatch(/вивід з okx закрито/);
  });

  it('депозит закрито на біржі продажу → заблоковано', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain()]),
      sellAsset: asset('bybit', [chain({ depositEnabled: false })]),
    });
    expect(o.transfer.status).toBe('blocked');
    expect(o.actionable).toBe(false);
    expect(o.notes.join(' ')).toMatch(/депозит на bybit закрито/);
  });

  it('одна з двох мереж закрита → переказ відкритий через іншу, обидві ноги видно', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain({ withdrawEnabled: false }), chain({ network: 'ETH', rawChain: 'ERC20', contract: '0xabc', withdrawFee: 2 })]),
      sellAsset: asset('bybit', [chain(), chain({ network: 'ETH', rawChain: 'ERC20', contract: '0xabc' })]),
    });
    expect(o.transfer.status).toBe('open');
    expect(o.route?.network).toBe('ETH');
    expect(o.transfer.legs).toHaveLength(2);
    expect(o.actionable).toBe(true);
  });

  it('немає даних про мережі → статус переказу невідомий, але не заблокований', () => {
    const o = evaluatePair({ ...base });
    expect(o.transfer.status).toBe('unknown');
    expect(o.transfer.checkedAt).toBeNull();
    expect(o.warnings.map((w) => w.code)).toContain('fee_unknown');
  });

  it('час перевірки гаманців — найстаріший з двох бірж', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain()]),
      sellAsset: asset('bybit', [chain()]),
      assetInfoFetchedAt: { buy: now - 5000, sell: now - 1000 },
    });
    expect(o.transfer.checkedAt).toBe(now - 5000);
  });

  it('куплена кількість менша за мінімальний вивід → блокування', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain({ minWithdraw: 500 })]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.warnings.find((w) => w.code === 'below_min_withdraw')?.severity).toBe('block');
    expect(o.actionable).toBe(false);
  });
});

describe('VWAP і прослизання', () => {
  it('тонкий стакан: VWAP гірший за найкращі котирування, спред за VWAP менший', () => {
    const o = evaluatePair({
      ...base,
      buyBook: deepBook(1, 10),
      sellBook: deepBook(1.03, 10),
      buyAsset: asset('okx', [chain()]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.trade.buyVwap).toBeGreaterThan(o.buyPrice);
    expect(o.trade.sellVwap).toBeLessThan(o.sellPrice);
    expect(o.slippage.buySlippagePct).toBeGreaterThan(0);
    expect(o.slippage.sellSlippagePct).toBeGreaterThan(0);
    expect(o.slippage.vwapSpreadPct).toBeLessThan(o.spreadPct);
    expect(o.slippage.slippagePct).toBeCloseTo(o.spreadPct - o.slippage.vwapSpreadPct, 6);
    expect(o.costs.slippageUsd).toBeGreaterThan(0);
  });

  it('прослизання з\'їдає більшу частину спреду → попередження', () => {
    const o = evaluatePair({
      ...base,
      sell: market('bybit', 1.0095, 1.0105),
      buyBook: deepBook(1, 8),
      sellBook: deepBook(1.01, 8),
      buyAsset: asset('okx', [chain({ withdrawFee: 0 })]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.slippage.slippageShareOfSpreadPct).toBeGreaterThan(DEFAULT_SETTINGS.maxSlippageShareOfSpreadPct);
    expect(o.warnings.map((w) => w.code)).toContain('slippage_eats_spread');
  });

  it('глибокий стакан: прослизання майже нульове, попередження немає', () => {
    const o = evaluatePair({
      ...base,
      buyBook: deepBook(1, 100_000),
      sellBook: deepBook(1.03, 100_000),
      buyAsset: asset('okx', [chain()]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.slippage.slippagePct).toBeLessThan(0.01);
    expect(o.warnings.map((w) => w.code)).not.toContain('slippage_eats_spread');
    expect(o.actionable).toBe(true);
  });
});

describe('комісія мережі', () => {
  it('комісія мережі більша за спред на $100 → попередження і збиток', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain({ withdrawFee: 5 })]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.trade.networkFeeUsd).toBeCloseTo(5, 1);
    expect(o.costs.grossSpreadUsd).toBeCloseTo(2.9, 1);
    expect(o.costs.networkFeeShareOfSpreadPct).toBeGreaterThan(100);
    expect(o.trade.netProfitUsd).toBeLessThan(0);
    expect(o.warnings.map((w) => w.code)).toContain('network_fee_exceeds_spread');
    expect(o.actionable).toBe(false);
  });

  it('та сама зв\'язка на $1000 — прибуткова', () => {
    const o = evaluatePair({
      ...base,
      buyBook: deepBook(1, 10_000),
      sellBook: deepBook(1.03, 10_000),
      settings: { ...DEFAULT_SETTINGS, tradeSizeUsd: 1000 },
      buyAsset: asset('okx', [chain({ withdrawFee: 5 })]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.trade.netProfitUsd).toBeGreaterThan(0);
    expect(o.costs.networkFeeShareOfSpreadPct).toBeLessThan(100);
    expect(o.warnings.map((w) => w.code)).not.toContain('network_fee_exceeds_spread');
    expect(o.actionable).toBe(true);
  });

  it('комісії роблять угоду збитковою, хоча кожна окремо менша за спред', () => {
    const o = evaluatePair({
      ...base,
      sell: market('bybit', 1.0045, 1.0055),
      sellBook: deepBook(1.005),
      buyAsset: asset('okx', [chain({ withdrawFee: 0.3 })]),
      sellAsset: asset('bybit', [chain()]),
    });
    expect(o.trade.netProfitUsd).toBeLessThan(0);
    expect(o.warnings.map((w) => w.code)).toContain('unprofitable');
    expect(o.actionable).toBe(false);
  });
});

describe('волатильність (ризик однієї ноги)', () => {
  it('висока волатильність → попередження, але зв\'язка лишається робочою', () => {
    const o = evaluatePair({
      ...base,
      buyAsset: asset('okx', [chain()]),
      sellAsset: asset('bybit', [chain()]),
      volatility: { level: 'high', buyMovePct: 2.4, sellMovePct: -0.5, rangePct: 2.6, windowSec: 60, samples: 6 },
    });
    expect(o.volatility.level).toBe('high');
    expect(o.warnings.find((w) => w.code === 'high_volatility')?.severity).toBe('warn');
    expect(o.actionable).toBe(true);
  });

  it('без історії — рівень невідомий, без попередження', () => {
    const o = evaluatePair({ ...base, buyAsset: asset('okx', [chain()]), sellAsset: asset('bybit', [chain()]) });
    expect(o.volatility.level).toBe('unknown');
    expect(o.warnings.map((w) => w.code)).not.toContain('high_volatility');
  });
});
