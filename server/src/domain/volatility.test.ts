import { describe, expect, it } from 'vitest';
import { assessVolatility, PriceHistory } from './volatility.js';

const T = { windowSec: 60, warnPct: 0.8, highPct: 2 };

describe('PriceHistory', () => {
  it('рахує зміну і розмах лише у вікні', () => {
    const h = new PriceHistory();
    const t0 = 1_000_000;
    h.record('okx:A', 100, t0 - 120_000); // поза вікном
    h.record('okx:A', 100, t0 - 50_000);
    h.record('okx:A', 103, t0 - 30_000);
    h.record('okx:A', 101, t0);
    const m = h.move('okx:A', t0, 60_000);
    expect(m.samples).toBe(3);
    expect(m.changePct).toBeCloseTo(1, 6);
    expect(m.rangePct).toBeCloseTo(3, 6);
  });

  it('менше двох точок → без руху', () => {
    const h = new PriceHistory();
    h.record('k', 5, 0);
    expect(h.move('k', 0, 60_000)).toEqual({ changePct: 0, rangePct: 0, samples: 1 });
    expect(h.move('none', 0, 60_000).samples).toBe(0);
  });

  it('prune видаляє застарілі ринки', () => {
    const h = new PriceHistory(10_000);
    h.record('k', 1, 0);
    h.record('k', 1, 1000);
    h.prune(20_000);
    expect(h.move('k', 20_000, 60_000).samples).toBe(0);
  });
});

describe('assessVolatility', () => {
  const move = (changePct: number, rangePct: number, samples = 6) => ({ changePct, rangePct, samples });

  it('low / medium / high за порогами', () => {
    expect(assessVolatility(move(0.1, 0.2), move(-0.1, 0.3), T).level).toBe('low');
    expect(assessVolatility(move(0.5, 1.0), move(0, 0.2), T).level).toBe('medium');
    expect(assessVolatility(move(0.1, 0.2), move(-2.5, 2.6), T).level).toBe('high');
  });

  it('недостатньо точок → unknown', () => {
    const v = assessVolatility(move(0, 0, 1), move(0, 0, 6), T);
    expect(v.level).toBe('unknown');
    expect(v.samples).toBe(1);
  });

  it('rangePct — максимум з розмахів і зміщень обох бірж', () => {
    const v = assessVolatility(move(1.5, 0.5), move(0.1, 0.9), T);
    expect(v.rangePct).toBe(1.5);
    expect(v.buyMovePct).toBe(1.5);
    expect(v.sellMovePct).toBe(0.1);
  });
});
