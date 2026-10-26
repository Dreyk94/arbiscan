import type { SortKey } from './filters';
import type { NetworkStatus, SuspiciousReason } from '../types';

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'info';

export const NETWORK_TEXT: Record<NetworkStatus, { tone: Tone; text: string; title: string }> = {
  verified: { tone: 'good', text: 'Мережа OK', title: 'Спільна мережа, контракт збігається, вивід і депозит відкриті' },
  suspended: { tone: 'warn', text: 'Переказ закрито', title: 'Вивід на біржі купівлі або депозит на біржі продажу призупинено' },
  mismatch: { tone: 'bad', text: 'Інший контракт', title: 'Однаковий тикер, але різні контракти — ймовірно різні активи' },
  no_common: { tone: 'bad', text: 'Немає мережі', title: 'Немає спільної мережі для переказу' },
  unverified: { tone: 'muted', text: 'Мережа ?', title: 'Дані про мережі недоступні — потрібні API-ключі або біржа не віддає інформацію' },
};

export const SUSPICIOUS_TEXT: Record<SuspiciousReason, string> = {
  contract_mismatch: 'різні контракти',
  name_mismatch: 'різні назви активу',
  abnormal_spread: 'аномальний спред',
  price_outlier: 'ціна-викид',
};

export const SORT_LABELS: Record<SortKey, string> = {
  spread: 'Спред',
  profit: 'Чистий прибуток',
  price: 'Ціна',
  novelty: 'Новизна',
  popularity: 'Популярність (обіг 24г)',
  liquidity: 'Ліквідність',
};
