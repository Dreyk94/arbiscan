import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_NOTIFY_STATE, type NotifyState, notificationText, selectNotifications } from '../lib/notifications';
import { EXCHANGE_LABELS, type ExchangeId, type Opportunity } from '../types';
import { useLocalStorage } from './useLocalStorage';

const supported = typeof window !== 'undefined' && 'Notification' in window;
const MAX_INDIVIDUAL = 3;

export interface InAppAlert {
  id: string;
  opp: Opportunity;
  title: string;
  body: string;
  at: number;
}

export function useNotifications(
  list: Opportunity[] | undefined,
  rules: { minSpreadPct: number; cooldownMin: number } | undefined,
  onOpen: (id: string) => void,
) {
  const [enabled, setEnabled] = useLocalStorage('arbiscan.notify.enabled', false);
  const [state, setState] = useLocalStorage<NotifyState>('arbiscan.notify.state', EMPTY_NOTIFY_STATE);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported');
  const [alerts, setAlerts] = useState<InAppAlert[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const toggle = useCallback(async () => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    if (supported && Notification.permission === 'default') {
      const p = await Notification.requestPermission();
      setPermission(p);
    }
    setEnabled(true);
  }, [enabled, setEnabled]);

  useEffect(() => {
    if (!list || !rules) return;
    const { toNotify, next } = selectNotifications(list, stateRef.current, rules, Date.now());
    setState(next);
    if (!enabled || !toNotify.length) return;
    const label = (id: string) => EXCHANGE_LABELS[id as ExchangeId] ?? id;
    const individual = toNotify.slice(0, MAX_INDIVIDUAL);
    const newAlerts: InAppAlert[] = [];
    for (const o of individual) {
      const { title, body } = notificationText(o, label);
      newAlerts.push({ id: `${o.id}:${Date.now()}`, opp: o, title, body, at: Date.now() });
      if (supported && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, { body, tag: o.id, icon: '/favicon.svg' });
          n.onclick = () => {
            window.focus();
            onOpenRef.current(o.id);
            n.close();
          };
        } catch {
          /* деякі мобільні браузери вимагають service worker — лишаємо in-app сповіщення */
        }
      }
    }
    if (toNotify.length > MAX_INDIVIDUAL && supported && Notification.permission === 'granted') {
      try {
        new Notification('ArbiScan', { body: `Ще ${toNotify.length - MAX_INDIVIDUAL} нових зв’язок зі спредом від ${rules.minSpreadPct}%`, tag: 'arbiscan-summary' });
      } catch {
        /* ignore */
      }
    }
    setAlerts((a) => [...newAlerts, ...a].slice(0, 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const dismiss = useCallback((id: string) => setAlerts((a) => a.filter((x) => x.id !== id)), []);

  return { enabled, toggle, permission, alerts, dismiss, supported };
}
