import type {
  ExchangeId,
  NetworkStatus,
  Opportunity,
  OrderbookStatus,
  ProfitStatus,
  SuspiciousReason,
  TransferStatus,
  VolatilityLevel,
  WarningCode,
} from './types.js';

/** Підсумковий вердикт зв'язки для аналізу хибних спрацювань */
export type JournalVerdict = 'actionable' | 'blocked' | 'unprofitable' | 'suspicious' | 'unverified';

export interface JournalEntry {
  id: string;
  opportunityId: string;
  base: string;
  buyExchange: ExchangeId;
  sellExchange: ExchangeId;
  firstSeenAt: number;
  lastSeenAt: number;
  /** null — зв'язка ще активна */
  closedAt: number | null;
  seenCount: number;
  /** Спред у момент появи, % */
  spreadPct: number;
  maxSpreadPct: number;
  lastSpreadPct: number;
  tradeSizeUsd: number;
  netProfitUsd: number;
  maxNetProfitUsd: number;
  /** Спред за VWAP у момент появи, % */
  vwapSpreadPct: number;
  orderbookStatus: OrderbookStatus;
  enough: boolean | null;
  buyDepthUsd: number;
  sellDepthUsd: number;
  networkStatus: NetworkStatus;
  transferStatus: TransferStatus;
  network?: string;
  networkFeeUsd: number;
  volatilityLevel: VolatilityLevel;
  profitStatus: ProfitStatus;
  suspicious: boolean;
  suspiciousReasons: SuspiciousReason[];
  warnings: WarningCode[];
  /** Вердикт у момент появи та останній відомий */
  firstVerdict: JournalVerdict;
  verdict: JournalVerdict;
  /** Хоч раз за час життя зв'язка була робочою */
  everActionable: boolean;
}

export interface JournalStats {
  total: number;
  active: number;
  byVerdict: Record<JournalVerdict, number>;
  /** Частка зв'язок, які жодного разу не були робочими, % */
  falseSignalPct: number;
}

export interface JournalOptions {
  minSpreadPct: number;
  maxEntries: number;
}

export function verdictOf(o: Opportunity): JournalVerdict {
  if (o.suspicious) return 'suspicious';
  if (o.transfer.status === 'blocked' || o.networkStatus === 'mismatch' || o.networkStatus === 'no_common') return 'blocked';
  if (o.warnings.some((w) => w.severity === 'block')) return 'blocked';
  if (o.trade.netProfitUsd <= 0) return 'unprofitable';
  if (o.profitStatus !== 'confirmed') return 'unverified';
  return 'actionable';
}

function snapshot(o: Opportunity) {
  return {
    lastSpreadPct: o.spreadPct,
    orderbookStatus: o.orderbookStatus,
    enough: o.trade.enough,
    buyDepthUsd: o.buyDepthUsd,
    sellDepthUsd: o.sellDepthUsd,
    networkStatus: o.networkStatus,
    transferStatus: o.transfer.status,
    network: o.route?.network,
    networkFeeUsd: o.trade.networkFeeUsd,
    volatilityLevel: o.volatility.level,
    profitStatus: o.profitStatus,
    suspicious: o.suspicious,
    suspiciousReasons: o.suspiciousReasons,
    warnings: o.warnings.map((w) => w.code),
    verdict: verdictOf(o),
  };
}

export function openEntry(o: Opportunity, now: number): JournalEntry {
  const snap = snapshot(o);
  return {
    id: `${o.id}@${now}`,
    opportunityId: o.id,
    base: o.base,
    buyExchange: o.buyExchange,
    sellExchange: o.sellExchange,
    firstSeenAt: now,
    lastSeenAt: now,
    closedAt: null,
    seenCount: 1,
    spreadPct: o.spreadPct,
    maxSpreadPct: o.spreadPct,
    tradeSizeUsd: o.trade.targetUsd,
    netProfitUsd: o.trade.netProfitUsd,
    maxNetProfitUsd: o.trade.netProfitUsd,
    vwapSpreadPct: o.slippage.vwapSpreadPct,
    firstVerdict: snap.verdict,
    everActionable: o.actionable,
    ...snap,
  };
}

export function touchEntry(e: JournalEntry, o: Opportunity, now: number): JournalEntry {
  return {
    ...e,
    ...snapshot(o),
    lastSeenAt: now,
    seenCount: e.seenCount + 1,
    maxSpreadPct: Math.max(e.maxSpreadPct, o.spreadPct),
    maxNetProfitUsd: Math.max(e.maxNetProfitUsd, o.trade.netProfitUsd),
    everActionable: e.everActionable || o.actionable,
  };
}

/**
 * Журнал зв'язок: веде записи для кожної появи спреду ≥ minSpreadPct,
 * закриває запис, коли зв'язка зникає або падає нижче порога.
 */
export class Journal {
  private entries: JournalEntry[];
  private readonly open = new Map<string, JournalEntry>();
  private dirty = false;

  constructor(
    initial: JournalEntry[] = [],
    private readonly persist: (entries: JournalEntry[]) => void = () => {},
  ) {
    this.entries = [...initial];
    for (const e of this.entries) if (e.closedAt === null) this.open.set(e.opportunityId, e);
  }

  observe(opportunities: Opportunity[], now: number, opts: JournalOptions): void {
    const seen = new Set<string>();
    for (const o of opportunities) {
      if (o.spreadPct < opts.minSpreadPct) continue;
      seen.add(o.id);
      const prev = this.open.get(o.id);
      if (prev) {
        this.replace(prev, touchEntry(prev, o, now));
      } else {
        const e = openEntry(o, now);
        this.entries.push(e);
        this.open.set(o.id, e);
      }
      this.dirty = true;
    }
    for (const [id, e] of this.open) {
      if (seen.has(id)) continue;
      this.replace(e, { ...e, closedAt: now });
      this.open.delete(id);
      this.dirty = true;
    }
    if (this.entries.length > opts.maxEntries) {
      const closed = this.entries.filter((e) => e.closedAt !== null).sort((a, b) => a.firstSeenAt - b.firstSeenAt);
      const drop = new Set(closed.slice(0, this.entries.length - opts.maxEntries).map((e) => e.id));
      this.entries = this.entries.filter((e) => !drop.has(e.id));
      this.dirty = true;
    }
    this.flush();
  }

  /** Закриває всі активні записи (наприклад, при зміні режиму даних). */
  closeAll(now: number): void {
    for (const [id, e] of this.open) {
      this.replace(e, { ...e, closedAt: now });
      this.open.delete(id);
      this.dirty = true;
    }
    this.flush();
  }

  list(filter: { limit?: number; base?: string; since?: number; verdict?: JournalVerdict } = {}): JournalEntry[] {
    let out = this.entries;
    if (filter.base) out = out.filter((e) => e.base === filter.base);
    if (filter.since) out = out.filter((e) => e.lastSeenAt >= filter.since!);
    if (filter.verdict) out = out.filter((e) => e.verdict === filter.verdict);
    out = [...out].sort((a, b) => b.firstSeenAt - a.firstSeenAt);
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  stats(entries: JournalEntry[] = this.entries): JournalStats {
    const byVerdict: Record<JournalVerdict, number> = { actionable: 0, blocked: 0, unprofitable: 0, suspicious: 0, unverified: 0 };
    let active = 0;
    let never = 0;
    for (const e of entries) {
      byVerdict[e.verdict]++;
      if (e.closedAt === null) active++;
      if (!e.everActionable) never++;
    }
    return {
      total: entries.length,
      active,
      byVerdict,
      falseSignalPct: entries.length ? (never / entries.length) * 100 : 0,
    };
  }

  clear(): void {
    this.entries = [];
    this.open.clear();
    this.dirty = true;
    this.flush();
  }

  private replace(prev: JournalEntry, next: JournalEntry): void {
    const idx = this.entries.indexOf(prev);
    if (idx >= 0) this.entries[idx] = next;
    else this.entries.push(next);
    if (next.closedAt === null) this.open.set(next.opportunityId, next);
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.persist(this.entries);
  }
}

export function journalToCsv(entries: JournalEntry[]): string {
  const cols: Array<[string, (e: JournalEntry) => unknown]> = [
    ['first_seen', (e) => new Date(e.firstSeenAt).toISOString()],
    ['last_seen', (e) => new Date(e.lastSeenAt).toISOString()],
    ['closed_at', (e) => (e.closedAt ? new Date(e.closedAt).toISOString() : '')],
    ['duration_sec', (e) => Math.round(((e.closedAt ?? e.lastSeenAt) - e.firstSeenAt) / 1000)],
    ['base', (e) => e.base],
    ['buy_exchange', (e) => e.buyExchange],
    ['sell_exchange', (e) => e.sellExchange],
    ['spread_pct', (e) => e.spreadPct.toFixed(3)],
    ['max_spread_pct', (e) => e.maxSpreadPct.toFixed(3)],
    ['vwap_spread_pct', (e) => e.vwapSpreadPct.toFixed(3)],
    ['trade_size_usd', (e) => e.tradeSizeUsd],
    ['net_profit_usd', (e) => e.netProfitUsd.toFixed(2)],
    ['max_net_profit_usd', (e) => e.maxNetProfitUsd.toFixed(2)],
    ['orderbook', (e) => e.orderbookStatus],
    ['buy_depth_usd', (e) => Math.round(e.buyDepthUsd)],
    ['sell_depth_usd', (e) => Math.round(e.sellDepthUsd)],
    ['network', (e) => e.networkStatus],
    ['transfer', (e) => e.transferStatus],
    ['route', (e) => e.network ?? ''],
    ['network_fee_usd', (e) => e.networkFeeUsd.toFixed(2)],
    ['volatility', (e) => e.volatilityLevel],
    ['first_verdict', (e) => e.firstVerdict],
    ['verdict', (e) => e.verdict],
    ['ever_actionable', (e) => (e.everActionable ? 1 : 0)],
    ['warnings', (e) => e.warnings.join('|')],
    ['seen_count', (e) => e.seenCount],
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(([c]) => c).join(',')];
  for (const e of entries) lines.push(cols.map(([, f]) => esc(f(e))).join(','));
  return lines.join('\n');
}
