import clsx from 'clsx';
import { Bell, BellOff, Settings2, SlidersHorizontal } from 'lucide-react';
import type { ScanMeta } from '../types';
import { EXCHANGE_LABELS } from '../types';

interface Props {
  meta?: ScanMeta;
  notifyEnabled: boolean;
  notifyPermission: NotificationPermission | 'unsupported';
  onToggleNotify: () => void;
  onOpenAdmin: () => void;
  onOpenFilters: () => void;
  activeFilters: number;
}

export function Header({ meta, notifyEnabled, notifyPermission, onToggleNotify, onOpenAdmin, onOpenFilters, activeFilters }: Props) {
  const notifyTitle =
    notifyPermission === 'unsupported'
      ? 'Браузер не підтримує системні сповіщення — працюватимуть сповіщення в застосунку'
      : notifyPermission === 'denied'
        ? 'Системні сповіщення заблоковані в браузері — працюватимуть сповіщення в застосунку'
        : notifyEnabled
          ? 'Вимкнути сповіщення'
          : 'Увімкнути сповіщення про нові зв’язки';
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-white sm:text-lg">ArbiScan</div>
            <div className="hidden text-[11px] text-slate-500 sm:block">Міжбіржовий арбітраж · Spot USDT</div>
          </div>
        </div>
        {meta && (
          <span
            className={clsx(
              'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              meta.mode === 'demo' ? 'border-violet-400/40 bg-violet-400/10 text-violet-300' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
            )}
            title={meta.mode === 'demo' ? 'Демонстраційні дані. Змініть у панелі адміністратора.' : 'Реальні дані бірж'}
          >
            {meta.mode === 'demo' ? 'ДЕМО' : 'LIVE'}
          </span>
        )}
        <div className="ml-2 hidden items-center gap-2 lg:flex">
          {meta?.exchanges
            .filter((e) => e.enabled)
            .map((e) => (
              <span
                key={e.exchange}
                className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs text-slate-300"
                title={e.ok ? `${e.markets} ринків USDT · ${e.latencyMs ?? '?'} мс` : `Помилка: ${e.error ?? 'немає даних'}`}
              >
                <span className={clsx('h-1.5 w-1.5 rounded-full', e.ok ? 'bg-emerald-400' : e.updatedAt ? 'bg-rose-400' : 'bg-slate-500')} />
                {EXCHANGE_LABELS[e.exchange]}
              </span>
            ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost relative lg:hidden" onClick={onOpenFilters} aria-label="Фільтри">
            <SlidersHorizontal size={18} />
            {activeFilters > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-ink-950">{activeFilters}</span>
            )}
          </button>
          <button className={clsx('btn-ghost', notifyEnabled && 'text-emerald-300')} onClick={onToggleNotify} title={notifyTitle} aria-label={notifyTitle}>
            {notifyEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            <span className="hidden sm:inline">{notifyEnabled ? 'Сповіщення увімк.' : 'Сповіщення'}</span>
          </button>
          <button className="btn-ghost" onClick={onOpenAdmin} aria-label="Панель адміністратора">
            <Settings2 size={18} />
            <span className="hidden sm:inline">Адмін</span>
          </button>
        </div>
      </div>
    </header>
  );
}
