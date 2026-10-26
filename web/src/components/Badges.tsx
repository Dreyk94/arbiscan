import { EXCHANGE_LABELS } from '../types';
import clsx from 'clsx';
import { Activity, AlertTriangle, Ban, CheckCircle2, CircleDashed, ExternalLink, ShieldAlert, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { NETWORK_TEXT, SUSPICIOUS_TEXT, VOLATILITY_TEXT, WARNING_TEXT, type Tone } from '../lib/labels';
import { tradeUrl } from '../lib/tradeUrl';
import type { ExchangeId, NetworkStatus, Opportunity, OrderbookStatus, VolatilityInfo } from '../types';


const TONES: Record<Tone, string> = {
  good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  bad: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  muted: 'border-white/10 bg-white/5 text-slate-400',
  info: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

export function Badge({ tone, children, title, icon }: { tone: Tone; children: ReactNode; title?: string; icon?: ReactNode }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', TONES[tone])}>
      {icon}
      {children}
    </span>
  );
}

const OB: Record<OrderbookStatus, { tone: Tone; text: string; title: string }> = {
  verified: { tone: 'good', text: 'Стакан OK', title: 'Глибину стакана перевірено на обох біржах' },
  insufficient: { tone: 'warn', text: 'Тонкий стакан', title: 'Глибини стакана недостатньо для повного виконання угоди' },
  unverified: { tone: 'muted', text: 'Стакан ?', title: 'Стакан не завантажено — розрахунок за найкращими котируваннями' },
};

export function OrderbookBadge({ status }: { status: OrderbookStatus }) {
  const s = OB[status];
  return (
    <Badge tone={s.tone} title={s.title} icon={status === 'verified' ? <CheckCircle2 size={12} /> : status === 'insufficient' ? <AlertTriangle size={12} /> : <CircleDashed size={12} />}>
      {s.text}
    </Badge>
  );
}


export function NetworkBadge({ status }: { status: NetworkStatus }) {
  const s = NETWORK_TEXT[status];
  return (
    <Badge tone={s.tone} title={s.title} icon={status === 'verified' ? <CheckCircle2 size={12} /> : status === 'unverified' ? <CircleDashed size={12} /> : status === 'suspended' ? <Ban size={12} /> : <XCircle size={12} />}>
      {s.text}
    </Badge>
  );
}

export function VolatilityBadge({ v, showLow = false }: { v: VolatilityInfo; showLow?: boolean }) {
  if (v.level === 'unknown' || (v.level === 'low' && !showLow)) return null;
  const s = VOLATILITY_TEXT[v.level];
  return (
    <Badge tone={s.tone} title={`${s.title}. Розмах за ${v.windowSec} с: ${v.rangePct.toFixed(2)}%`} icon={<Activity size={12} />}>
      {v.level === 'high' ? 'Волатильно' : v.level === 'medium' ? 'Рухлива ціна' : s.text}
    </Badge>
  );
}

/** Попередження про комісії/прослизання/мін. вивід (переказ і волатильність мають власні бейджі). */
export function WarningsBadge({ o }: { o: Opportunity }) {
  const list = o.warnings.filter((w) => w.code !== 'transfer_blocked' && w.code !== 'high_volatility' && w.code !== 'fee_unknown');
  if (!list.length) return null;
  const block = list.some((w) => w.severity === 'block');
  return (
    <Badge tone={block ? 'bad' : 'warn'} title={list.map((w) => w.message).join('\n')} icon={<AlertTriangle size={12} />}>
      {list.length === 1 ? WARNING_TEXT[list[0].code] : `Попереджень: ${list.length}`}
    </Badge>
  );
}

export function ProfitBadge({ o }: { o: Opportunity }) {
  return o.profitStatus === 'confirmed' ? (
    <Badge tone="good" title="Стакан і мережу перевірено. Ринок рухається — це розрахунок на момент сканування, не гарантія.">
      Перевірено
    </Badge>
  ) : (
    <Badge tone="warn" title="Стакан або мережу не перевірено, або зв’язка підозріла — прибуток лише орієнтовний">
      Попередній
    </Badge>
  );
}


export function SuspiciousBadge({ o }: { o: Opportunity }) {
  if (!o.suspicious) return null;
  return (
    <Badge tone="bad" icon={<ShieldAlert size={12} />} title={`Підозріло: ${o.suspiciousReasons.map((r) => SUSPICIOUS_TEXT[r]).join(', ')}`}>
      Підозріла
    </Badge>
  );
}

export function ExchangeTag({ id, base }: { id: string; base?: string }) {
  const colors: Record<string, string> = {
    okx: 'bg-white text-black',
    bybit: 'bg-amber-400 text-black',
    bitget: 'bg-cyan-400 text-black',
    gate: 'bg-blue-500 text-white',
    mexc: 'bg-teal-300 text-black',
    binance: 'bg-yellow-300 text-black',
    kucoin: 'bg-emerald-400 text-black',
  };
  const label: Record<string, string> = EXCHANGE_LABELS;
  const cls = clsx('rounded px-1.5 py-0.5 text-[11px] font-bold', colors[id] ?? 'bg-slate-600');
  if (!base || !(id in EXCHANGE_LABELS)) return <span className={cls}>{label[id] ?? id}</span>;
  return (
    <a
      href={tradeUrl(id as ExchangeId, base)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={clsx(cls, 'inline-flex items-center gap-0.5 hover:opacity-80 hover:underline')}
      title={`Відкрити ${base}/USDT на ${label[id]}`}
    >
      {label[id]}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
