import type { AssetInfoState, ExchangeId, OrderBook, SpotMarket } from '../domain/types.js';
import { BinanceLikeAdapter } from './binance.js';
import { BitgetAdapter } from './bitget.js';
import { BybitAdapter } from './bybit.js';
import { GateAdapter } from './gate.js';
import { KucoinAdapter } from './kucoin.js';
import { OkxAdapter } from './okx.js';
import type { ExchangeAdapter, MarketDataSource } from './types.js';

export class LiveSource implements MarketDataSource {
  readonly kind = 'live' as const;
  private readonly adapters: Record<ExchangeId, ExchangeAdapter>;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const okxCreds =
      env.OKX_API_KEY && env.OKX_API_SECRET && env.OKX_API_PASSPHRASE
        ? { apiKey: env.OKX_API_KEY, secret: env.OKX_API_SECRET, passphrase: env.OKX_API_PASSPHRASE }
        : undefined;
    const bybitCreds =
      env.BYBIT_API_KEY && env.BYBIT_API_SECRET ? { apiKey: env.BYBIT_API_KEY, secret: env.BYBIT_API_SECRET } : undefined;
    this.adapters = {
      okx: new OkxAdapter(okxCreds),
      bybit: new BybitAdapter(bybitCreds),
      bitget: new BitgetAdapter(),
      gate: new GateAdapter(pair(env.GATE_API_KEY, env.GATE_API_SECRET)),
      mexc: new BinanceLikeAdapter('mexc', 'https://api.mexc.com', {
        capitalPath: '/api/v3/capital/config/getall',
        keyHeader: 'X-MEXC-APIKEY',
        label: 'MEXC_API_KEY / MEXC_API_SECRET',
        creds: pair(env.MEXC_API_KEY, env.MEXC_API_SECRET),
      }),
      binance: new BinanceLikeAdapter('binance', 'https://api.binance.com', {
        capitalPath: '/sapi/v1/capital/config/getall',
        keyHeader: 'X-MBX-APIKEY',
        label: 'BINANCE_API_KEY / BINANCE_API_SECRET',
        creds: pair(env.BINANCE_API_KEY, env.BINANCE_API_SECRET),
      }),
      kucoin: new KucoinAdapter(),
    };
  }

  fetchMarkets(ex: ExchangeId): Promise<SpotMarket[]> {
    return this.adapters[ex].fetchMarkets();
  }
  fetchOrderBook(ex: ExchangeId, symbol: string, limit: number): Promise<OrderBook> {
    return this.adapters[ex].fetchOrderBook(symbol, limit);
  }
  fetchAssetInfo(ex: ExchangeId): Promise<AssetInfoState> {
    return this.adapters[ex].fetchAssetInfo();
  }
}

function pair(apiKey?: string, secret?: string) {
  return apiKey && secret ? { apiKey, secret } : undefined;
}
