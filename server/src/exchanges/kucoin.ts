import { normalizeContract, normalizeNetwork } from '../domain/networks.js';
import { type AssetInfo, type AssetInfoState, EXCLUDED_ASSETS, type OrderBook, QUOTE_ASSET, type SpotMarket } from '../domain/types.js';
import { isAllowedSpot, parseLevels, type RawLevels } from './cex.js';
import { fetchJson, num } from './http.js';
import type { ExchangeAdapter } from './types.js';

const BASE = 'https://api.kucoin.com';

async function kcGet<T>(path: string): Promise<T> {
  const r = await fetchJson<{ code: string; msg?: string; data: T }>(BASE + path);
  if (r.code !== '200000') throw new Error(`KuCoin ${r.code}: ${r.msg ?? ''}`);
  return r.data;
}

/** KuCoin Spot: публічні ринки, стакан level2_20/100 і мережі з комісіями (/api/v3/currencies). */
export class KucoinAdapter implements ExchangeAdapter {
  readonly id = 'kucoin' as const;

  async fetchMarkets(): Promise<SpotMarket[]> {
    const [symbols, tickers] = await Promise.all([
      kcGet<Array<{ symbol: string; baseCurrency: string; quoteCurrency: string; enableTrading: boolean }>>('/api/v2/symbols'),
      kcGet<{ time: number; ticker: Array<{ symbol: string; buy: string | null; sell: string | null; last: string | null; volValue: string }> }>(
        '/api/v1/market/allTickers',
      ),
    ]);
    const tick = new Map(tickers.ticker.map((t) => [t.symbol, t]));
    const out: SpotMarket[] = [];
    for (const s of symbols) {
      if (!s.enableTrading || !isAllowedSpot(s.baseCurrency, s.quoteCurrency)) continue;
      const t = tick.get(s.symbol);
      if (!t || !t.buy || !t.sell) continue;
      out.push({
        exchange: this.id,
        symbol: s.symbol,
        base: s.baseCurrency,
        quote: s.quoteCurrency,
        bestBid: num(t.buy),
        bestAsk: num(t.sell),
        last: num(t.last),
        volume24hUsd: num(t.volValue),
        ts: tickers.time,
      });
    }
    return out;
  }

  async fetchOrderBook(symbol: string, limit: number): Promise<OrderBook> {
    const depth = limit <= 20 ? 20 : 100;
    const d = await kcGet<{ asks: RawLevels; bids: RawLevels; time: number }>(
      `/api/v1/market/orderbook/level2_${depth}?symbol=${encodeURIComponent(symbol)}`,
    );
    return parseLevels(d.asks, d.bids, d.time);
  }

  async fetchAssetInfo(): Promise<AssetInfoState> {
    try {
      const rows = await kcGet<
        Array<{
          currency: string;
          fullName?: string;
          chains: Array<{
            chainName: string;
            chainId: string;
            contractAddress?: string | null;
            isDepositEnabled: boolean;
            isWithdrawEnabled: boolean;
            withdrawalMinFee: string;
            withdrawalMinSize?: string;
          }> | null;
        }>
      >('/api/v3/currencies');
      const assets = new Map<string, AssetInfo>();
      for (const r of rows) {
        if (EXCLUDED_ASSETS.has(r.currency) && r.currency !== QUOTE_ASSET) continue;
        assets.set(r.currency, {
          exchange: this.id,
          coin: r.currency,
          fullName: r.fullName || undefined,
          chains: (r.chains ?? []).map((c) => ({
            network: normalizeNetwork(c.chainId || c.chainName, r.currency),
            rawChain: c.chainName,
            contract: normalizeContract(c.contractAddress),
            depositEnabled: c.isDepositEnabled,
            withdrawEnabled: c.isWithdrawEnabled,
            withdrawFee: num(c.withdrawalMinFee),
            minWithdraw: num(c.withdrawalMinSize),
          })),
        });
      }
      return { status: 'ok', assets, fetchedAt: Date.now() };
    } catch (e) {
      return { status: 'unavailable', reason: `KuCoin currencies: ${(e as Error).message}` };
    }
  }
}
