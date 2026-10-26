export type ExchangeId = 'okx' | 'bybit' | 'bitget' | 'gate' | 'mexc' | 'binance' | 'kucoin';
export type OrderbookStatus = 'verified' | 'insufficient' | 'unverified';
export type NetworkStatus = 'verified' | 'suspended' | 'mismatch' | 'no_common' | 'unverified';
export type ProfitStatus = 'confirmed' | 'preliminary';
export type SuspiciousReason = 'contract_mismatch' | 'name_mismatch' | 'abnormal_spread' | 'price_outlier';

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
  route?: { network: string; withdrawFeeCoin: number; withdrawFeeUsd: number; contract?: string };
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

export interface PublicConfig {
  tradeSizeUsd: number;
  depthWindowPct: number;
  scanIntervalSec: number;
  maxPlausibleSpreadPct: number;
  notifications: { minSpreadPct: number; cooldownMin: number };
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
  notifications: { minSpreadPct: number; cooldownMin: number };
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
