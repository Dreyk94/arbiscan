import type { AssetInfoState, ExchangeId, OrderBook, SpotMarket } from '../domain/types.js';

export interface ExchangeAdapter {
  readonly id: ExchangeId;
  /** Spot-ринки до USDT з найкращими котируваннями */
  fetchMarkets(): Promise<SpotMarket[]>;
  fetchOrderBook(symbol: string, limit: number): Promise<OrderBook>;
  /** Дані про мережі, контракти, статус депозитів/виводів */
  fetchAssetInfo(): Promise<AssetInfoState>;
}

export interface MarketDataSource {
  readonly kind: 'demo' | 'live';
  fetchMarkets(ex: ExchangeId): Promise<SpotMarket[]>;
  fetchOrderBook(ex: ExchangeId, symbol: string, limit: number): Promise<OrderBook>;
  fetchAssetInfo(ex: ExchangeId): Promise<AssetInfoState>;
}
