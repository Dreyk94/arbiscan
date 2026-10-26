import crypto from 'node:crypto';
import { normalizeContract, normalizeNetwork } from '../domain/networks.js';
import { type AssetInfo, type AssetInfoState, EXCLUDED_ASSETS, type OrderBook, QUOTE_ASSET, type SpotMarket } from '../domain/types.js';
import { hmacHex, isAllowedSpot, parseLevels, type RawLevels } from './cex.js';
import { fetchJson, num } from './http.js';
import type { ExchangeAdapter } from './types.js';

const BASE = 'https://api.gateio.ws';
const PREFIX = '/api/v4';

/**
 * Gate.io Spot v4. Мережі/контракти/статус депозиту й виводу — публічно (/spot/currencies).
 * Комісії виводу — приватний /wallet/withdraw_status (потрібні GATE_API_KEY / GATE_API_SECRET);
 * без ключів комісія невідома (NaN) і прибуток лишається попереднім.
 */
export class GateAdapter implements ExchangeAdapter {
  readonly id = 'gate' as const;
  constructor(private readonly creds?: { apiKey: string; secret: string }) {}

  async fetchMarkets(): Promise<SpotMarket[]> {
    const [pairs, tickers] = await Promise.all([
      fetchJson<Array<{ id: string; base: string; quote: string; base_name?: string; trade_status: string }>>(`${BASE}${PREFIX}/spot/currency_pairs`),
      fetchJson<Array<{ currency_pair: string; lowest_ask: string; highest_bid: string; last: string; quote_volume: string }>>(
        `${BASE}${PREFIX}/spot/tickers`,
      ),
    ]);
    const tick = new Map(tickers.map((t) => [t.currency_pair, t]));
    const out: SpotMarket[] = [];
    const now = Date.now();
    for (const p of pairs) {
      if (p.trade_status !== 'tradable' || !isAllowedSpot(p.base, p.quote)) continue;
      const t = tick.get(p.id);
      if (!t || !num(t.lowest_ask) || !num(t.highest_bid)) continue;
      out.push({
        exchange: this.id,
        symbol: p.id,
        base: p.base,
        quote: p.quote,
        bestBid: num(t.highest_bid),
        bestAsk: num(t.lowest_ask),
        last: num(t.last),
        volume24hUsd: num(t.quote_volume),
        fullName: p.base_name || undefined,
        ts: now,
      });
    }
    return out;
  }

  async fetchOrderBook(symbol: string, limit: number): Promise<OrderBook> {
    const d = await fetchJson<{ asks: RawLevels; bids: RawLevels; current?: number }>(
      `${BASE}${PREFIX}/spot/order_book?currency_pair=${encodeURIComponent(symbol)}&limit=${Math.min(limit, 100)}`,
    );
    return parseLevels(d.asks, d.bids, d.current);
  }

  private async fetchFees(): Promise<Map<string, Record<string, string>> | null> {
    if (!this.creds) return null;
    const path = `${PREFIX}/wallet/withdraw_status`;
    const ts = Math.floor(Date.now() / 1000).toString();
    const bodyHash = crypto.createHash('sha512').update('').digest('hex');
    const sign = hmacHex('sha512', this.creds.secret, `GET\n${path}\n\n${bodyHash}\n${ts}`);
    const rows = await fetchJson<Array<{ currency: string; withdraw_fix_on_chains?: Record<string, string> }>>(BASE + path, {
      headers: { KEY: this.creds.apiKey, Timestamp: ts, SIGN: sign },
    });
    return new Map(rows.map((r) => [r.currency, r.withdraw_fix_on_chains ?? {}]));
  }

  async fetchAssetInfo(): Promise<AssetInfoState> {
    try {
      const [rows, fees] = await Promise.all([
        fetchJson<Array<{ currency: string; name?: string; delisted?: boolean; chains?: Array<{ name: string; addr?: string; withdraw_disabled: boolean; deposit_disabled: boolean }> }>>(
          `${BASE}${PREFIX}/spot/currencies`,
        ),
        this.fetchFees().catch(() => null),
      ]);
      const assets = new Map<string, AssetInfo>();
      for (const r of rows) {
        if (r.delisted || (EXCLUDED_ASSETS.has(r.currency) && r.currency !== QUOTE_ASSET)) continue;
        const fee = fees?.get(r.currency);
        assets.set(r.currency, {
          exchange: this.id,
          coin: r.currency,
          fullName: r.name || undefined,
          chains: (r.chains ?? []).map((c) => ({
            network: normalizeNetwork(c.name, r.currency),
            rawChain: c.name,
            contract: normalizeContract(c.addr),
            depositEnabled: !c.deposit_disabled,
            withdrawEnabled: !c.withdraw_disabled,
            withdrawFee: fee && fee[c.name] !== undefined ? num(fee[c.name]) : Number.NaN,
          })),
        });
      }
      return { status: 'ok', assets, fetchedAt: Date.now() };
    } catch (e) {
      return { status: 'unavailable', reason: `Gate currencies: ${(e as Error).message}` };
    }
  }
}
