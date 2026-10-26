export const EXCHANGES = ['okx', 'bybit', 'bitget', 'gate', 'mexc', 'binance', 'kucoin'] as const;
export type ExchangeId = (typeof EXCHANGES)[number];

export const EXCHANGE_LABELS: Record<ExchangeId, string> = {
  okx: 'OKX',
  bybit: 'Bybit',
  bitget: 'Bitget',
  gate: 'Gate',
  mexc: 'MEXC',
  binance: 'Binance',
  kucoin: 'KuCoin',
};

/** USDC повністю виключено з платформи: ні як котирувальна, ні як базова валюта. */
export const QUOTE_ASSET = 'USDT' as const;
export const EXCLUDED_ASSETS: ReadonlySet<string> = new Set(['USDC', 'USDT']);

/** [ціна, кількість базового активу] */
export type BookLevel = [price: number, qty: number];

export interface OrderBook {
  asks: BookLevel[];
  bids: BookLevel[];
  ts: number;
}

export interface SpotMarket {
  exchange: ExchangeId;
  /** Нативний символ біржі (BTC-USDT для OKX, BTCUSDT для Bybit/Bitget) */
  symbol: string;
  base: string;
  quote: string;
  bestBid: number;
  bestAsk: number;
  last: number;
  volume24hUsd: number;
  /** Повна назва активу, якщо біржа її віддає (використовується для перевірки) */
  fullName?: string;
  ts: number;
}

export interface ChainInfo {
  /** Нормалізована назва мережі (ETH, TRX, BSC, SOL ...) */
  network: string;
  /** Оригінальна назва мережі на біржі */
  rawChain: string;
  contract?: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  /** Комісія виводу у монетах базового активу (NaN — невідома) */
  withdrawFee: number;
  minWithdraw?: number;
}

export interface AssetInfo {
  exchange: ExchangeId;
  coin: string;
  fullName?: string;
  chains: ChainInfo[];
}

/** Джерело даних про активи біржі */
export type AssetInfoState =
  | { status: 'ok'; assets: Map<string, AssetInfo>; fetchedAt: number }
  | { status: 'unavailable'; reason: string };

export type OrderbookStatus = 'verified' | 'insufficient' | 'unverified';
export type NetworkStatus = 'verified' | 'suspended' | 'mismatch' | 'no_common' | 'unverified';
export type ProfitStatus = 'confirmed' | 'preliminary';

export type SuspiciousReason =
  | 'contract_mismatch'
  | 'name_mismatch'
  | 'abnormal_spread'
  | 'price_outlier';

export interface NetworkRoute {
  network: string;
  withdrawFeeCoin: number;
  withdrawFeeUsd: number;
  contract?: string;
  /** Мінімальна сума виводу в монетах (якщо біржа її віддає) */
  minWithdraw?: number;
}

/** Статус шляху переказу «вивід з біржі купівлі → депозит на біржу продажу» */
export type TransferStatus = 'open' | 'blocked' | 'unknown';

/** Стан гаманців у конкретній спільній мережі на обох біржах */
export interface TransferLeg {
  network: string;
  /** Вивід увімкнено на біржі купівлі */
  withdrawEnabled: boolean;
  /** Депозит увімкнено на біржі продажу */
  depositEnabled: boolean;
  withdrawFeeCoin: number;
  minWithdraw?: number;
}

export interface TransferCheck {
  status: TransferStatus;
  legs: TransferLeg[];
  /** Коли біржі востаннє віддали статуси гаманців (мінімум з двох бірж) */
  checkedAt: number | null;
}

export type VolatilityLevel = 'low' | 'medium' | 'high' | 'unknown';

/** Рух ціни за останнє вікно (≈1 хв) на обох біржах — ризик однієї ноги */
export interface VolatilityInfo {
  level: VolatilityLevel;
  /** Зміна mid-ціни за вікно на біржі купівлі, % (знак зберігається) */
  buyMovePct: number;
  /** Зміна mid-ціни за вікно на біржі продажу, % */
  sellMovePct: number;
  /** Максимальний розмах (max-min)/min за вікно серед двох бірж, % */
  rangePct: number;
  windowSec: number;
  samples: number;
}

export interface SlippageInfo {
  /** Наскільки VWAP купівлі гірший за найкращий ask, % */
  buySlippagePct: number;
  /** Наскільки VWAP продажу гірший за найкращий bid, % */
  sellSlippagePct: number;
  /** Спред за VWAP (реальний для цільового обсягу), % */
  vwapSpreadPct: number;
  /** Скільки відсоткових пунктів спреду з'їдає прослизання */
  slippagePct: number;
  /** Частка спреду, яку з'їдає прослизання, % (0..∞) */
  slippageShareOfSpreadPct: number;
}

export interface CostBreakdown {
  /** Валовий спред на цільовий обсяг за найкращими котируваннями, USD */
  grossSpreadUsd: number;
  slippageUsd: number;
  tradingFeesUsd: number;
  networkFeeUsd: number;
  /** Частка комісії мережі у валовому спреді, % */
  networkFeeShareOfSpreadPct: number;
  netProfitUsd: number;
}

export type WarningCode =
  | 'transfer_blocked'
  | 'slippage_eats_spread'
  | 'network_fee_exceeds_spread'
  | 'unprofitable'
  | 'below_min_withdraw'
  | 'fee_unknown'
  | 'high_volatility';

export interface OpportunityWarning {
  code: WarningCode;
  /** block — зв'язку не можна подавати як робочу; warn — потребує уваги */
  severity: 'block' | 'warn';
  message: string;
}

export interface TradeSimulation {
  /** Цільовий обсяг угоди, USDT */
  targetUsd: number;
  /** Чи можна повністю виконати угоду на обох біржах; null — стакан не перевірено */
  enough: boolean | null;
  spentUsd: number;
  boughtQty: number;
  buyVwap: number;
  arrivedQty: number;
  soldQty: number;
  sellVwap: number;
  receivedUsd: number;
  buyFeeUsd: number;
  sellFeeUsd: number;
  networkFeeUsd: number;
  netProfitUsd: number;
  netProfitPct: number;
}

export interface Opportunity {
  id: string;
  base: string;
  buyExchange: ExchangeId;
  sellExchange: ExchangeId;
  buySymbol: string;
  sellSymbol: string;
  buyPrice: number;
  sellPrice: number;
  /** Спред за найкращими котируваннями, % */
  spreadPct: number;
  /** Скільки реально можна купити на біржі купівлі в межах вікна глибини, USD */
  buyDepthUsd: number;
  /** Скільки реально можна продати на біржі продажу в межах вікна глибини, USD */
  sellDepthUsd: number;
  /** Максимальний обсяг, на якому граничний спред після комісій ще позитивний, USD */
  maxProfitableUsd: number;
  maxProfitUsd: number;
  trade: TradeSimulation;
  orderbookStatus: OrderbookStatus;
  networkStatus: NetworkStatus;
  profitStatus: ProfitStatus;
  networks: string[];
  route?: NetworkRoute;
  suspicious: boolean;
  suspiciousReasons: SuspiciousReason[];
  notes: string[];
  transfer: TransferCheck;
  slippage: SlippageInfo;
  costs: CostBreakdown;
  volatility: VolatilityInfo;
  warnings: OpportunityWarning[];
  /** Зв'язку можна подавати як робочу: немає блокувань, не підозріла, прибуток після всіх витрат > 0 */
  actionable: boolean;
  volume24hUsd: number;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  updatedAt: number;
}

export interface ExchangeHealth {
  exchange: ExchangeId;
  enabled: boolean;
  ok: boolean;
  markets: number;
  error?: string;
  assetInfo: 'ok' | 'unavailable';
  assetInfoReason?: string;
  latencyMs?: number;
  updatedAt: number;
}
