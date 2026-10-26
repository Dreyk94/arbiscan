import crypto from 'node:crypto';
import { normalizeContract, normalizeNetwork } from '../domain/networks.js';
import { type AssetInfo, type AssetInfoState, EXCLUDED_ASSETS, type OrderBook, QUOTE_ASSET, type SpotMarket } from '../domain/types.js';
import { fetchJson, num } from './http.js';
import type { ExchangeAdapter } from './types.js';

const BASE = 'https://api.bybit.com';

interface BybitResp<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

async function bybitGet<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetchJson<BybitResp<T>>(BASE + path, { headers });
  if (r.retCode !== 0) throw new Error(`Bybit ${r.retCode}: ${r.retMsg}`);
  return r.result;
}

export interface BybitCredentials {
  apiKey: string;
  secret: string;
}

export class BybitAdapter implements ExchangeAdapter {
  readonly id = 'bybit' as const;

  constructor(private readonly creds?: BybitCredentials) {}

  async fetchMarkets(): Promise<SpotMarket[]> {
    const [instruments, tickers] = await Promise.all([
      bybitGet<{ list: Array<{ symbol: string; baseCoin: string; quoteCoin: string; status: string }> }>(
        '/v5/market/instruments-info?category=spot',
      ),
      bybitGet<{ list: Array<{ symbol: string; bid1Price: string; ask1Price: string; lastPrice: string; turnover24h: string }> }>(
        '/v5/market/tickers?category=spot',
      ),
    ]);
    const tick = new Map(tickers.list.map((t) => [t.symbol, t]));
    const out: SpotMarket[] = [];
    const now = Date.now();
    for (const i of instruments.list) {
      if (i.status !== 'Trading' || i.quoteCoin !== QUOTE_ASSET || EXCLUDED_ASSETS.has(i.baseCoin)) continue;
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
        ts: now,
      });
    }
    return out;
  }

  async fetchOrderBook(symbol: string, limit: number): Promise<OrderBook> {
    const r = await bybitGet<{ a: string[][]; b: string[][]; ts: number }>(
      `/v5/market/orderbook?category=spot&symbol=${encodeURIComponent(symbol)}&limit=${Math.min(limit, 200)}`,
    );
    return {
      asks: r.a.map((l) => [num(l[0]), num(l[1])]),
      bids: r.b.map((l) => [num(l[0]), num(l[1])]),
      ts: num(r.ts) || Date.now(),
    };
  }

  async fetchAssetInfo(): Promise<AssetInfoState> {
    if (!this.creds) {
      return { status: 'unavailable', reason: 'Не задано BYBIT_API_KEY / BYBIT_API_SECRET (ендпоінт мереж приватний)' };
    }
    const ts = Date.now().toString();
    const recv = '10000';
    const query = '';
    const sign = crypto.createHmac('sha256', this.creds.secret).update(ts + this.creds.apiKey + recv + query).digest('hex');
    try {
      const r = await bybitGet<{
        rows: Array<{
          coin: string;
          name: string;
          chains: Array<{
            chain: string;
            chainType: string;
            chainDeposit: string;
            chainWithdraw: string;
            withdrawFee: string;
            withdrawMin: string;
            contractAddress?: string;
          }>;
        }>;
      }>('/v5/asset/coin/query-info', {
        'X-BAPI-API-KEY': this.creds.apiKey,
        'X-BAPI-TIMESTAMP': ts,
        'X-BAPI-RECV-WINDOW': recv,
        'X-BAPI-SIGN': sign,
      });
      const assets = new Map<string, AssetInfo>();
      for (const row of r.rows) {
        if (EXCLUDED_ASSETS.has(row.coin) && row.coin !== QUOTE_ASSET) continue;
        assets.set(row.coin, {
          exchange: this.id,
          coin: row.coin,
          chains: row.chains.map((c) => ({
            network: normalizeNetwork(c.chain, row.coin),
            rawChain: `${c.chain} (${c.chainType})`,
            contract: normalizeContract(c.contractAddress),
            depositEnabled: c.chainDeposit === '1',
            withdrawEnabled: c.chainWithdraw === '1' && c.withdrawFee !== '',
            withdrawFee: num(c.withdrawFee),
            minWithdraw: num(c.withdrawMin),
          })),
        });
      }
      return { status: 'ok', assets, fetchedAt: Date.now() };
    } catch (e) {
      return { status: 'unavailable', reason: `Bybit coin info: ${(e as Error).message}` };
    }
  }
}
