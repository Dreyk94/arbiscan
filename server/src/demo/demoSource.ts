import { normalizeContract } from '../domain/networks.js';
import {
  type AssetInfo,
  type AssetInfoState,
  type BookLevel,
  EXCLUDED_ASSETS,
  type ExchangeId,
  type OrderBook,
  QUOTE_ASSET,
  type SpotMarket,
} from '../domain/types.js';
import type { MarketDataSource } from '../exchanges/types.js';
import type { DemoScenario } from './scenario.js';

const SYMBOL = (ex: ExchangeId, base: string) =>
  ex === 'okx' || ex === 'kucoin' ? `${base}-${QUOTE_ASSET}` : ex === 'gate' ? `${base}_${QUOTE_ASSET}` : `${base}${QUOTE_ASSET}`;
const VOLUME_SHARE: Record<ExchangeId, number> = { okx: 1, bybit: 0.85, bitget: 0.6, gate: 0.55, mexc: 0.5, binance: 2.2, kucoin: 0.45 };

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Демонстраційне джерело даних: детерміновано генерує ціни, стакани та мережі
 * за сценарієм. Ціни повільно «дихають» у часі, частина зв'язок періодично
 * з'являється і зникає (для перевірки сповіщень і сортування за новизною).
 */
export class DemoSource implements MarketDataSource {
  readonly kind = 'demo' as const;
  private seed = 1;

  constructor(private scenario: DemoScenario, private readonly clock: () => number = Date.now) {}

  setScenario(s: DemoScenario): void {
    this.scenario = s;
  }

  getScenario(): DemoScenario {
    return this.scenario;
  }

  reseed(): void {
    this.seed = Math.floor(Math.random() * 1e9);
  }

  private coins() {
    return this.scenario.coins.filter((c) => !EXCLUDED_ASSETS.has(c.base));
  }

  private mid(coin: DemoScenario['coins'][number], ex: ExchangeId, now: number): number {
    const l = coin.listings[ex]!;
    const t = now / 1000;
    const phase = (hash(coin.base) % 1000) / 159;
    const drift = Math.sin(t / 90 + phase) * 0.004 + Math.sin(t / 23 + phase * 2) * 0.0015;
    const bucket = Math.floor(t / 5);
    const noise = (rng(hash(`${coin.base}:${ex}:${bucket}`) ^ this.seed)() - 0.5) * 0.002;
    let bias = l.bias;
    if (coin.flash && coin.flash.exchange === ex) {
      const offset = hash(coin.base) % coin.flash.periodSec;
      if ((t + offset) % coin.flash.periodSec < coin.flash.activeSec) bias += coin.flash.bias;
    }
    return coin.price * (1 + drift + noise) * (1 + bias / 100);
  }

  async fetchMarkets(ex: ExchangeId): Promise<SpotMarket[]> {
    const now = this.clock();
    const out: SpotMarket[] = [];
    for (const c of this.coins()) {
      const l = c.listings[ex];
      if (!l) continue;
      const book = this.book(ex, c.base, 1, now);
      out.push({
        exchange: ex,
        symbol: SYMBOL(ex, c.base),
        base: c.base,
        quote: QUOTE_ASSET,
        bestBid: book.bids[0][0],
        bestAsk: book.asks[0][0],
        last: (book.bids[0][0] + book.asks[0][0]) / 2,
        volume24hUsd: c.volume24hUsd * VOLUME_SHARE[ex],
        fullName: ex === 'bitget' || ex === 'gate' || ex === 'mexc' ? l.fullNameOverride ?? c.fullName : undefined,
        ts: now,
      });
    }
    return out;
  }

  async fetchOrderBook(ex: ExchangeId, symbol: string, limit: number): Promise<OrderBook> {
    const coin = this.coins().find((c) => SYMBOL(ex, c.base) === symbol && c.listings[ex]);
    if (!coin) throw new Error(`Demo: ринок ${symbol} не знайдено на ${ex}`);
    if (coin.listings[ex]?.bookUnavailable) throw new Error(`Demo: стакан ${symbol} на ${ex} тимчасово недоступний`);
    return this.book(ex, coin.base, limit, this.clock());
  }

  private book(ex: ExchangeId, base: string, levels: number, now: number): OrderBook {
    const coin = this.coins().find((c) => c.base === base)!;
    const l = coin.listings[ex]!;
    const mid = this.mid(coin, ex, now);
    const halfSpread = mid * 0.0003;
    const tick = mid * 0.0004;
    const r = rng(hash(`${base}:${ex}:book:${Math.floor(now / 5000)}`) ^ this.seed);
    // Ліквідність розподілена по рівнях: ~depthUsd на сторону в межах ~2% від mid
    const perLevelUsd = l.depthUsd / 50;
    const asks: BookLevel[] = [];
    const bids: BookLevel[] = [];
    for (let i = 0; i < levels; i++) {
      const w = 0.4 + r() * 1.2;
      const ap = mid + halfSpread + tick * i;
      const bp = mid - halfSpread - tick * i;
      asks.push([round(ap), (perLevelUsd * w) / ap]);
      bids.push([round(bp), (perLevelUsd * (0.4 + r() * 1.2)) / bp]);
    }
    return { asks, bids, ts: now };
  }

  async fetchAssetInfo(ex: ExchangeId): Promise<AssetInfoState> {
    const assets = new Map<string, AssetInfo>();
    for (const c of this.coins()) {
      const l = c.listings[ex];
      if (!l || l.noAssetInfo) continue;
      assets.set(c.base, {
        exchange: ex,
        coin: c.base,
        fullName: ex === 'bybit' ? undefined : l.fullNameOverride ?? c.fullName,
        chains: c.networks.map((n) => ({
          network: n.network,
          rawChain: n.network,
          contract: normalizeContract(l.contractOverride ?? n.contract),
          depositEnabled: !l.depositDisabled,
          withdrawEnabled: !l.withdrawDisabled,
          withdrawFee: n.withdrawFee,
        })),
      });
    }
    return { status: 'ok', assets, fetchedAt: this.clock() };
  }
}

function round(p: number): number {
  const digits = p >= 1000 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 10;
  return Number(p.toFixed(digits));
}
