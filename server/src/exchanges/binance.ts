import { type AssetInfoState, type OrderBook, type SpotMarket } from '../domain/types.js';
import { type CapitalCoin, capitalToAssets, hmacHex, isAllowedSpot, parseLevels, type RawLevels } from './cex.js';
import { fetchJson, num } from './http.js';
import type { ExchangeAdapter } from './types.js';

interface Creds {
  apiKey: string;
  secret: string;
}

/**
 * Binance-сумісний Spot API (/api/v3). Використовується для Binance і MEXC —
 * у них однакові ендпоінти exchangeInfo / bookTicker / 24hr / depth та capital/config/getall.
 */
export class BinanceLikeAdapter implements ExchangeAdapter {
  constructor(
    readonly id: 'binance' | 'mexc',
    private readonly base: string,
    private readonly opts: { capitalPath: string; keyHeader: string; label: string; creds?: Creds },
  ) {}

  async fetchMarkets(): Promise<SpotMarket[]> {
    const [info, book, day] = await Promise.all([
      fetchJson<{ symbols: Array<{ symbol: string; status: string; baseAsset: string; quoteAsset: string; fullName?: string; isSpotTradingAllowed?: boolean }> }>(
        `${this.base}/api/v3/exchangeInfo`,
      ),
      fetchJson<Array<{ symbol: string; bidPrice: string; askPrice: string }>>(`${this.base}/api/v3/ticker/bookTicker`),
      fetchJson<Array<{ symbol: string; quoteVolume: string; lastPrice: string; closeTime?: number }>>(`${this.base}/api/v3/ticker/24hr`),
    ]);
    const bt = new Map(book.map((t) => [t.symbol, t]));
    const dv = new Map(day.map((t) => [t.symbol, t]));
    const out: SpotMarket[] = [];
    for (const s of info.symbols) {
      const trading = this.id === 'binance' ? s.status === 'TRADING' : s.status === '1' || s.status === 'ENABLED';
      if (!trading || s.isSpotTradingAllowed === false || !isAllowedSpot(s.baseAsset, s.quoteAsset)) continue;
      const b = bt.get(s.symbol);
      const d = dv.get(s.symbol);
      if (!b || !d) continue;
      out.push({
        exchange: this.id,
        symbol: s.symbol,
        base: s.baseAsset,
        quote: s.quoteAsset,
        bestBid: num(b.bidPrice),
        bestAsk: num(b.askPrice),
        last: num(d.lastPrice),
        volume24hUsd: num(d.quoteVolume),
        fullName: s.fullName || undefined,
        ts: d.closeTime ?? Date.now(),
      });
    }
    return out;
  }

  async fetchOrderBook(symbol: string, limit: number): Promise<OrderBook> {
    const d = await fetchJson<{ asks: RawLevels; bids: RawLevels }>(
      `${this.base}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${Math.min(limit, 100)}`,
    );
    return parseLevels(d.asks, d.bids);
  }

  async fetchAssetInfo(): Promise<AssetInfoState> {
    const creds = this.opts.creds;
    if (!creds) return { status: 'unavailable', reason: `Не задано ключі ${this.opts.label} (ендпоінт мереж приватний)` };
    const query = `timestamp=${Date.now()}&recvWindow=10000`;
    const sig = hmacHex('sha256', creds.secret, query);
    try {
      const rows = await fetchJson<CapitalCoin[]>(`${this.base}${this.opts.capitalPath}?${query}&signature=${sig}`, {
        headers: { [this.opts.keyHeader]: creds.apiKey },
      });
      return { status: 'ok', assets: capitalToAssets(this.id, rows), fetchedAt: Date.now() };
    } catch (e) {
      return { status: 'unavailable', reason: `${this.opts.label}: ${(e as Error).message}` };
    }
  }
}
