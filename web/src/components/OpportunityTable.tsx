import clsx from 'clsx';
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import type { SortDir, SortKey } from '../lib/filters';
import { fmtPct, fmtPrice, fmtSignedUsd, fmtUsdCompact, timeAgo } from '../lib/format';
import type { Opportunity } from '../types';
import { isBlocked } from '../lib/filters';
import { ExchangeTag, NetworkBadge, OrderbookBadge, ProfitBadge, SuspiciousBadge, VolatilityBadge, WarningsBadge } from './Badges';
import { OpportunityDetails } from './OpportunityDetails';

interface Props {
  items: Opportunity[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  expanded: string | null;
  onToggle: (id: string) => void;
  highlight: string | null;
  now: number;
  newSince: number;
}

function SortHead({ k, label, sortKey, sortDir, onSort, className }: { k: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; className?: string }) {
  const active = sortKey === k;
  return (
    <th className={clsx('px-3 py-2.5 font-medium', className)}>
      <button className={clsx('inline-flex items-center gap-1 hover:text-white', active && 'text-emerald-300')} onClick={() => onSort(k)}>
        {label}
        {active && (sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    </th>
  );
}

function Enough({ o }: { o: Opportunity }) {
  if (o.trade.enough === null) return <span className="text-xs text-slate-500" title="Стакан не перевірено">?</span>;
  return o.trade.enough ? (
    <span className="text-xs font-semibold text-emerald-300">Так</span>
  ) : (
    <span className="text-xs font-semibold text-amber-300">Ні</span>
  );
}

function Profit({ o }: { o: Opportunity }) {
  const v = o.trade.netProfitUsd;
  const dead = o.suspicious || isBlocked(o);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={clsx('num text-sm font-semibold', dead ? 'text-slate-500 line-through' : v > 0 ? 'text-emerald-300' : 'text-rose-300')}>{fmtSignedUsd(v)}</span>
      <span className={clsx('text-[10px]', o.transfer.status === 'blocked' ? 'text-rose-400' : 'text-slate-500')}>
        {o.transfer.status === 'blocked' ? 'переказ закрито' : o.profitStatus === 'confirmed' ? 'після всіх витрат' : 'попередній'}
      </span>
    </div>
  );
}

function SpreadCell({ o }: { o: Opportunity }) {
  const vwap = o.slippage.vwapSpreadPct;
  const showVwap = o.orderbookStatus !== 'unverified' && Math.abs(vwap - o.spreadPct) >= 0.005;
  return (
    <div className="flex flex-col items-end">
      <span className={clsx('num font-semibold', o.spreadPct >= 2 ? 'text-emerald-300' : 'text-slate-200')}>{fmtPct(o.spreadPct)}</span>
      {showVwap && (
        <span className={clsx('num text-[10px]', vwap <= 0 ? 'text-rose-400' : 'text-slate-500')} title={`Спред за VWAP на $${o.trade.targetUsd} з урахуванням прослизання`}>
          VWAP {fmtPct(vwap)}
        </span>
      )}
    </div>
  );
}

export function OpportunityTable({ items, sortKey, sortDir, onSort, expanded, onToggle, highlight, now, newSince }: Props) {
  const rowRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (highlight) rowRefs.current.get(highlight)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);
  const isNew = (o: Opportunity) => o.firstSeenAt > newSince && now - o.firstSeenAt < 60_000;
  const sh = { sortKey, sortDir, onSort };

  return (
    <>
      {/* ПК: таблиця */}
      <div className="card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5 bg-white/[0.02] text-left text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-medium">Актив / маршрут</th>
                <SortHead k="price" label="Ціна купівлі → продажу" {...sh} />
                <SortHead k="spread" label="Спред" {...sh} className="text-right" />
                <SortHead k="liquidity" label="Обсяг купити / продати" {...sh} className="text-right" />
                <th className="px-3 py-2.5 text-center font-medium">${items[0]?.trade.targetUsd ?? 100}?</th>
                <SortHead k="profit" label="Прибуток" {...sh} className="text-right" />
                <th className="px-3 py-2.5 font-medium">Статус</th>
                <SortHead k="novelty" label="Новизна" {...sh} />
                <SortHead k="popularity" label="Обіг 24г" {...sh} className="text-right" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <Fragment key={o.id}>
                  <tr
                    ref={(el) => {
                      if (el) rowRefs.current.set(o.id, el);
                    }}
                    onClick={() => onToggle(o.id)}
                    className={clsx(
                      'cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.03]',
                      (o.suspicious || o.transfer.status === 'blocked') && 'opacity-60',
                      highlight === o.id && 'animate-flash',
                      expanded === o.id && 'bg-white/[0.03]',
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{o.base}</span>
                        {isNew(o) && <span className="rounded bg-emerald-400 px-1 text-[10px] font-bold text-ink-950">NEW</span>}
                        <SuspiciousBadge o={o} />
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <ExchangeTag id={o.buyExchange} base={o.base} />
                        <ArrowRight size={12} className="text-slate-500" />
                        <ExchangeTag id={o.sellExchange} base={o.base} />
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-xs">
                      <div className="text-slate-200">{fmtPrice(o.buyPrice)}</div>
                      <div className="text-slate-400">{fmtPrice(o.sellPrice)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <SpreadCell o={o} />
                    </td>
                    <td className="num px-3 py-2.5 text-right text-xs">
                      {o.orderbookStatus === 'unverified' ? (
                        <span className="text-slate-500">не перевірено</span>
                      ) : (
                        <>
                          <div className="text-slate-200">{fmtUsdCompact(o.buyDepthUsd)}</div>
                          <div className="text-slate-400">{fmtUsdCompact(o.sellDepthUsd)}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Enough o={o} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Profit o={o} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        <ProfitBadge o={o} />
                        <OrderbookBadge status={o.orderbookStatus} />
                        <NetworkBadge status={o.networkStatus} />
                        <VolatilityBadge v={o.volatility} />
                        <WarningsBadge o={o} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-slate-400">{timeAgo(o.firstSeenAt, now)}</td>
                    <td className="num px-3 py-2.5 text-right text-xs text-slate-300">{fmtUsdCompact(o.volume24hUsd)}</td>
                    <td className="px-2">
                      <ChevronDown size={16} className={clsx('text-slate-500 transition-transform', expanded === o.id && 'rotate-180')} />
                    </td>
                  </tr>
                  {expanded === o.id && (
                    <tr className="border-b border-white/5 bg-ink-850/60">
                      <td colSpan={10}>
                        <OpportunityDetails o={o} now={now} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Мобільні: картки */}
      <div className="space-y-2 md:hidden">
        {items.map((o) => (
          <article
            key={o.id}
            ref={(el) => {
              if (el) rowRefs.current.set(`${o.id}`, el);
            }}
            className={clsx('card overflow-hidden', (o.suspicious || o.transfer.status === 'blocked') && 'opacity-60', highlight === o.id && 'animate-flash')}
          >
            <button className="w-full p-3 text-left" onClick={() => onToggle(o.id)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-white">{o.base}</span>
                    {isNew(o) && <span className="rounded bg-emerald-400 px-1 text-[10px] font-bold text-ink-950">NEW</span>}
                    <SuspiciousBadge o={o} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <ExchangeTag id={o.buyExchange} />
                    <ArrowRight size={12} className="text-slate-500" />
                    <ExchangeTag id={o.sellExchange} />
                  </div>
                </div>
                <div className="text-right">
                  <div className={clsx('num text-lg font-bold', o.spreadPct >= 2 ? 'text-emerald-300' : 'text-slate-100')}>{fmtPct(o.spreadPct)}</div>
                  {o.orderbookStatus !== 'unverified' && <div className="num text-[10px] text-slate-500">VWAP {fmtPct(o.slippage.vwapSpreadPct)}</div>}
                  <Profit o={o} />
                </div>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-500">Купити</div>
                  <div className="num text-slate-200">{o.orderbookStatus === 'unverified' ? '—' : fmtUsdCompact(o.buyDepthUsd)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Продати</div>
                  <div className="num text-slate-200">{o.orderbookStatus === 'unverified' ? '—' : fmtUsdCompact(o.sellDepthUsd)}</div>
                </div>
                <div>
                  <div className="text-slate-500">${o.trade.targetUsd}?</div>
                  <Enough o={o} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <ProfitBadge o={o} />
                <OrderbookBadge status={o.orderbookStatus} />
                <NetworkBadge status={o.networkStatus} />
                <VolatilityBadge v={o.volatility} />
                <WarningsBadge o={o} />
                <span className="ml-auto self-center text-[10px] text-slate-500">{timeAgo(o.firstSeenAt, now)}</span>
              </div>
            </button>
            {expanded === o.id && (
              <div className="border-t border-white/5 bg-ink-850/60">
                <OpportunityDetails o={o} now={now} />
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
