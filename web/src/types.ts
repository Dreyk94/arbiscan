export type ExchangeId = 'okx' | 'bybit' | 'bitget' | 'gate' | 'mexc' | 'binance' | 'kucoin';
export type OrderbookStatus = 'verified' | 'insufficient' | 'unverified';
export type NetworkStatus = 'verified' | 'suspended' | 'mismatch' | 'no_common' | 'unverified';
export type ProfitStatus = 'confirmed' | 'preliminary';
export type SuspiciousReason = 'contract_mismatch' | 'name_mismatch' | 'abnormal_spread' | 'price_outlier';
export type TransferStatus = 'open' | 'blocked' | 'unknown';
export type VolatilityLevel = 'low' | 'medium' | 'high' | 'unknown';
export type WarningCode =
  | 'transfer_blocked'
  | 'slippage_eats_spread'
  | 'network_fee_exceeds_spread'
  | 'unprofitable'
  | 'below_min_withdraw'
  | 'fee_unknown'
  | 'high_volatility';

export interface TransferLeg {
  network: string;
  withdrawEnabled: boolean;
  depositEnabled: boolean;
  withdrawFeeCoin: number;
  minWithdraw?: number;
}

export interface TransferCheck {
  status: TransferStatus;
  legs: TransferLeg[];
  checkedAt: number | null;
}

export interface VolatilityInfo {
  level: VolatilityLevel;
  buyMovePct: number;
  sellMovePct: number;
  rangePct: number;
  windowSec: number;
  samples: number;
}

export interface SlippageInfo {
  buySlippagePct: number;
  sellSlippagePct: number;
  vwapSpreadPct: number;
  slippagePct: number;
  slippageShareOfSpreadPct: number;
}

export interface CostBreakdown {
  grossSpreadUsd: number;
  slippageUsd: number;
  tradingFeesUsd: number;
  networkFeeUsd: number;
  networkFeeShareOfSpreadPct: number;
  netProfitUsd: number;
}

export interface OpportunityWarning {
  code: WarningCode;
  severity: 'block' | 'warn';
  message: string;
}

export interface TradeSimulation {
  targetUsd: number;
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
  spreadPct: number;
  buyDepthUsd: number;
  sellDepthUsd: number;
  maxProfitableUsd: number;
  maxProfitUsd: number;
  trade: TradeSimulation;
  orderbookStatus: OrderbookStatus;
  networkStatus: NetworkStatus;
  profitStatus: ProfitStatus;
  networks: string[];
  route?: { network: string; withdrawFeeCoin: number; withdrawFeeUsd: number; contract?: string; minWithdraw?: number };
  suspicious: boolean;
  suspiciousReasons: SuspiciousReason[];
  notes: string[];
  transfer: TransferCheck;
  slippage: SlippageInfo;
  costs: CostBreakdown;
  volatility: VolatilityInfo;
  warnings: OpportunityWarning[];
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

export interface ScanMeta {
  mode: 'demo' | 'live';
  cycle: number;
  scannedAt: number | null;
  durationMs: number;
  marketsTotal: number;
  basesCompared: number;
  candidates: number;
  booksFetched: number;
  booksFailed: number;
  exchanges: ExchangeHealth[];
  error?: string;
}

export interface JournalSettings {
  enabled: boolean;
  minSpreadPct: number;
  maxEntries: number;
}

export interface VolatilitySettings {
  windowSec: number;
  warnPct: number;
  highPct: number;
}

export interface PublicConfig {
  tradeSizeUsd: number;
  depthWindowPct: number;
  scanIntervalSec: number;
  maxPlausibleSpreadPct: number;
  notifications: { minSpreadPct: number; cooldownMin: number };
  journal: JournalSettings;
  volatility: VolatilitySettings;
  maxSlippageShareOfSpreadPct: number;
  assetInfoRefreshSec: number;
  fees: Record<ExchangeId, number>;
  exchanges: Array<{ id: ExchangeId; label: string; enabled: boolean }>;
}

export interface OpportunitiesResponse {
  opportunities: Opportunity[];
  meta: ScanMeta;
  config: PublicConfig;
}

export interface ExchangeSettings {
  enabled: boolean;
  takerFeePct: number;
}

export interface Settings {
  dataMode: 'demo' | 'live';
  exchanges: Record<ExchangeId, ExchangeSettings>;
  tradeSizeUsd: number;
  depthWindowPct: number;
  orderbookLimit: number;
  minCandidateSpreadPct: number;
  maxCandidates: number;
  maxPlausibleSpreadPct: number;
  minVolume24hUsd: number;
  fallbackNetworkFeeUsd: number;
  scanIntervalSec: number;
  staleAfterSec: number;
  assetInfoRefreshSec: number;
  maxSlippageShareOfSpreadPct: number;
  notifications: { minSpreadPct: number; cooldownMin: number };
  journal: JournalSettings;
  volatility: VolatilitySettings;
}

export type JournalVerdict = 'actionable' | 'blocked' | 'unprofitable' | 'suspicious' | 'unverified';

export interface JournalEntry {
  id: string;
  opportunityId: string;
  base: string;
  buyExchange: ExchangeId;
  sellExchange: ExchangeId;
  firstSeenAt: number;
  lastSeenAt: number;
  closedAt: number | null;
  seenCount: number;
  spreadPct: number;
  maxSpreadPct: number;
  lastSpreadPct: number;
  tradeSizeUsd: number;
  netProfitUsd: number;
  maxNetProfitUsd: number;
  vwapSpreadPct: number;
  orderbookStatus: OrderbookStatus;
  enough: boolean | null;
  buyDepthUsd: number;
  sellDepthUsd: number;
  networkStatus: NetworkStatus;
  transferStatus: TransferStatus;
  network?: string;
  networkFeeUsd: number;
  volatilityLevel: VolatilityLevel;
  profitStatus: ProfitStatus;
  suspicious: boolean;
  suspiciousReasons: SuspiciousReason[];
  warnings: WarningCode[];
  firstVerdict: JournalVerdict;
  verdict: JournalVerdict;
  everActionable: boolean;
}

export interface JournalStats {
  total: number;
  active: number;
  byVerdict: Record<JournalVerdict, number>;
  falseSignalPct: number;
}

export interface JournalResponse {
  entries: JournalEntry[];
  stats: JournalStats;
  config: JournalSettings;
}

export const EXCHANGE_LABELS: Record<ExchangeId, string> = {
  okx: 'OKX',
  bybit: 'Bybit',
  bitget: 'Bitget',
  gate: 'Gate',
  mexc: 'MEXC',
  binance: 'Binance',
  kucoin: 'KuCoin',
};
export const ALL_EXCHANGES: ExchangeId[] = ['okx', 'bybit', 'bitget', 'gate', 'mexc', 'binance', 'kucoin'];
