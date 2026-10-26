import { normalizeContract, normalizeNetwork } from '../domain/networks.js';
import { type AssetInfo, type AssetInfoState, EXCLUDED_ASSETS, type OrderBook, QUOTE_ASSET, type SpotMarket } from '../domain/types.js';
import { fetchJson, num } from './http.js';
import type { ExchangeAdapter } from './types.js';

const BASE = 'https://api.bitget.com';

interface BitgetResp<T> {
  code: string;
  msg: string;
  data: T;
}

async function bitgetGet<T>(path: string): Promise<T> {
  const r = await fetchJson<BitgetResp<T>>(BASE + path);
  if (r.code !== '00000') throw new Error(`Bitget ${r.code}: ${r.msg}`);
  return r.data;
}

/** Bitget V3 (UTA) — кожен запит до market-ендпоінтів містить category=SPOT. */
export class BitgetAdapter implements ExchangeAdapter {
  readonly id = 'bitget' as const;

  async fetchMarkets(): Promise<SpotMarket[]> {
    const [instruments, tickers] = await Promise.all([
      bitgetGet<Array<{ symbol: string; baseCoin: string; quoteCoin: string; status: string; fullName?: string }>>(
        '/api/v3/market/instruments?category=SPOT',
      ),
      bitgetGet<Array<{ symbol: string; bid1Price: string; ask1Price: string; lastPrice: string; turnover24h: string; ts: string }>>(
        '/api/v3/market/tickers?category=SPOT',
      ),
    ]);
    const tick = new Map(tickers.map((t) => [t.symbol, t]));
    const out: SpotMarket[] = [];
    for (const i of instruments) {
      if (i.status !== 'online' || i.quoteCoin !== QUOTE_ASSET || EXCLUDED_ASSETS.has(i.baseCoin)) continue;
      const t = tick.get(i.symbol);
      if (!t) continue;
      out.push({
        exchange: this.id,
        symbol: i.symbol,
        base: i.baseCoin,
        quote: i.quoteCoin,
        bestBid: num(t.bid1Price),
        bestAsk: num(t.ask1Price),
        last: num(t.lastPrice),
        volume24hUsd: num(t.turnover24h),
        fullName: i.fullName || undefined,
        ts: num(t.ts) || Date.now(),
      });
    }
    return out;
  }

  async fetchOrderBook(symbol: string, limit: number): Promise<OrderBook> {
    const data = await bitgetGet<{ a: Array<Array<number | string>>; b: Array<Array<number | string>>; ts: string }>(
      `/api/v3/market/orderbook?category=SPOT&symbol=${encodeURIComponent(symbol)}&limit=${Math.min(limit, 200)}`,
    );
    return parseBitgetBook(data);
  }

  async fetchAssetInfo(): Promise<AssetInfoState> {
    try {
      const rows = await bitgetGet<
        Array<{
          coin: string;
          chains: Array<{
            chain: string;
            contractAddress?: string;
            rechargeable: string;
            withdrawable: string;
            withdrawFee: string;
            minWithdrawAmount: string;
          }>;
        }>
      >('/api/v3/market/coins');
      const assets = new Map<string, AssetInfo>();
      for (const row of rows) {
        if (EXCLUDED_ASSETS.has(row.coin) && row.coin !== QUOTE_ASSET) continue;
        assets.set(row.coin, {
          exchange: this.id,
          coin: row.coin,
          chains: (row.chains ?? []).map((c) => ({
            network: normalizeNetwork(c.chain, row.coin),
            rawChain: c.chain,
            contract: normalizeContract(c.contractAddress),
            depositEnabled: c.rechargeable === 'true',
            withdrawEnabled: c.withdrawable === 'true',
            withdrawFee: num(c.withdrawFee),
            minWithdraw: num(c.minWithdrawAmount),
          })),
        });
      }
      return { status: 'ok', assets, fetchedAt: Date.now() };
    } catch (e) {
      return { status: 'unavailable', reason: `Bitget coins: ${(e as Error).message}` };
    }
  }
}

/** Сторони стакана V3: data.a (asks) і data.b (bids). */
export function parseBitgetBook(data: { a?: Array<Array<number | string>>; b?: Array<Array<number | string>>; ts?: string | number }): OrderBook {
  if (!data || !Array.isArray(data.a) || !Array.isArray(data.b)) {
    throw new Error('Bitget V3: очікувались поля data.a / data.b у відповіді стакана');
  }
  return {
    asks: data.a.map((l) => [num(l[0]), num(l[1])]),
    bids: data.b.map((l) => [num(l[0]), num(l[1])]),
    ts: num(data.ts) || Date.now(),
  };
}
