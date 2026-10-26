import { z } from 'zod';
import { EXCHANGES } from '../domain/types.js';

const exchangeSettings = z.object({
  enabled: z.boolean(),
  /** Тейкер-комісія, % */
  takerFeePct: z.number().min(0).max(5),
});

export const settingsSchema = z.object({
  dataMode: z.enum(['demo', 'live']),
  exchanges: z.object({
    okx: exchangeSettings,
    bybit: exchangeSettings,
    bitget: exchangeSettings,
    gate: exchangeSettings.default({ enabled: true, takerFeePct: 0.2 }),
    mexc: exchangeSettings.default({ enabled: true, takerFeePct: 0.05 }),
    binance: exchangeSettings.default({ enabled: true, takerFeePct: 0.1 }),
    kucoin: exchangeSettings.default({ enabled: true, takerFeePct: 0.1 }),
  }),
  /** Обсяг тестової угоди, USDT */
  tradeSizeUsd: z.number().min(1).max(1_000_000),
  /** Вікно глибини стакана для розрахунку доступного обсягу, % від найкращої ціни */
  depthWindowPct: z.number().min(0.05).max(20),
  /** Кількість рівнів стакана для запиту */
  orderbookLimit: z.number().int().min(5).max(200),
  /** Мінімальний спред за котируваннями, щоб пара потрапила в перевірку стаканів, % */
  minCandidateSpreadPct: z.number().min(0).max(100),
  /** Максимум кандидатів, для яких завантажуються стакани за цикл */
  maxCandidates: z.number().int().min(1).max(300),
  /** Спред вище цього значення вважається підозрілим (ймовірно різні активи), % */
  maxPlausibleSpreadPct: z.number().min(1).max(1000),
  /** Мінімальний 24h обіг ринку, USD */
  minVolume24hUsd: z.number().min(0),
  /** Комісія мережі за замовчуванням, коли мережу не перевірено, USD */
  fallbackNetworkFeeUsd: z.number().min(0).max(1000),
  /** Інтервал циклу сканування, с */
  scanIntervalSec: z.number().int().min(3).max(600),
  /** Через скільки секунд неактивна зв'язка видаляється */
  staleAfterSec: z.number().int().min(10).max(86_400),
  notifications: z.object({
    minSpreadPct: z.number().min(0).max(100),
    cooldownMin: z.number().min(1).max(1440),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  dataMode: 'demo',
  exchanges: {
    okx: { enabled: true, takerFeePct: 0.1 },
    bybit: { enabled: true, takerFeePct: 0.1 },
    bitget: { enabled: true, takerFeePct: 0.1 },
    gate: { enabled: true, takerFeePct: 0.2 },
    mexc: { enabled: true, takerFeePct: 0.05 },
    binance: { enabled: true, takerFeePct: 0.1 },
    kucoin: { enabled: true, takerFeePct: 0.1 },
  },
  tradeSizeUsd: 100,
  depthWindowPct: 2,
  orderbookLimit: 50,
  minCandidateSpreadPct: 0.3,
  maxCandidates: 60,
  maxPlausibleSpreadPct: 30,
  minVolume24hUsd: 10_000,
  fallbackNetworkFeeUsd: 1,
  scanIntervalSec: 10,
  staleAfterSec: 120,
  notifications: { minSpreadPct: 2, cooldownMin: 30 },
};

export const partialSettingsSchema = settingsSchema
  .extend({
    exchanges: z
      .object({
        okx: exchangeSettings.partial(),
        bybit: exchangeSettings.partial(),
        bitget: exchangeSettings.partial(),
        gate: exchangeSettings.partial(),
        mexc: exchangeSettings.partial(),
        binance: exchangeSettings.partial(),
        kucoin: exchangeSettings.partial(),
      })
      .partial(),
    notifications: settingsSchema.shape.notifications.partial(),
  })
  .partial();
export type PartialSettings = z.infer<typeof partialSettingsSchema>;

export function mergeSettings(base: Settings, patch: PartialSettings): Settings {
  const exchanges = { ...base.exchanges };
  for (const ex of EXCHANGES) {
    exchanges[ex] = { ...base.exchanges[ex], ...(patch.exchanges?.[ex] ?? {}) };
  }
  const merged = {
    ...base,
    ...stripUndefined(patch),
    exchanges,
    notifications: { ...base.notifications, ...(patch.notifications ?? {}) },
  };
  return settingsSchema.parse(merged);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
