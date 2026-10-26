import type { Settings } from '../config/settings.js';
import { askDepthUsd, bidDepthUsd, crossWalk, simulateBuy, simulateSell, sortAsks, sortBids } from './orderbook.js';
import type {
  AssetInfo,
  BookLevel,
  CostBreakdown,
  Opportunity,
  OpportunityWarning,
  OrderBook,
  OrderbookStatus,
  SlippageInfo,
  SpotMarket,
  SuspiciousReason,
  TradeSimulation,
  TransferCheck,
  VolatilityInfo,
} from './types.js';
import { verifyTransfer } from './verification.js';
import { UNKNOWN_VOLATILITY } from './volatility.js';

export interface PairInput {
  buy: SpotMarket;
  sell: SpotMarket;
  buyBook?: OrderBook;
  sellBook?: OrderBook;
  buyAsset?: AssetInfo;
  sellAsset?: AssetInfo;
  /** Ціна на одній з бірж сильно відхиляється від медіани інших бірж */
  priceOutlier?: boolean;
  /** Рух ціни за останнє вікно на обох біржах (ризик однієї ноги) */
  volatility?: VolatilityInfo;
  /** Коли біржі востаннє віддали статуси гаманців */
  assetInfoFetchedAt?: { buy?: number; sell?: number };
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

  const transfer: TransferCheck = {
    status: net.status === 'verified' ? 'open' : net.status === 'suspended' ? 'blocked' : 'unknown',
    legs: net.legs,
    checkedAt: minDefined(input.assetInfoFetchedAt?.buy, input.assetInfoFetchedAt?.sell),
  };
  const slippage = computeSlippage(buyPrice, sellPrice, spreadPct, trade);
  const costs = computeCosts(trade, spreadPct, slippage);
  const volatility = input.volatility ?? UNKNOWN_VOLATILITY(settings.volatility.windowSec);
  const warnings = buildWarnings({ settings, net, transfer, trade, spreadPct, slippage, costs, volatility, feeKnown, booksAvailable });
  const blocked = warnings.some((w) => w.severity === 'block');
  const actionable =
    !suspicious && !blocked && net.status !== 'mismatch' && net.status !== 'no_common' && trade.netProfitUsd > 0;

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
    transfer,
    slippage,
    costs,
    volatility,
    warnings,
    actionable,
    volume24hUsd: Math.min(buy.volume24hUsd, sell.volume24hUsd),
    updatedAt: now,
  };
}

function minDefined(a?: number, b?: number): number | null {
  if (a === undefined && b === undefined) return null;
  if (a === undefined) return b!;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/** Прослизання: наскільки VWAP на цільовий обсяг гірший за найкращі котирування. */
export function computeSlippage(buyPrice: number, sellPrice: number, spreadPct: number, trade: TradeSimulation): SlippageInfo {
  const buyVwap = trade.buyVwap > 0 ? trade.buyVwap : buyPrice;
  const sellVwap = trade.sellVwap > 0 ? trade.sellVwap : sellPrice;
  const buySlippagePct = ((buyVwap - buyPrice) / buyPrice) * 100;
  const sellSlippagePct = ((sellPrice - sellVwap) / sellPrice) * 100;
  const vwapSpreadPct = ((sellVwap - buyVwap) / buyVwap) * 100;
  const slippagePct = Math.max(0, spreadPct - vwapSpreadPct);
  return {
    buySlippagePct,
    sellSlippagePct,
    vwapSpreadPct,
    slippagePct,
    slippageShareOfSpreadPct: spreadPct > 0 ? (slippagePct / spreadPct) * 100 : slippagePct > 0 ? Infinity : 0,
  };
}

/** Розклад витрат: валовий спред → прослизання → торгові комісії → комісія мережі → чистий прибуток. */
export function computeCosts(trade: TradeSimulation, spreadPct: number, slippage: SlippageInfo): CostBreakdown {
  const base = trade.spentUsd > 0 ? trade.spentUsd : trade.targetUsd;
  const grossSpreadUsd = (base * spreadPct) / 100;
  const slippageUsd = (base * slippage.slippagePct) / 100;
  return {
    grossSpreadUsd,
    slippageUsd,
    tradingFeesUsd: trade.buyFeeUsd + trade.sellFeeUsd,
    networkFeeUsd: trade.networkFeeUsd,
    networkFeeShareOfSpreadPct: grossSpreadUsd > 0 ? (trade.networkFeeUsd / grossSpreadUsd) * 100 : Infinity,
    netProfitUsd: trade.netProfitUsd,
  };
}

interface WarningInput {
  settings: Settings;
  net: ReturnType<typeof verifyTransfer>;
  transfer: TransferCheck;
  trade: TradeSimulation;
  spreadPct: number;
  slippage: SlippageInfo;
  costs: CostBreakdown;
  volatility: VolatilityInfo;
  feeKnown: boolean;
  booksAvailable: boolean;
}

function buildWarnings(i: WarningInput): OpportunityWarning[] {
  const out: OpportunityWarning[] = [];
  const usd = (v: number) => `$${v.toFixed(2)}`;
  const size = i.trade.targetUsd;

  if (i.transfer.status === 'blocked') {
    const closed = i.transfer.legs
      .filter((l) => !l.withdrawEnabled || !l.depositEnabled)
      .map((l) => `${l.network}: ${[!l.withdrawEnabled ? 'вивід закрито' : '', !l.depositEnabled ? 'депозит закрито' : ''].filter(Boolean).join(', ')}`);
    out.push({
      code: 'transfer_blocked',
      severity: 'block',
      message: `Недоступна для переказу — ${closed.join('; ') || 'вивід або депозит призупинено'}. Кошти можуть зависнути.`,
    });
  }

  const minWd = i.net.route?.minWithdraw;
  if (i.transfer.status === 'open' && minWd && i.trade.boughtQty > 0 && i.trade.boughtQty < minWd) {
    out.push({
      code: 'below_min_withdraw',
      severity: 'block',
      message: `Куплена кількість ${fmtQty(i.trade.boughtQty)} менша за мінімальну суму виводу ${fmtQty(minWd)} у мережі ${i.net.route!.network}`,
    });
  }

  if (!i.feeKnown) {
    out.push({
      code: 'fee_unknown',
      severity: 'warn',
      message: `Комісія мережі невідома — використано оцінку ${usd(i.settings.fallbackNetworkFeeUsd)}; реальна може бути вищою`,
    });
  }

  if (i.booksAvailable && i.spreadPct > 0 && i.slippage.slippageShareOfSpreadPct > i.settings.maxSlippageShareOfSpreadPct) {
    out.push({
      code: 'slippage_eats_spread',
      severity: 'warn',
      message: `Прослизання з'їдає ${fmtPct(i.slippage.slippageShareOfSpreadPct)} спреду: за VWAP спред ${i.slippage.vwapSpreadPct.toFixed(2)}% замість ${i.spreadPct.toFixed(2)}% на угоді ${usd(size)}`,
    });
  }

  if (i.costs.grossSpreadUsd > 0 && i.trade.networkFeeUsd >= i.costs.grossSpreadUsd) {
    out.push({
      code: 'network_fee_exceeds_spread',
      severity: 'warn',
      message: `Комісія мережі ${usd(i.trade.networkFeeUsd)} перевищує весь спред ${usd(i.costs.grossSpreadUsd)} на угоді ${usd(size)} — операція збиткова`,
    });
  } else if (i.trade.netProfitUsd <= 0) {
    out.push({
      code: 'unprofitable',
      severity: 'warn',
      message: `Після прослизання (${usd(i.costs.slippageUsd)}), торгових комісій (${usd(i.costs.tradingFeesUsd)}) і комісії мережі (${usd(i.trade.networkFeeUsd)}) угода на ${usd(size)} збиткова: ${usd(i.trade.netProfitUsd)}`,
    });
  }

  if (i.volatility.level === 'high') {
    out.push({
      code: 'high_volatility',
      severity: 'warn',
      message: `Ризик однієї ноги: ціна за ${i.volatility.windowSec} с рухалась на ${i.volatility.rangePct.toFixed(2)}% — за час переказу спред може зникнути`,
    });
  }
  return out;
}

function fmtPct(v: number): string {
  return Number.isFinite(v) ? `${v.toFixed(0)}%` : '100%+';
}

function fmtQty(v: number): string {
  return v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toPrecision(3);
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
