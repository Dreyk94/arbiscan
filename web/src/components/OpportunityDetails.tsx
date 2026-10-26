import clsx from 'clsx';
import { AlertTriangle, Ban, CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { fmtPct, fmtPrice, fmtQty, fmtSignedUsd, fmtUsd, timeAgo } from '../lib/format';
import { EXCHANGE_LABELS, type Opportunity } from '../types';
import { NETWORK_TEXT, SUSPICIOUS_TEXT, TRANSFER_TEXT, VOLATILITY_TEXT } from '../lib/labels';
import { tradeUrl } from '../lib/tradeUrl';

function Row({ k, v, strong, tone }: { k: string; v: React.ReactNode; strong?: boolean; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-rose-300' : strong ? 'text-white' : 'text-slate-200';
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-slate-400">{k}</span>
      <span className={clsx('num text-right', strong && 'font-semibold', color)}>{v}</span>
    </div>
  );
}

function Flag({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 size={13} className="inline text-emerald-300" /> : <XCircle size={13} className="inline text-rose-300" />;
}

const pct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '>100%');

export function OpportunityDetails({ o, now }: { o: Opportunity; now: number }) {
  const t = o.trade;
  const buy = EXCHANGE_LABELS[o.buyExchange];
  const sell = EXCHANGE_LABELS[o.sellExchange];
  const booksOk = o.orderbookStatus !== 'unverified';
  const transfer = TRANSFER_TEXT[o.transfer.status];
  const vol = VOLATILITY_TEXT[o.volatility.level];
  const blockers = o.warnings.filter((w) => w.severity === 'block');
  const warns = o.warnings.filter((w) => w.severity === 'warn');
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-4">
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 2xl:col-span-4">
        {([['Купити', o.buyExchange], ['Продати', o.sellExchange]] as const).map(([verb, ex]) => (
          <a key={verb} href={tradeUrl(ex, o.base)} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs">
            {verb} {o.base} на {EXCHANGE_LABELS[ex]}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ))}
        {o.actionable ? (
          <span className="ml-auto text-xs text-emerald-300">Робоча зв’язка: переказ відкритий, прибуток після всіх витрат додатний</span>
        ) : (
          <span className="ml-auto text-xs text-slate-400">Не подається як робоча{o.suspicious ? ' (підозріла)' : blockers.length ? ' (заблокована)' : t.netProfitUsd <= 0 ? ' (збиткова)' : ''}</span>
        )}
      </div>

      {(blockers.length > 0 || warns.length > 0 || o.suspicious) && (
        <ul className="space-y-1 sm:col-span-2 2xl:col-span-4">
          {o.suspicious && (
            <li className="flex items-start gap-2 rounded-md bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Підозріла зв’язка: {o.suspiciousReasons.map((r) => SUSPICIOUS_TEXT[r]).join(', ')}. Ймовірно, це різні активи або помилкова ціна — не вважайте її реальною можливістю.
            </li>
          )}
          {blockers.map((w) => (
            <li key={w.code} className="flex items-start gap-2 rounded-md bg-rose-500/10 px-2 py-1.5 text-xs text-rose-300">
              <Ban size={14} className="mt-0.5 shrink-0" /> {w.message}
            </li>
          ))}
          {warns.map((w) => (
            <li key={w.code} className="flex items-start gap-2 rounded-md bg-amber-400/10 px-2 py-1.5 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w.message}
            </li>
          ))}
        </ul>
      )}

      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Симуляція угоди на ${t.targetUsd}</h4>
        <Row k={`Купівля на ${buy} (VWAP)`} v={`${fmtUsd(t.spentUsd, true)} @ ${fmtPrice(t.buyVwap)}`} />
        <Row k={`Комісія ${buy}`} v={`−${fmtUsd(t.buyFeeUsd, true)}`} />
        <Row k={`Комісія мережі${o.route ? ` (${o.route.network})` : ' (оцінка)'}`} v={`−${fmtUsd(t.networkFeeUsd, true)}`} tone={o.costs.networkFeeShareOfSpreadPct >= 100 ? 'bad' : o.costs.networkFeeShareOfSpreadPct >= 50 ? 'warn' : undefined} />
        <Row k="Дійде монет" v={`${fmtQty(t.arrivedQty)} ${o.base}`} />
        <Row k={`Продаж на ${sell} (VWAP)`} v={`${fmtPrice(t.sellVwap)}`} />
        <Row k={`Комісія ${sell}`} v={`−${fmtUsd(t.sellFeeUsd, true)}`} />
        <Row k="Отримано" v={fmtUsd(t.receivedUsd, true)} />
        <Row k={o.profitStatus === 'confirmed' ? 'Чистий прибуток' : 'Чистий прибуток (попередній)'} v={`${fmtSignedUsd(t.netProfitUsd)} (${fmtPct(t.netProfitPct)})`} strong tone={t.netProfitUsd > 0 ? 'good' : 'bad'} />
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Прослизання і витрати</h4>
        <Row k="Спред за найкращими bid/ask" v={fmtPct(o.spreadPct)} />
        <Row k={`Спред за VWAP на $${t.targetUsd}`} v={booksOk ? fmtPct(o.slippage.vwapSpreadPct) : '— (стакан не завантажено)'} strong tone={!booksOk ? undefined : o.slippage.vwapSpreadPct <= 0 ? 'bad' : o.slippage.slippageShareOfSpreadPct > 50 ? 'warn' : 'good'} />
        <Row k={`Прослизання купівлі (${buy})`} v={booksOk ? fmtPct(o.slippage.buySlippagePct) : '—'} />
        <Row k={`Прослизання продажу (${sell})`} v={booksOk ? fmtPct(o.slippage.sellSlippagePct) : '—'} />
        <Row k="Прослизання з’їдає спреду" v={booksOk ? pct(o.slippage.slippageShareOfSpreadPct) : '—'} tone={booksOk && o.slippage.slippageShareOfSpreadPct > 50 ? 'warn' : undefined} />
        <div className="my-1 border-t border-white/5" />
        <Row k="Валовий спред" v={fmtSignedUsd(o.costs.grossSpreadUsd)} />
        <Row k="− прослизання" v={`−${fmtUsd(o.costs.slippageUsd, true)}`} />
        <Row k="− комісії бірж" v={`−${fmtUsd(o.costs.tradingFeesUsd, true)}`} />
        <Row k={`− комісія мережі (${pct(o.costs.networkFeeShareOfSpreadPct)} спреду)`} v={`−${fmtUsd(o.costs.networkFeeUsd, true)}`} tone={o.costs.networkFeeShareOfSpreadPct >= 100 ? 'bad' : undefined} />
        <Row k="= чистий прибуток" v={fmtSignedUsd(o.costs.netProfitUsd)} strong tone={o.costs.netProfitUsd > 0 ? 'good' : 'bad'} />
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Переказ між біржами</h4>
        <Row k="Статус" v={<span className={transfer.tone === 'good' ? 'text-emerald-300' : transfer.tone === 'bad' ? 'text-rose-300' : 'text-slate-400'}>{transfer.text}</span>} strong />
        <Row k="Мережа / контракт" v={NETWORK_TEXT[o.networkStatus].text} />
        {o.transfer.legs.length > 0 ? (
          <table className="mt-1 w-full text-[11px]">
            <thead className="text-slate-500">
              <tr>
                <th className="py-0.5 text-left font-medium">Мережа</th>
                <th className="py-0.5 text-center font-medium">Вивід {buy}</th>
                <th className="py-0.5 text-center font-medium">Депозит {sell}</th>
                <th className="py-0.5 text-right font-medium">Комісія</th>
              </tr>
            </thead>
            <tbody>
              {o.transfer.legs.map((l) => (
                <tr key={l.network} className={clsx(o.route?.network === l.network && 'text-white', !(l.withdrawEnabled && l.depositEnabled) && 'text-slate-500')}>
                  <td className="py-0.5">{l.network}{o.route?.network === l.network ? ' ★' : ''}</td>
                  <td className="py-0.5 text-center"><Flag ok={l.withdrawEnabled} /></td>
                  <td className="py-0.5 text-center"><Flag ok={l.depositEnabled} /></td>
                  <td className="num py-0.5 text-right">{Number.isFinite(l.withdrawFeeCoin) ? `${fmtQty(l.withdrawFeeCoin)} ${o.base}` : '?'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Row k="Відомі мережі" v={o.networks.length ? o.networks.join(', ') : '—'} />
        )}
        {o.route?.minWithdraw !== undefined && <Row k="Мін. вивід" v={`${fmtQty(o.route.minWithdraw)} ${o.base}`} />}
        {o.route?.contract && <Row k="Контракт" v={<span className="break-all">{o.route.contract.slice(0, 10)}…{o.route.contract.slice(-6)}</span>} />}
        <Row k="Статуси гаманців оновлено" v={o.transfer.checkedAt ? timeAgo(o.transfer.checkedAt, now) : 'немає даних'} />
        <Row k="Символи" v={`${o.buySymbol} / ${o.sellSymbol}`} />
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Ризик і ліквідність</h4>
        <Row k={`Рух ціни за ${o.volatility.windowSec} с`} v={<span className={vol.tone === 'good' ? 'text-emerald-300' : vol.tone === 'warn' ? 'text-amber-300' : vol.tone === 'bad' ? 'text-rose-300' : 'text-slate-400'} title={vol.title}>{vol.text}</span>} strong />
        {o.volatility.level !== 'unknown' && (
          <>
            <Row k={`Зміна на ${buy} / ${sell}`} v={`${fmtPct(o.volatility.buyMovePct)} / ${fmtPct(o.volatility.sellMovePct)}`} />
            <Row k="Розмах (max−min)" v={fmtPct(o.volatility.rangePct)} />
          </>
        )}
        <div className="my-1 border-t border-white/5" />
        <Row k={`Можна купити на ${buy}`} v={booksOk ? fmtUsd(o.buyDepthUsd) : '—'} />
        <Row k={`Можна продати на ${sell}`} v={booksOk ? fmtUsd(o.sellDepthUsd) : '—'} />
        <Row k="Макс. прибутковий обсяг" v={booksOk ? fmtUsd(o.maxProfitableUsd) : '—'} />
        <Row k="Прибуток на макс. обсязі" v={booksOk ? fmtSignedUsd(o.maxProfitUsd) : '—'} />
        <Row k={`Вистачає на $${t.targetUsd}`} v={t.enough === null ? 'не перевірено' : t.enough ? 'так' : 'ні'} />
        <div className="my-1 border-t border-white/5" />
        <Row k="Вперше помічено" v={timeAgo(o.firstSeenAt, now)} />
        <Row k="Циклів поспіль" v={o.seenCount} />
        <Row k="Обіг 24г (мін. з двох)" v={fmtUsd(o.volume24hUsd)} />
        {o.notes.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
            {o.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
