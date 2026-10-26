import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../config/settings.js';
import { evaluatePair, findPriceOutliers } from './arbitrage.js';
import type { AssetInfo, OrderBook, SpotMarket } from './types.js';

const now = 1_700_000_000_000;
const market = (exchange: SpotMarket['exchange'], bid: number, ask: number): SpotMarket => ({
  exchange,
  symbol: exchange === 'okx' ? 'ABC-USDT' : 'ABCUSDT',
  base: 'ABC',
  quote: 'USDT',
  bestBid: bid,
  bestAsk: ask,
  last: (bid + ask) / 2,
  volume24hUsd: 1e6,
  ts: now,
});
const deepBook = (mid: number): OrderBook => ({
  asks: Array.from({ length: 20 }, (_, i) => [mid * (1.0005 + i * 0.001), 1000 / mid] as [number, number]),
  bids: Array.from({ length: 20 }, (_, i) => [mid * (0.9995 - i * 0.001), 1000 / mid] as [number, number]),
  ts: now,
});
const asset = (exchange: AssetInfo['exchange'], contract?: string, opts: Partial<AssetInfo['chains'][0]> = {}): AssetInfo => ({
  exchange,
  coin: 'ABC',
  chains: [{ network: 'ETH', rawChain: 'ERC20', contract, depositEnabled: true, withdrawEnabled: true, withdrawFee: 0.5, ...opts }],
});

describe('evaluatePair', () => {
  it('підтверджений прибуток: стакан і мережа перевірені', () => {
    const o = evaluatePair({
      buy: market('okx', 0.9995, 1.0005),
      sell: market('bitget', 1.0295, 1.0305),
      buyBook: deepBook(1),
      sellBook: deepBook(1.03),
      buyAsset: asset('okx', '0xabc'),
      sellAsset: asset('bitget', '0xABC'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.orderbookStatus).toBe('verified');
    expect(o.networkStatus).toBe('verified');
    expect(o.profitStatus).toBe('confirmed');
    expect(o.trade.enough).toBe(true);
    expect(o.trade.netProfitUsd).toBeGreaterThan(0);
    // комісії обох бірж і мережі враховані
    expect(o.trade.buyFeeUsd).toBeCloseTo(0.1, 2);
    expect(o.trade.networkFeeUsd).toBeCloseTo(0.5, 2);
    expect(o.trade.netProfitUsd).toBeLessThan(((o.sellPrice - o.buyPrice) / o.buyPrice) * 100);
    expect(o.buyDepthUsd).toBeGreaterThan(1000);
  });

  it('без стакана — прибуток попередній', () => {
    const o = evaluatePair({
      buy: market('okx', 0.99, 1),
      sell: market('bybit', 1.05, 1.06),
      buyAsset: asset('okx', '0xabc'),
      sellAsset: asset('bybit', '0xabc'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.orderbookStatus).toBe('unverified');
    expect(o.trade.enough).toBeNull();
    expect(o.profitStatus).toBe('preliminary');
  });

  it('без даних про мережу — прибуток попередній', () => {
    const o = evaluatePair({
      buy: market('okx', 0.9995, 1.0005),
      sell: market('bitget', 1.0295, 1.0305),
      buyBook: deepBook(1),
      sellBook: deepBook(1.03),
      sellAsset: asset('bitget', '0xabc'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.networkStatus).toBe('unverified');
    expect(o.profitStatus).toBe('preliminary');
  });

  it('різні контракти з однаковим тикером — підозріла зв’язка', () => {
    const o = evaluatePair({
      buy: market('okx', 0.9995, 1.0005),
      sell: market('bybit', 1.0295, 1.0305),
      buyBook: deepBook(1),
      sellBook: deepBook(1.03),
      buyAsset: asset('okx', '0xaaa'),
      sellAsset: asset('bybit', '0xbbb'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.networkStatus).toBe('mismatch');
    expect(o.suspicious).toBe(true);
    expect(o.suspiciousReasons).toContain('contract_mismatch');
    expect(o.profitStatus).toBe('preliminary');
  });

  it('аномальний спред — підозріла зв’язка', () => {
    const o = evaluatePair({
      buy: market('okx', 0.9995, 1.0005),
      sell: market('bybit', 1.6, 1.61),
      buyBook: deepBook(1),
      sellBook: deepBook(1.605),
      buyAsset: asset('okx', '0xabc'),
      sellAsset: asset('bybit', '0xabc'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.suspiciousReasons).toContain('abnormal_spread');
    expect(o.profitStatus).toBe('preliminary');
  });

  it('вивід призупинено — мережа suspended', () => {
    const o = evaluatePair({
      buy: market('okx', 0.9995, 1.0005),
      sell: market('bybit', 1.0295, 1.0305),
      buyBook: deepBook(1),
      sellBook: deepBook(1.03),
      buyAsset: asset('okx', '0xabc', { withdrawEnabled: false }),
      sellAsset: asset('bybit', '0xabc'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.networkStatus).toBe('suspended');
    expect(o.profitStatus).toBe('preliminary');
  });

  it('тонкий стакан — недостатньо для $100', () => {
    const thin: OrderBook = { asks: [[1, 10]], bids: [[1.03, 10]], ts: now };
    const o = evaluatePair({
      buy: market('okx', 0.99, 1),
      sell: market('bybit', 1.03, 1.04),
      buyBook: thin,
      sellBook: thin,
      buyAsset: asset('okx', '0xabc'),
      sellAsset: asset('bybit', '0xabc'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(o.orderbookStatus).toBe('insufficient');
    expect(o.trade.enough).toBe(false);
  });

  it('тонкий стакан продажу — прибуток лише на реально виконуваний обсяг', () => {
    const o = evaluatePair({
      buy: market('okx', 0.99, 1),
      sell: market('bybit', 1.1, 1.11),
      buyBook: { asks: [[1, 10_000]], bids: [[0.99, 10_000]], ts: now },
      sellBook: { asks: [[1.11, 10_000]], bids: [[1.1, 20], [0.5, 1000]], ts: now },
      buyAsset: asset('okx', '0xabc'),
      sellAsset: asset('bybit', '0xabc'),
      settings: { ...DEFAULT_SETTINGS, depthWindowPct: 2 },
      now,
    });
    expect(o.trade.enough).toBe(true);
    const thinOnly = evaluatePair({
      buy: market('okx', 0.99, 1),
      sell: market('bybit', 1.1, 1.11),
      buyBook: { asks: [[1, 10_000]], bids: [[0.99, 10_000]], ts: now },
      sellBook: { asks: [[1.11, 10_000]], bids: [[1.1, 20]], ts: now },
      buyAsset: asset('okx', '0xabc'),
      sellAsset: asset('bybit', '0xabc'),
      settings: DEFAULT_SETTINGS,
      now,
    });
    expect(thinOnly.trade.enough).toBe(false);
    expect(thinOnly.trade.spentUsd).toBeLessThan(25);
    expect(thinOnly.trade.receivedUsd).toBeLessThanOrEqual(22);
  });
});

describe('findPriceOutliers', () => {
  it('знаходить біржу з аномальною ціною', () => {
    const out = findPriceOutliers([market('okx', 1, 1.001), market('bybit', 1.001, 1.002), market('bitget', 1.6, 1.61)], 15);
    expect([...out]).toEqual(['bitget']);
  });
});
