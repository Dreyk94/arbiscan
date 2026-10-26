import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, partialSettingsSchema } from './settings.js';

describe('mergeSettings', () => {
  it('частково оновлює вкладені journal/volatility', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { journal: { minSpreadPct: 3 }, volatility: { highPct: 5 } });
    expect(next.journal).toEqual({ enabled: true, minSpreadPct: 3, maxEntries: 5000 });
    expect(next.volatility).toEqual({ windowSec: 60, warnPct: 0.8, highPct: 5 });
  });

  it('старий файл налаштувань без нових полів отримує значення за замовчуванням', () => {
    const { journal: _j, volatility: _v, assetInfoRefreshSec: _a, maxSlippageShareOfSpreadPct: _m, ...legacy } = DEFAULT_SETTINGS;
    const next = mergeSettings(DEFAULT_SETTINGS, legacy);
    expect(next.journal.minSpreadPct).toBe(2);
    expect(next.assetInfoRefreshSec).toBe(120);
  });

  it('partialSettingsSchema приймає часткові вкладені обʼєкти', () => {
    expect(partialSettingsSchema.safeParse({ volatility: { warnPct: 1 } }).success).toBe(true);
    expect(partialSettingsSchema.safeParse({ journal: { maxEntries: 1 } }).success).toBe(false);
  });
});
