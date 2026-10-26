import type { Opportunity } from '../types';

export interface NotifyState {
  /** id → час останнього сповіщення */
  lastNotified: Record<string, number>;
  /** id зв'язок, що відповідали умовам на попередньому циклі */
  active: string[];
}

export const EMPTY_NOTIFY_STATE: NotifyState = { lastNotified: {}, active: [] };

export interface NotifyRules {
  minSpreadPct: number;
  cooldownMin: number;
}

export function qualifies(o: Opportunity, rules: NotifyRules): boolean {
  return !o.suspicious && o.spreadPct >= rules.minSpreadPct;
}

/**
 * Дедуплікація: сповіщаємо лише коли зв'язка *з'являється* (не була активною на
 * попередньому циклі) і з моменту останнього сповіщення про неї минув cooldown.
 * Працює на повному списку, незалежно від UI-фільтрів, і нічого не змінює у фільтрах.
 */
export function selectNotifications(
  list: Opportunity[],
  state: NotifyState,
  rules: NotifyRules,
  now: number,
): { toNotify: Opportunity[]; next: NotifyState } {
  const cooldownMs = rules.cooldownMin * 60_000;
  const prevActive = new Set(state.active);
  const lastNotified = { ...state.lastNotified };
  const active: string[] = [];
  const toNotify: Opportunity[] = [];
  for (const o of list) {
    if (!qualifies(o, rules)) continue;
    active.push(o.id);
    if (prevActive.has(o.id)) continue;
    const last = lastNotified[o.id];
    if (last && now - last < cooldownMs) continue;
    lastNotified[o.id] = now;
    toNotify.push(o);
  }
  for (const [id, ts] of Object.entries(lastNotified)) {
    if (now - ts > Math.max(cooldownMs, 3_600_000) * 4) delete lastNotified[id];
  }
  toNotify.sort((a, b) => b.spreadPct - a.spreadPct);
  return { toNotify, next: { lastNotified, active } };
}

const OB_TEXT: Record<Opportunity['orderbookStatus'], string> = {
  verified: 'стакан перевірено',
  insufficient: 'стакан тонкий',
  unverified: 'стакан не перевірено',
};

export function notificationText(o: Opportunity, exLabel: (id: string) => string): { title: string; body: string } {
  const enough =
    o.trade.enough === true
      ? `вистачає на $${o.trade.targetUsd}`
      : o.trade.enough === false
        ? `не вистачає на $${o.trade.targetUsd}`
        : 'обсяг невідомий';
  const profitLabel = o.profitStatus === 'confirmed' ? 'прибуток' : 'попередній прибуток';
  return {
    title: `ArbiScan: ${o.base} спред ${o.spreadPct.toFixed(2)}%`,
    body: [
      `${exLabel(o.buyExchange)} → ${exLabel(o.sellExchange)}`,
      `Ліквідність: ${OB_TEXT[o.orderbookStatus]}, ${enough}`,
      `${profitLabel}: ${o.trade.netProfitUsd >= 0 ? '+' : ''}$${o.trade.netProfitUsd.toFixed(2)}`,
    ].join('\n'),
  };
}
