import { describe, expect, it } from 'vitest';
import { askDepthUsd, bidDepthUsd, crossWalk, simulateBuy, simulateSell, sortAsks, sortBids } from './orderbook.js';
import type { BookLevel } from './types.js';

const asks: BookLevel[] = [
  [100, 0.5],
  [101, 1],
  [103, 10],
];
const bids: BookLevel[] = [
  [105, 0.3],
  [104, 1],
  [99, 10],
];

describe('orderbook', () => {
  it('купівля проходить кілька рівнів стакана', () => {
    const f = simulateBuy(asks, 100);
    expect(f.complete).toBe(true);
    expect(f.spentUsd).toBeCloseTo(100);
    // 50$ на рівні 100 (0.5) + 50$ на рівні 101
    expect(f.qty).toBeCloseTo(0.5 + 50 / 101, 8);
  });

  it('неповне виконання, якщо стакан тонкий', () => {
    const f = simulateBuy([[10, 1]], 100);
    expect(f.complete).toBe(false);
    expect(f.spentUsd).toBe(10);
  });

  it('продаж проходить bids за спаданням', () => {
    const f = simulateSell(bids, 1);
    expect(f.complete).toBe(true);
    expect(f.receivedUsd).toBeCloseTo(0.3 * 105 + 0.7 * 104);
  });

  it('глибина у вікні', () => {
    expect(askDepthUsd(asks, 1.5)).toBeCloseTo(50 + 101);
    expect(bidDepthUsd(bids, 1)).toBeCloseTo(0.3 * 105 + 104);
  });

  it('сортування і відкидання некоректних рівнів', () => {
    expect(sortAsks([[2, 1], [1, 1], [0, 5], [3, NaN]])).toEqual([[1, 1], [2, 1]]);
    expect(sortBids([[1, 1], [2, 1]])).toEqual([[2, 1], [1, 1]]);
  });

  it('crossWalk зупиняється, коли граничний спред після комісій стає від’ємним', () => {
    const r = crossWalk(asks, bids, 0.001, 0.001);
    // Прибутково: asks 100,101 проти bids 105,104; 103 vs 99 — ні
    expect(r.buyUsd).toBeGreaterThan(0);
    expect(r.buyUsd).toBeLessThanOrEqual(50 + 101 + 1e-9);
    expect(r.sellUsd).toBeGreaterThan(r.buyUsd);
  });
});
