import clsx from 'clsx';
import { ArrowRight, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getAdminToken } from '../lib/api';
import { fmtPct, fmtSignedUsd, fmtUsdCompact, timeAgo } from '../lib/format';
import { VERDICT_TEXT, WARNING_TEXT } from '../lib/labels';
import type { JournalEntry, JournalResponse, JournalVerdict } from '../types';
import { Badge, ExchangeTag } from './Badges';

const PERIODS: Array<[string, number]> = [
  ['1 год', 3_600_000],
  ['24 год', 86_400_000],
  ['7 днів', 7 * 86_400_000],
  ['Весь час', 0],
];

const OB_SHORT = { verified: 'OK', insufficient: 'тонкий', unverified: '?' } as const;
const TRANSFER_SHORT = { open: 'відкритий', blocked: 'закритий', unknown: '?' } as const;
const VOL_SHORT = { low: 'низька', medium: 'помірна', high: 'висока', unknown: '?' } as const;

function duration(e: JournalEntry, now: number): string {
  const end = e.closedAt ?? now;
  const s = Math.max(0, Math.round((end - e.firstSeenAt) / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${m % 60} хв`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function JournalPanel({ now, scanIntervalSec }: { now: number; scanIntervalSec: number }) {
  const [data, setData] = useState<JournalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<JournalVerdict | ''>('');
  const [base, setBase] = useState('');
  const [periodMs, setPeriodMs] = useState(86_400_000);
  const [busy, setBusy] = useState(false);

  const query = useMemo(
    () => ({ verdict, base: base.trim().toUpperCase() || undefined, since: periodMs ? Date.now() - periodMs : undefined, limit: 500 }),
    [verdict, base, periodMs],
  );

  const load = useCallback(async () => {
    try {
      setData(await api.journal(query));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), Math.max(5000, scanIntervalSec * 1000));
    return () => window.clearInterval(t);
  }, [load, scanIntervalSec]);

  const stats = data?.stats;
  const entries = data?.entries ?? [];

  return (
    <section className="min-w-0 flex-1 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-white">
            Журнал зв’язок <span className="text-slate-500">{stats ? stats.total : ''}</span>
          </h1>
          <p className="text-xs text-slate-500">
            Усі спреди від {data?.config.minSpreadPct ?? 2}% з часом появи, біржами, станом стакана, переказу й підсумковим вердиктом — для аналізу хибних спрацювань.
            {data && !data.config.enabled && <b className="text-amber-300"> Запис у журнал вимкнено в адмін-панелі.</b>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input className="input w-28 py-1 text-xs" placeholder="Тикер" value={base} onChange={(e) => setBase(e.target.value)} />
          <select className="rounded-md border border-white/10 bg-ink-850 px-2 py-1.5 text-xs" value={verdict} onChange={(e) => setVerdict(e.target.value as JournalVerdict | '')}>
            <option value="">Усі вердикти</option>
            {(Object.keys(VERDICT_TEXT) as JournalVerdict[]).map((v) => (
              <option key={v} value={v}>{VERDICT_TEXT[v].text}</option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {PERIODS.map(([label, ms]) => (
              <button key={label} onClick={() => setPeriodMs(ms)} className={clsx('px-2 py-1.5', periodMs === ms ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-400 hover:bg-white/5')}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={() => void load()} title="Оновити">
            <RefreshCw size={14} />
          </button>
          <a className="btn-outline" href={api.journalCsvUrl({ ...query, limit: undefined })} download>
            <Download size={14} /> CSV
          </a>
          {getAdminToken() && (
            <button
              className="btn-danger"
              disabled={busy}
              title="Очистити журнал (адмін)"
              onClick={() => {
                if (!window.confirm('Видалити всі записи журналу?')) return;
                setBusy(true);
                void api.clearJournal().then(load).catch((e) => setError((e as Error).message)).finally(() => setBusy(false));
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <Stat label="Записів" value={stats.total} />
          <Stat label="Активних зараз" value={stats.active} />
          {(Object.keys(VERDICT_TEXT) as JournalVerdict[]).map((v) => (
            <Stat key={v} label={VERDICT_TEXT[v].text} value={stats.byVerdict[v]} tone={VERDICT_TEXT[v].tone} hint={stats.total ? `${((stats.byVerdict[v] / stats.total) * 100).toFixed(0)}%` : undefined} />
          ))}
        </div>
      )}
      {stats && stats.total > 0 && (
        <p className="text-xs text-slate-400">
          Хибних сигналів (жодного разу не були робочими): <b className={stats.falseSignalPct > 50 ? 'text-amber-300' : 'text-slate-200'}>{stats.falseSignalPct.toFixed(0)}%</b>
        </p>
      )}

      {error && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">Журнал недоступний: {error}</div>}

      {data && entries.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">За обраний період записів немає. Журнал наповнюється, щойно сканер бачить спред від {data.config.minSpreadPct}%.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-white/5 bg-white/[0.02] text-left text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Поява</th>
                  <th className="px-3 py-2 font-medium">Тривалість</th>
                  <th className="px-3 py-2 font-medium">Актив / маршрут</th>
                  <th className="px-3 py-2 text-right font-medium">Спред поява / макс</th>
                  <th className="px-3 py-2 text-right font-medium">VWAP</th>
                  <th className="px-3 py-2 text-right font-medium">Прибуток</th>
                  <th className="px-3 py-2 font-medium">Стакан</th>
                  <th className="px-3 py-2 font-medium">Переказ</th>
                  <th className="px-3 py-2 font-medium">Волат.</th>
                  <th className="px-3 py-2 font-medium">Вердикт</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const v = VERDICT_TEXT[e.verdict];
                  return (
                    <tr key={e.id} className={clsx('border-b border-white/5', e.closedAt === null && 'bg-emerald-500/[0.04]')}>
                      <td className="num px-3 py-2 whitespace-nowrap text-slate-300" title={new Date(e.firstSeenAt).toISOString()}>
                        {fmtTime(e.firstSeenAt)}
                        {e.closedAt === null && <span className="ml-1 rounded bg-emerald-400 px-1 text-[9px] font-bold text-ink-950">LIVE</span>}
                      </td>
                      <td className="num px-3 py-2 whitespace-nowrap text-slate-400" title={e.closedAt ? `Зникла ${timeAgo(e.closedAt, now)}` : 'Ще активна'}>
                        {duration(e, now)} <span className="text-slate-600">· {e.seenCount}×</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-white">{e.base}</span>
                          <ExchangeTag id={e.buyExchange} />
                          <ArrowRight size={11} className="text-slate-500" />
                          <ExchangeTag id={e.sellExchange} />
                          {e.network && <span className="text-slate-500">{e.network}</span>}
                        </div>
                      </td>
                      <td className="num px-3 py-2 text-right whitespace-nowrap">
                        <span className="text-slate-200">{fmtPct(e.spreadPct)}</span> <span className="text-slate-500">/ {fmtPct(e.maxSpreadPct)}</span>
                      </td>
                      <td className={clsx('num px-3 py-2 text-right', e.vwapSpreadPct <= 0 ? 'text-rose-300' : 'text-slate-300')}>{e.orderbookStatus === 'unverified' ? '—' : fmtPct(e.vwapSpreadPct)}</td>
                      <td className={clsx('num px-3 py-2 text-right whitespace-nowrap', e.maxNetProfitUsd > 0 ? 'text-emerald-300' : 'text-rose-300')} title={`На $${e.tradeSizeUsd}; комісія мережі $${e.networkFeeUsd.toFixed(2)}`}>
                        {fmtSignedUsd(e.netProfitUsd)}
                        {e.maxNetProfitUsd !== e.netProfitUsd && <span className="text-slate-500"> / {fmtSignedUsd(e.maxNetProfitUsd)}</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-300" title={`Купити ${fmtUsdCompact(e.buyDepthUsd)} · продати ${fmtUsdCompact(e.sellDepthUsd)}`}>
                        {OB_SHORT[e.orderbookStatus]} {e.enough === false && <span className="text-amber-300">(не вистачає)</span>}
                      </td>
                      <td className={clsx('px-3 py-2 whitespace-nowrap', e.transferStatus === 'blocked' ? 'text-rose-300' : e.transferStatus === 'open' ? 'text-emerald-300' : 'text-slate-400')}>{TRANSFER_SHORT[e.transferStatus]}</td>
                      <td className={clsx('px-3 py-2', e.volatilityLevel === 'high' ? 'text-rose-300' : e.volatilityLevel === 'medium' ? 'text-amber-300' : 'text-slate-400')}>{VOL_SHORT[e.volatilityLevel]}</td>
                      <td className="px-3 py-2">
                        <Badge tone={v.tone} title={[v.title, ...e.warnings.map((w) => WARNING_TEXT[w])].join('\n')}>{v.text}</Badge>
                        {e.firstVerdict !== e.verdict && <div className="mt-0.5 text-[10px] text-slate-500">була: {VERDICT_TEXT[e.firstVerdict].text}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: 'good' | 'warn' | 'bad' | 'muted' | 'info'; hint?: string }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-rose-300' : 'text-white';
  return (
    <div className="card px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={clsx('num text-lg font-semibold', color)}>
        {value} {hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}
