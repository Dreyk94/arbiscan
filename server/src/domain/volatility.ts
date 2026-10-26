import type { VolatilityInfo, VolatilityLevel } from './types.js';

export interface VolatilityThresholds {
  windowSec: number;
  /** Розмах ціни за вікно, від якого зв'язка позначається як помірно волатильна, % */
  warnPct: number;
  /** Розмах ціни за вікно, від якого попереджаємо про високий ризик однієї ноги, % */
  highPct: number;
}

export interface PriceMove {
  /** Зміна останньої ціни відносно першої у вікні, % */
  changePct: number;
  /** (max - min) / min у вікні, % */
  rangePct: number;
  samples: number;
}

interface Sample {
  ts: number;
  price: number;
}

/** Коротка історія mid-цін по ринках для оцінки руху за останню хвилину. */
export class PriceHistory {
  private readonly series = new Map<string, Sample[]>();

  constructor(private readonly maxAgeMs = 5 * 60_000) {}

  record(key: string, price: number, now: number): void {
    if (!(price > 0)) return;
    const list = this.series.get(key) ?? [];
    list.push({ ts: now, price });
    const cutoff = now - this.maxAgeMs;
    while (list.length && list[0].ts < cutoff) list.shift();
    this.series.set(key, list);
  }

  move(key: string, now: number, windowMs: number): PriceMove {
    const list = (this.series.get(key) ?? []).filter((s) => s.ts >= now - windowMs);
    if (list.length < 2) return { changePct: 0, rangePct: 0, samples: list.length };
    let min = Infinity;
    let max = -Infinity;
    for (const s of list) {
      if (s.price < min) min = s.price;
      if (s.price > max) max = s.price;
    }
    const first = list[0].price;
    const last = list[list.length - 1].price;
    return {
      changePct: ((last - first) / first) * 100,
      rangePct: ((max - min) / min) * 100,
      samples: list.length,
    };
  }

  /** Видаляє ринки, для яких давно не було оновлень. */
  prune(now: number): void {
    for (const [key, list] of this.series) {
      if (!list.length || now - list[list.length - 1].ts > this.maxAgeMs) this.series.delete(key);
    }
  }

  clear(): void {
    this.series.clear();
  }
}

export function assessVolatility(buy: PriceMove, sell: PriceMove, t: VolatilityThresholds): VolatilityInfo {
  const samples = Math.min(buy.samples, sell.samples);
  const rangePct = Math.max(buy.rangePct, sell.rangePct, Math.abs(buy.changePct), Math.abs(sell.changePct));
  let level: VolatilityLevel;
  if (samples < 2) level = 'unknown';
  else if (rangePct >= t.highPct) level = 'high';
  else if (rangePct >= t.warnPct) level = 'medium';
  else level = 'low';
  return {
    level,
    buyMovePct: buy.changePct,
    sellMovePct: sell.changePct,
    rangePct,
    windowSec: t.windowSec,
    samples,
  };
}

export const UNKNOWN_VOLATILITY = (windowSec: number): VolatilityInfo => ({
  level: 'unknown',
  buyMovePct: 0,
  sellMovePct: 0,
  rangePct: 0,
  windowSec,
  samples: 0,
});
