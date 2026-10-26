import type { Settings } from './config/settings.js';
import type { SettingsStore } from './config/settingsStore.js';
import { evaluatePair, findPriceOutliers } from './domain/arbitrage.js';
import type { Journal } from './domain/journal.js';
import { getAsset } from './domain/verification.js';
import { assessVolatility, PriceHistory } from './domain/volatility.js';
import {
  type AssetInfoState,
  EXCHANGES,
  EXCLUDED_ASSETS,
  type ExchangeHealth,
  type ExchangeId,
  type Opportunity,
  type OrderBook,
  QUOTE_ASSET,
  type SpotMarket,
} from './domain/types.js';
import { createLimiter } from './exchanges/http.js';
import type { MarketDataSource } from './exchanges/types.js';

/** Стакан старший за цей час вважається неперевіреним */
const BOOK_MAX_AGE_MS = 60_000;

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

interface SeenEntry {
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
}

export class Scanner {
  private opportunities: Opportunity[] = [];
  private seen = new Map<string, SeenEntry>();
  private assetCache = new Map<ExchangeId, AssetInfoState & { cachedAt: number }>();
  private prices = new PriceHistory();
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private meta: ScanMeta;

  constructor(
    private readonly store: SettingsStore,
    private readonly sources: { demo: MarketDataSource; live: MarketDataSource },
    private readonly clock: () => number = Date.now,
    private readonly journal?: Journal,
  ) {
    this.meta = this.emptyMeta(store.get().dataMode);
    store.onChange((next, prev) => {
      if (next.dataMode !== prev.dataMode) this.resetState(next.dataMode);
      this.reschedule(1000);
    });
  }

  start(): void {
    this.reschedule(0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  resetState(mode = this.store.get().dataMode): void {
    this.opportunities = [];
    this.seen.clear();
    this.assetCache.clear();
    this.prices.clear();
    this.journal?.closeAll(this.clock());
    this.meta = this.emptyMeta(mode);
  }

  getSnapshot(): { opportunities: Opportunity[]; meta: ScanMeta } {
    return { opportunities: this.opportunities, meta: this.meta };
  }

  /** Запускає цикл сканування (або чекає вже запущений). */
  async scanNow(): Promise<void> {
    if (!this.running) {
      this.running = this.scan().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private reschedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        await this.scanNow();
      } finally {
        this.reschedule(this.store.get().scanIntervalSec * 1000);
      }
    }, delayMs);
  }

  private emptyMeta(mode: 'demo' | 'live'): ScanMeta {
    return {
      mode,
      cycle: 0,
      scannedAt: null,
      durationMs: 0,
      marketsTotal: 0,
      basesCompared: 0,
      candidates: 0,
      booksFetched: 0,
      booksFailed: 0,
      exchanges: EXCHANGES.map((ex) => ({
        exchange: ex,
        enabled: this.store.get().exchanges[ex].enabled,
        ok: false,
        markets: 0,
        assetInfo: 'unavailable' as const,
        updatedAt: 0,
      })),
    };
  }

  private async scan(): Promise<void> {
    const settings = this.store.get();
    const source = this.sources[settings.dataMode];
    const started = this.clock();
    const enabled = EXCHANGES.filter((ex) => settings.exchanges[ex].enabled);

    try {
      const [marketResults, assetStates] = await Promise.all([
        Promise.all(
          enabled.map(async (ex) => {
            const t0 = this.clock();
            try {
              const markets = await source.fetchMarkets(ex);
              return { ex, markets, latency: this.clock() - t0 };
            } catch (e) {
              return { ex, markets: [] as SpotMarket[], error: (e as Error).message, latency: this.clock() - t0 };
            }
          }),
        ),
        Promise.all(enabled.map(async (ex) => [ex, await this.getAssetInfo(source, ex)] as const)),
      ]);
      const assets = new Map<ExchangeId, AssetInfoState>(assetStates);

      const byBase = new Map<string, SpotMarket[]>();
      for (const r of marketResults) {
        for (const m of r.markets) {
          if (m.quote !== QUOTE_ASSET || EXCLUDED_ASSETS.has(m.base)) continue;
          if (!(m.bestBid > 0 && m.bestAsk > 0) || m.bestAsk < m.bestBid * 0.5) continue;
          if (m.volume24hUsd < settings.minVolume24hUsd) continue;
          const list = byBase.get(m.base) ?? [];
          list.push(m);
          byBase.set(m.base, list);
        }
      }

      const priceTs = this.clock();
      for (const markets of byBase.values()) {
        for (const m of markets) this.prices.record(bookKey(m), (m.bestBid + m.bestAsk) / 2, priceTs);
      }
      this.prices.prune(priceTs);

      const candidates = this.findCandidates(byBase, settings);
      const books = await this.fetchBooks(source, candidates, settings);

      const now = this.clock();
      const windowMs = settings.volatility.windowSec * 1000;
      const fetchedAt = (ex: ExchangeId) => {
        const a = assets.get(ex);
        return a?.status === 'ok' ? a.fetchedAt : undefined;
      };
      const result: Opportunity[] = [];
      for (const c of candidates) {
        const evaluated = evaluatePair({
          buy: c.buy,
          sell: c.sell,
          buyBook: books.get(bookKey(c.buy)),
          sellBook: books.get(bookKey(c.sell)),
          buyAsset: getAsset(assets.get(c.buy.exchange), c.buy.base),
          sellAsset: getAsset(assets.get(c.sell.exchange), c.sell.base),
          priceOutlier: c.outlier,
          volatility: assessVolatility(
            this.prices.move(bookKey(c.buy), now, windowMs),
            this.prices.move(bookKey(c.sell), now, windowMs),
            settings.volatility,
          ),
          assetInfoFetchedAt: { buy: fetchedAt(c.buy.exchange), sell: fetchedAt(c.sell.exchange) },
          settings,
          now,
        });
        const prev = this.seen.get(evaluated.id);
        const entry: SeenEntry = prev
          ? { firstSeenAt: prev.firstSeenAt, lastSeenAt: now, seenCount: prev.seenCount + 1 }
          : { firstSeenAt: now, lastSeenAt: now, seenCount: 1 };
        this.seen.set(evaluated.id, entry);
        result.push({ ...evaluated, ...entry });
      }
      for (const [id, s] of this.seen) {
        if (now - s.lastSeenAt > settings.staleAfterSec * 1000) this.seen.delete(id);
      }

      this.opportunities = result.sort((a, b) => b.spreadPct - a.spreadPct);
      if (settings.journal.enabled) this.journal?.observe(this.opportunities, now, settings.journal);
      this.meta = {
        mode: settings.dataMode,
        cycle: this.meta.cycle + 1,
        scannedAt: now,
        durationMs: now - started,
        marketsTotal: marketResults.reduce((s, r) => s + r.markets.length, 0),
        basesCompared: [...byBase.values()].filter((l) => l.length > 1).length,
        candidates: candidates.length,
        booksFetched: books.size,
        booksFailed: this.lastBookFailures,
        exchanges: EXCHANGES.map((ex) => {
          const r = marketResults.find((x) => x.ex === ex);
          const a = assets.get(ex);
          return {
            exchange: ex,
            enabled: settings.exchanges[ex].enabled,
            ok: Boolean(r && !r.error),
            markets: r?.markets.length ?? 0,
            error: r?.error,
            assetInfo: a?.status === 'ok' ? 'ok' : 'unavailable',
            assetInfoReason: a?.status === 'unavailable' ? a.reason : undefined,
            latencyMs: r?.latency,
            updatedAt: now,
          };
        }),
      };
    } catch (e) {
      this.meta = { ...this.meta, error: (e as Error).message, scannedAt: this.clock() };
      console.error('[scanner] Помилка циклу:', e);
    }
  }

  private findCandidates(byBase: Map<string, SpotMarket[]>, settings: Settings) {
    const out: Array<{ buy: SpotMarket; sell: SpotMarket; spread: number; outlier: boolean }> = [];
    for (const markets of byBase.values()) {
      if (markets.length < 2) continue;
      const outliers = findPriceOutliers(markets, settings.maxPlausibleSpreadPct / 2);
      for (const buy of markets) {
        for (const sell of markets) {
          if (buy.exchange === sell.exchange) continue;
          const spread = ((sell.bestBid - buy.bestAsk) / buy.bestAsk) * 100;
          if (spread < settings.minCandidateSpreadPct) continue;
          out.push({ buy, sell, spread, outlier: outliers.has(buy.exchange) || outliers.has(sell.exchange) });
        }
      }
    }
    // Правдоподібні спреди мають пріоритет над аномальними при обмеженні кількості кандидатів
    const plausible = (c: { spread: number; outlier: boolean }) => !c.outlier && c.spread <= settings.maxPlausibleSpreadPct;
    out.sort((a, b) => Number(plausible(b)) - Number(plausible(a)) || b.spread - a.spread);
    return out.slice(0, settings.maxCandidates);
  }

  private lastBookFailures = 0;

  private async fetchBooks(
    source: MarketDataSource,
    candidates: Array<{ buy: SpotMarket; sell: SpotMarket }>,
    settings: Settings,
  ): Promise<Map<string, OrderBook>> {
    const needed = new Map<string, SpotMarket>();
    for (const c of candidates) {
      needed.set(bookKey(c.buy), c.buy);
      needed.set(bookKey(c.sell), c.sell);
    }
    const limit = createLimiter(source.kind === 'live' ? 4 : 16);
    const books = new Map<string, OrderBook>();
    let failures = 0;
    await Promise.all(
      [...needed.entries()].map(([key, m]) =>
        limit(async () => {
          try {
            const book = await source.fetchOrderBook(m.exchange, m.symbol, settings.orderbookLimit);
            if (this.clock() - book.ts > BOOK_MAX_AGE_MS) throw new Error('застарілий стакан');
            books.set(key, book);
          } catch (e) {
            failures++;
            console.warn(`[scanner] Стакан ${m.exchange}:${m.symbol} недоступний: ${(e as Error).message}`);
          }
        }),
      ),
    );
    this.lastBookFailures = failures;
    return books;
  }

  private async getAssetInfo(source: MarketDataSource, ex: ExchangeId): Promise<AssetInfoState> {
    const cached = this.assetCache.get(ex);
    const ttl = cached?.status === 'ok' ? this.store.get().assetInfoRefreshSec * 1000 : 60_000;
    if (cached && this.clock() - cached.cachedAt < ttl && source.kind === 'live') return cached;
    try {
      const state = await source.fetchAssetInfo(ex);
      this.assetCache.set(ex, { ...state, cachedAt: this.clock() });
      return state;
    } catch (e) {
      const state: AssetInfoState = { status: 'unavailable', reason: (e as Error).message };
      this.assetCache.set(ex, { ...state, cachedAt: this.clock() });
      return state;
    }
  }
}

function bookKey(m: SpotMarket): string {
  return `${m.exchange}:${m.symbol}`;
}
