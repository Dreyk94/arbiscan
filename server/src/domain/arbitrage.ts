import type { Settings } from '../config/settings.js';
import { askDepthUsd, bidDepthUsd, crossWalk, simulateBuy, simulateSell, sortAsks, sortBids } from './orderbook.js';
import type {
  AssetInfo,
  BookLevel,
  Opportunity,
  OrderBook,
  OrderbookStatus,
  SpotMarket,
  SuspiciousReason,
  TradeSimulation,
} from './types.js';
import { verifyTransfer } from './verification.js';

export interface PairInput {
  buy: SpotMarket;
  sell: SpotMarket;
  buyBook?: OrderBook;
  sellBook?: OrderBook;
  buyAsset?: AssetInfo;
  sellAsset?: AssetInfo;
  /** Ціна на одній з бірж сильно відхиляється від медіани інших бірж */
  priceOutlier?: boolean;
  settings: Settings;
  now: number;
}

export type EvaluatedPair = Omit<Opportunity, 'firstSeenAt' | 'lastSeenAt' | 'seenCount'>;

export function opportunityId(base: string, buy: string, sell: string): string {
  return `${base}:${buy}>${sell}`;
}

export function evaluatePair(input: PairInput): EvaluatedPair {
  const { buy, sell, settings, now } = input;
  const buyFee = settings.exchanges[buy.exchange].takerFeePct / 100;
  const sellFee = settings.exchanges[sell.exchange].takerFeePct / 100;
  const notes: string[] = [];

  const asks = input.buyBook ? sortAsks(input.buyBook.asks) : [];
  const bids = input.sellBook ? sortBids(input.sellBook.bids) : [];
  const booksAvailable = asks.length > 0 && bids.length > 0;

  const buyPrice = booksAvailable ? asks[0][0] : buy.bestAsk;
  const sellPrice = booksAvailable ? bids[0][0] : sell.bestBid;
  const spreadPct = ((sellPrice - buyPrice) / buyPrice) * 100;

  const net = verifyTransfer(input.buyAsset, input.sellAsset, buyPrice);
  notes.push(...net.notes);

  const feeKnown = Boolean(net.route && Number.isFinite(net.route.withdrawFeeCoin));
  const networkFeeCoin = feeKnown ? net.route!.withdrawFeeCoin : settings.fallbackNetworkFeeUsd / buyPrice;
  if (!net.route) {
    notes.push(`Комісію мережі оцінено як $${settings.fallbackNetworkFeeUsd} (мережу не перевірено)`);
  } else if (!feeKnown) {
    net.route.withdrawFeeCoin = networkFeeCoin;
    net.route.withdrawFeeUsd = settings.fallbackNetworkFeeUsd;
    notes.push(`Комісія виводу невідома (потрібен API-ключ біржі) — оцінено як $${settings.fallbackNetworkFeeUsd}`);
  }

  const trade = booksAvailable
    ? simulateTrade(asks, bids, settings.tradeSizeUsd, buyFee, sellFee, networkFeeCoin)
    : simulateTopOfBook(buyPrice, sellPrice, settings.tradeSizeUsd, buyFee, sellFee, networkFeeCoin);

  let orderbookStatus: OrderbookStatus;
  if (!booksAvailable) {
    orderbookStatus = 'unverified';
    notes.push('Стакан не завантажено — розрахунок за найкращими котируваннями');
  } else if (trade.enough) {
    orderbookStatus = 'verified';
  } else {
    orderbookStatus = 'insufficient';
    notes.push(`Глибини стакана недостатньо для угоди на $${settings.tradeSizeUsd}`);
  }

  const buyDepth = booksAvailable ? askDepthUsd(asks, settings.depthWindowPct) : 0;
  const sellDepth = booksAvailable ? bidDepthUsd(bids, settings.depthWindowPct) : 0;
  const cross = booksAvailable ? crossWalk(asks, bids, buyFee, sellFee) : { buyUsd: 0, sellUsd: 0, qty: 0 };
  const networkFeeUsd = networkFeeCoin * buyPrice;
  const maxProfitUsd = cross.buyUsd > 0 ? cross.sellUsd - cross.buyUsd - networkFeeUsd : 0;

  const suspiciousReasons: SuspiciousReason[] = [];
  if (net.contractMismatch && net.status === 'mismatch') suspiciousReasons.push('contract_mismatch');
  if (net.nameMismatch && !net.contractConfirmed) suspiciousReasons.push('name_mismatch');
  if (spreadPct > settings.maxPlausibleSpreadPct) {
    suspiciousReasons.push('abnormal_spread');
    notes.push(`Спред ${spreadPct.toFixed(1)}% перевищує поріг правдоподібності ${settings.maxPlausibleSpreadPct}%`);
  }
  if (input.priceOutlier) {
    suspiciousReasons.push('price_outlier');
    notes.push('Ціна на одній з бірж суттєво відхиляється від інших бірж');
  }
  const suspicious = suspiciousReasons.length > 0;

  const profitStatus =
    orderbookStatus === 'verified' && net.status === 'verified' && feeKnown && !suspicious ? 'confirmed' : 'preliminary';

  return {
    id: opportunityId(buy.base, buy.exchange, sell.exchange),
    base: buy.base,
    buyExchange: buy.exchange,
    sellExchange: sell.exchange,
    buySymbol: buy.symbol,
    sellSymbol: sell.symbol,
    buyPrice,
    sellPrice,
    spreadPct,
    buyDepthUsd: buyDepth,
    sellDepthUsd: sellDepth,
    maxProfitableUsd: cross.buyUsd,
    maxProfitUsd,
    trade,
    orderbookStatus,
    networkStatus: net.status,
    profitStatus,
    networks: net.networks,
    route: net.route,
    suspicious,
    suspiciousReasons,
    notes,
    volume24hUsd: Math.min(buy.volume24hUsd, sell.volume24hUsd),
    updatedAt: now,
  };
}

export function simulateTrade(
  asks: BookLevel[],
  bids: BookLevel[],
  targetUsd: number,
  buyFee: number,
  sellFee: number,
  networkFeeCoin: number,
): TradeSimulation {
  let bought = simulateBuy(asks, targetUsd);
  let netQty = bought.qty * (1 - buyFee);
  let arrivedQty = Math.max(0, netQty - networkFeeCoin);
  let sold = simulateSell(bids, arrivedQty);
  const complete = bought.complete && sold.complete;
  if (!sold.complete && sold.soldQty > 0) {
    // Стакан продажу тонкий: рахуємо лише обсяг, який реально можна продати
    const neededQty = (sold.soldQty + networkFeeCoin) / (1 - buyFee);
    bought = simulateBuy(asks, costForQty(asks, neededQty));
    netQty = bought.qty * (1 - buyFee);
    arrivedQty = Math.max(0, netQty - networkFeeCoin);
    sold = simulateSell(bids, arrivedQty);
  }
  const grossProceeds = sold.receivedUsd;
  const sellFeeUsd = grossProceeds * sellFee;
  const receivedUsd = grossProceeds - sellFeeUsd;
  const netProfitUsd = receivedUsd - bought.spentUsd;
  return {
    targetUsd,
    enough: complete,
    spentUsd: bought.spentUsd,
    boughtQty: netQty,
    buyVwap: bought.vwap,
    arrivedQty,
    soldQty: sold.soldQty,
    sellVwap: sold.vwap,
    receivedUsd,
    buyFeeUsd: bought.spentUsd * buyFee,
    sellFeeUsd,
    networkFeeUsd: networkFeeCoin * bought.vwap,
    netProfitUsd,
    netProfitPct: bought.spentUsd > 0 ? (netProfitUsd / bought.spentUsd) * 100 : 0,
  };
}

function costForQty(asks: BookLevel[], qty: number): number {
  let left = qty;
  let usd = 0;
  for (const [price, size] of asks) {
    if (left <= 0) break;
    const take = Math.min(size, left);
    usd += take * price;
    left -= take;
  }
  return usd;
}

function simulateTopOfBook(
  buyPrice: number,
  sellPrice: number,
  targetUsd: number,
  buyFee: number,
  sellFee: number,
  networkFeeCoin: number,
): TradeSimulation {
  const netQty = (targetUsd / buyPrice) * (1 - buyFee);
  const arrivedQty = Math.max(0, netQty - networkFeeCoin);
  const gross = arrivedQty * sellPrice;
  const sellFeeUsd = gross * sellFee;
  const receivedUsd = gross - sellFeeUsd;
  const netProfitUsd = receivedUsd - targetUsd;
  return {
    targetUsd,
    enough: null,
    spentUsd: targetUsd,
    boughtQty: netQty,
    buyVwap: buyPrice,
    arrivedQty,
    soldQty: arrivedQty,
    sellVwap: sellPrice,
    receivedUsd,
    buyFeeUsd: targetUsd * buyFee,
    sellFeeUsd,
    networkFeeUsd: networkFeeCoin * buyPrice,
    netProfitUsd,
    netProfitPct: (netProfitUsd / targetUsd) * 100,
  };
}

/** Біржі, ціна яких відхиляється від медіани інших бірж більше ніж на thresholdPct. */
export function findPriceOutliers(markets: SpotMarket[], thresholdPct: number): Set<string> {
  const out = new Set<string>();
  if (markets.length < 3) return out;
  const mids = markets.map((m) => (m.bestBid + m.bestAsk) / 2);
  markets.forEach((m, idx) => {
    const others = mids.filter((_, i) => i !== idx).sort((a, b) => a - b);
    const median = others.length % 2 ? others[(others.length - 1) / 2] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2;
    const othersAgree = Math.abs(others[0] - others[others.length - 1]) / median * 100 < thresholdPct / 3;
    const dev = (Math.abs(mids[idx] - median) / median) * 100;
    if (othersAgree && dev > thresholdPct) out.add(m.exchange);
  });
  return out;
}
