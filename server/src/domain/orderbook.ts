import type { BookLevel } from './types.js';

const EPS = 1e-9;

export interface BuyFill {
  spentUsd: number;
  qty: number;
  vwap: number;
  complete: boolean;
}

export interface SellFill {
  soldQty: number;
  receivedUsd: number;
  vwap: number;
  complete: boolean;
}

export function sortAsks(levels: BookLevel[]): BookLevel[] {
  return levels.filter(validLevel).sort((a, b) => a[0] - b[0]);
}

export function sortBids(levels: BookLevel[]): BookLevel[] {
  return levels.filter(validLevel).sort((a, b) => b[0] - a[0]);
}

function validLevel(l: BookLevel): boolean {
  return Number.isFinite(l[0]) && Number.isFinite(l[1]) && l[0] > 0 && l[1] > 0;
}

/** Купівля на суму usd, проходячи стакан asks (відсортований за зростанням ціни). */
export function simulateBuy(asks: BookLevel[], usd: number): BuyFill {
  let remaining = usd;
  let spent = 0;
  let qty = 0;
  for (const [price, size] of asks) {
    if (remaining <= EPS) break;
    const levelUsd = price * size;
    const takeUsd = Math.min(levelUsd, remaining);
    spent += takeUsd;
    qty += takeUsd / price;
    remaining -= takeUsd;
  }
  return { spentUsd: spent, qty, vwap: qty > 0 ? spent / qty : 0, complete: remaining <= usd * 1e-6 + EPS };
}

/** Продаж qty монет, проходячи стакан bids (відсортований за спаданням ціни). */
export function simulateSell(bids: BookLevel[], qty: number): SellFill {
  let remaining = qty;
  let sold = 0;
  let received = 0;
  for (const [price, size] of bids) {
    if (remaining <= EPS) break;
    const take = Math.min(size, remaining);
    sold += take;
    received += take * price;
    remaining -= take;
  }
  return { soldQty: sold, receivedUsd: received, vwap: sold > 0 ? received / sold : 0, complete: remaining <= qty * 1e-6 + EPS };
}

/** Сума asks (USD) з ціною не вище за best * (1 + windowPct/100). */
export function askDepthUsd(asks: BookLevel[], windowPct: number): number {
  if (!asks.length) return 0;
  const limit = asks[0][0] * (1 + windowPct / 100);
  let total = 0;
  for (const [p, q] of asks) {
    if (p > limit) break;
    total += p * q;
  }
  return total;
}

/** Сума bids (USD) з ціною не нижче за best * (1 - windowPct/100). */
export function bidDepthUsd(bids: BookLevel[], windowPct: number): number {
  if (!bids.length) return 0;
  const limit = bids[0][0] * (1 - windowPct / 100);
  let total = 0;
  for (const [p, q] of bids) {
    if (p < limit) break;
    total += p * q;
  }
  return total;
}

export interface CrossWalkResult {
  /** Витрачено на купівлю (USD) на прибутковій частині стаканів */
  buyUsd: number;
  /** Отримано від продажу (USD) після комісій */
  sellUsd: number;
  qty: number;
}

/**
 * Одночасно проходимо asks біржі купівлі та bids біржі продажу, поки граничний
 * спред після торгових комісій залишається позитивним. Результат — максимальний
 * обсяг, який має сенс виконувати (без урахування фіксованої комісії мережі).
 */
export function crossWalk(asks: BookLevel[], bids: BookLevel[], buyFee: number, sellFee: number): CrossWalkResult {
  let i = 0;
  let j = 0;
  let askLeft = asks[0]?.[1] ?? 0;
  let bidLeft = bids[0]?.[1] ?? 0;
  let buyUsd = 0;
  let sellUsd = 0;
  let qty = 0;
  while (i < asks.length && j < bids.length) {
    const ask = asks[i][0];
    const bid = bids[j][0];
    const effectiveCost = ask / (1 - buyFee);
    const effectiveProceeds = bid * (1 - sellFee);
    if (effectiveProceeds <= effectiveCost) break;
    const take = Math.min(askLeft, bidLeft / (1 - buyFee));
    buyUsd += take * ask;
    const receivedQty = take * (1 - buyFee);
    sellUsd += receivedQty * bid * (1 - sellFee);
    qty += take;
    askLeft -= take;
    bidLeft -= take * (1 - buyFee);
    if (askLeft <= EPS) {
      i++;
      askLeft = asks[i]?.[1] ?? 0;
    }
    if (bidLeft <= EPS) {
      j++;
      bidLeft = bids[j]?.[1] ?? 0;
    }
  }
  return { buyUsd, sellUsd, qty };
}
