import crypto from 'node:crypto';
import { normalizeContract, normalizeNetwork } from '../domain/networks.js';
import { type AssetInfo, type AssetInfoState, EXCLUDED_ASSETS, type OrderBook, QUOTE_ASSET, type SpotMarket } from '../domain/types.js';
import { fetchJson, num } from './http.js';
import type { ExchangeAdapter } from './types.js';

const BASE = 'https://www.okx.com';

interface OkxResp<T> {
  code: string;
  msg: string;
  data: T;
}

async function okxGet<T>(path: string, headers: Record<string, string> = {}): Promise<T> {
  const r = await fetchJson<OkxResp<T>>(BASE + path, { headers });
  if (r.code !== '0') throw new Error(`OKX ${r.code}: ${r.msg}`);
  return r.data;
}

export interface OkxCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export class OkxAdapter implements ExchangeAdapter {
  readonly id = 'okx' as const;

  constructor(private readonly creds?: OkxCredentials) {}

  async fetchMarkets(): Promise<SpotMarket[]> {
    const [instruments, tickers] = await Promise.all([
      okxGet<Array<{ instId: string; baseCcy: string; quoteCcy: string; state: string }>>(
        '/api/v5/public/instruments?instType=SPOT',
      ),
      okxGet<Array<{ instId: string; bidPx: string; askPx: string; last: string; volCcy24h: string; ts: string }>>(
        '/api/v5/market/tickers?instType=SPOT',
      ),
    ]);
    const tick = new Map(tickers.map((t) => [t.instId, t]));
    const out: SpotMarket[] = [];
    for (const i of instruments) {
      if (i.state !== 'live' || i.quoteCcy !== QUOTE_ASSET || EXCLUDED_ASSETS.has(i.baseCcy)) continue;
      const t = tick.get(i.instId);
      if (!t) continue;
      out.push({
        exchange: this.id,
        symbol: i.instId,
        base: i.baseCcy,
        quote: i.quoteCcy,
        bestBid: num(t.bidPx),
        bestAsk: num(t.askPx),
        last: num(t.last),
        // Для SPOT volCcy24h — обсяг у валюті котирування (USDT)
        volume24hUsd: num(t.volCcy24h),
        ts: num(t.ts) || Date.now(),
      });
    }
    return out;
  }

  async fetchOrderBook(symbol: string, limit: number): Promise<OrderBook> {
    const data = await okxGet<Array<{ asks: string[][]; bids: string[][]; ts: string }>>(
      `/api/v5/market/books?instId=${encodeURIComponent(symbol)}&sz=${Math.min(limit, 400)}`,
    );
    const b = data[0];
    if (!b) throw new Error('OKX: порожній стакан');
    return {
      asks: b.asks.map((l) => [num(l[0]), num(l[1])]),
      bids: b.bids.map((l) => [num(l[0]), num(l[1])]),
      ts: num(b.ts) || Date.now(),
    };
  }

  async fetchAssetInfo(): Promise<AssetInfoState> {
    if (!this.creds) {
      return { status: 'unavailable', reason: 'Не задано OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE (ендпоінт мереж приватний)' };
    }
    const path = '/api/v5/asset/currencies';
    const ts = new Date().toISOString();
    const sign = crypto.createHmac('sha256', this.creds.secret).update(`${ts}GET${path}`).digest('base64');
    try {
      const rows = await okxGet<
        Array<{
          ccy: string;
          name: string;
          chain: string;
          ctAddr?: string;
          canDep: boolean;
          canWd: boolean;
          fee?: string;
          minFee?: string;
          minWd?: string;
        }>
      >(path, {
        'OK-ACCESS-KEY': this.creds.apiKey,
        'OK-ACCESS-SIGN': sign,
        'OK-ACCESS-TIMESTAMP': ts,
        'OK-ACCESS-PASSPHRASE': this.creds.passphrase,
      });
      const assets = new Map<string, AssetInfo>();
      for (const r of rows) {
        if (EXCLUDED_ASSETS.has(r.ccy) && r.ccy !== QUOTE_ASSET) continue;
        let a = assets.get(r.ccy);
        if (!a) {
          a = { exchange: this.id, coin: r.ccy, fullName: r.name || undefined, chains: [] };
          assets.set(r.ccy, a);
        }
        a.chains.push({
          network: normalizeNetwork(r.chain, r.ccy),
          rawChain: r.chain,
          contract: normalizeContract(r.ctAddr),
          depositEnabled: Boolean(r.canDep),
          withdrawEnabled: Boolean(r.canWd),
          withdrawFee: num(r.fee ?? r.minFee),
          minWithdraw: num(r.minWd),
        });
      }
      return { status: 'ok', assets, fetchedAt: Date.now() };
    } catch (e) {
      return { status: 'unavailable', reason: `OKX currencies: ${(e as Error).message}` };
    }
  }
}
