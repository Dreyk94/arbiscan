import { describe, expect, it } from 'vitest';
import type { Opportunity } from '../types';
import { EMPTY_NOTIFY_STATE, selectNotifications } from './notifications';

const o = (id: string, spreadPct: number, suspicious = false) => ({ id, spreadPct, suspicious }) as Opportunity;
const rules = { minSpreadPct: 2, cooldownMin: 30 };

describe('selectNotifications', () => {
  it('сповіщає лише про нові зв’язки від 2% і не спамить на кожному циклі', () => {
    const t0 = 1_000_000;
    const r1 = selectNotifications([o('a', 2.5), o('b', 1.5), o('s', 50, true)], EMPTY_NOTIFY_STATE, rules, t0);
    expect(r1.toNotify.map((x) => x.id)).toEqual(['a']);
    const r2 = selectNotifications([o('a', 2.6)], r1.next, rules, t0 + 10_000);
    expect(r2.toNotify).toHaveLength(0);
  });

  it('повторне сповіщення після зникнення — лише після cooldown', () => {
    const t0 = 1_000_000;
    const r1 = selectNotifications([o('a', 3)], EMPTY_NOTIFY_STATE, rules, t0);
    const gone = selectNotifications([], r1.next, rules, t0 + 10_000);
    const back = selectNotifications([o('a', 3)], gone.next, rules, t0 + 20_000);
    expect(back.toNotify).toHaveLength(0);
    const gone2 = selectNotifications([], back.next, rules, t0 + 31 * 60_000);
    const later = selectNotifications([o('a', 3)], gone2.next, rules, t0 + 32 * 60_000);
    expect(later.toNotify.map((x) => x.id)).toEqual(['a']);
  });
});
