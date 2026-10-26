import { ExternalLink } from 'lucide-react';
import { fmtPct, fmtPrice, fmtQty, fmtSignedUsd, fmtUsd, timeAgo } from '../lib/format';
import { EXCHANGE_LABELS, type Opportunity } from '../types';
import { NETWORK_TEXT, SUSPICIOUS_TEXT } from '../lib/labels';
import { tradeUrl } from '../lib/tradeUrl';

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="text-slate-400">{k}</span>
      <span className={strong ? 'num font-semibold text-white' : 'num text-slate-200'}>{v}</span>
    </div>
  );
}

export function OpportunityDetails({ o, now }: { o: Opportunity; now: number }) {
  const t = o.trade;
  const buy = EXCHANGE_LABELS[o.buyExchange];
  const sell = EXCHANGE_LABELS[o.sellExchange];
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2 2xl:grid-cols-4">
      <div className="flex flex-wrap gap-2 sm:col-span-2 2xl:col-span-4">
        {([['Купити', o.buyExchange], ['Продати', o.sellExchange]] as const).map(([verb, ex]) => (
          <a
            key={verb}
            href={tradeUrl(ex, o.base)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline text-xs"
          >
            {verb} {o.base} на {EXCHANGE_LABELS[ex]}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ))}
      </div>
      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Симуляція угоди на ${t.targetUsd}</h4>
        <Row k={`Купівля на ${buy} (VWAP)`} v={`${fmtUsd(t.spentUsd, true)} @ ${fmtPrice(t.buyVwap)}`} />
        <Row k={`Комісія ${buy}`} v={`−${fmtUsd(t.buyFeeUsd, true)}`} />
        <Row k={`Комісія мережі${o.route ? ` (${o.route.network})` : ' (оцінка)'}`} v={`−${fmtUsd(t.networkFeeUsd, true)}`} />
        <Row k="Дійде монет" v={`${fmtQty(t.arrivedQty)} ${o.base}`} />
        <Row k={`Продаж на ${sell} (VWAP)`} v={`${fmtPrice(t.sellVwap)}`} />
        <Row k={`Комісія ${sell}`} v={`−${fmtUsd(t.sellFeeUsd, true)}`} />
        <Row k="Отримано" v={fmtUsd(t.receivedUsd, true)} />
        <Row k={o.profitStatus === 'confirmed' ? 'Чистий прибуток' : 'Чистий прибуток (попередній)'} v={`${fmtSignedUsd(t.netProfitUsd)} (${fmtPct(t.netProfitPct)})`} strong />
      </section>
      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Ліквідність (глибина стакана)</h4>
        <Row k={`Можна купити на ${buy}`} v={o.orderbookStatus === 'unverified' ? '—' : fmtUsd(o.buyDepthUsd)} />
        <Row k={`Можна продати на ${sell}`} v={o.orderbookStatus === 'unverified' ? '—' : fmtUsd(o.sellDepthUsd)} />
        <Row k="Макс. прибутковий обсяг" v={o.orderbookStatus === 'unverified' ? '—' : fmtUsd(o.maxProfitableUsd)} />
        <Row k="Прибуток на макс. обсязі" v={o.orderbookStatus === 'unverified' ? '—' : fmtSignedUsd(o.maxProfitUsd)} />
        <Row k={`Вистачає на $${t.targetUsd}`} v={t.enough === null ? 'не перевірено' : t.enough ? 'так' : 'ні'} />
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Обсяги рахуються за рівнями стакана в межах вікна глибини, а не лише за найкращими bid/ask. Макс. прибутковий обсяг — поки граничний спред після комісій бірж додатний.
        </p>
      </section>
      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Мережа та актив</h4>
        <Row k="Статус" v={NETWORK_TEXT[o.networkStatus].text} />
        <Row k="Доступні мережі" v={o.networks.length ? o.networks.join(', ') : '—'} />
        {o.route && <Row k="Найдешевша мережа" v={`${o.route.network}: ${fmtQty(o.route.withdrawFeeCoin)} ${o.base}`} />}
        {o.route?.contract && <Row k="Контракт" v={<span className="break-all">{o.route.contract.slice(0, 10)}…{o.route.contract.slice(-6)}</span>} />}
        <Row k="Символи" v={`${o.buySymbol} / ${o.sellSymbol}`} />
        <Row k="Ціни (ask / bid)" v={`${fmtPrice(o.buyPrice)} / ${fmtPrice(o.sellPrice)}`} />
      </section>
      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">Примітки</h4>
        <Row k="Вперше помічено" v={timeAgo(o.firstSeenAt, now)} />
        <Row k="Циклів поспіль" v={o.seenCount} />
        <Row k="Обіг 24г (мін. з двох)" v={fmtUsd(o.volume24hUsd)} />
        {o.suspicious && (
          <p className="mt-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-300">
            Підозріла зв’язка: {o.suspiciousReasons.map((r) => SUSPICIOUS_TEXT[r]).join(', ')}. Ймовірно, це різні активи або помилкова ціна — не вважайте її реальною можливістю.
          </p>
        )}
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
          {o.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
