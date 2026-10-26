import { describe, expect, it } from 'vitest';
import type { Opportunity } from '../types';
import { EMPTY_NOTIFY_STATE, qualifies, selectNotifications } from './notifications';

const o = (id: string, spreadPct: number, suspicious = false, extra: Partial<Opportunity> = {}) =>
  ({ id, spreadPct, suspicious, transfer: { status: 'open', legs: [], checkedAt: null }, warnings: [], ...extra }) as Opportunity;
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

  it('заблокований переказ і блокувальні попередження не сповіщаються', () => {
    expect(qualifies(o('a', 3), rules)).toBe(true);
    expect(qualifies(o('b', 3, false, { transfer: { status: 'blocked', legs: [], checkedAt: null } }), rules)).toBe(false);
    expect(qualifies(o('c', 3, false, { warnings: [{ code: 'below_min_withdraw', severity: 'block', message: '' }] }), rules)).toBe(false);
    expect(qualifies(o('d', 3, false, { warnings: [{ code: 'unprofitable', severity: 'warn', message: '' }] }), rules)).toBe(true);
    const r = selectNotifications([o('x', 5, false, { transfer: { status: 'blocked', legs: [], checkedAt: null } })], EMPTY_NOTIFY_STATE, rules, 1);
    expect(r.toNotify).toHaveLength(0);
  });
});
