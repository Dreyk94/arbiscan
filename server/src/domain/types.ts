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
