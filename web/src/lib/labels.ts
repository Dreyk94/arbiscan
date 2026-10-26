import type { SortKey } from './filters';
import type { JournalVerdict, NetworkStatus, SuspiciousReason, TransferStatus, VolatilityLevel, WarningCode } from '../types';

export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'info';

export const NETWORK_TEXT: Record<NetworkStatus, { tone: Tone; text: string; title: string }> = {
  verified: { tone: 'good', text: 'Мережа OK', title: 'Спільна мережа, контракт збігається, вивід і депозит відкриті' },
  suspended: { tone: 'bad', text: 'Недоступна для переказу', title: 'Вивід на біржі купівлі або депозит на біржі продажу призупинено (технічні роботи). Кошти можуть зависнути — зв’язка не подається як робоча' },
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

export const TRANSFER_TEXT: Record<TransferStatus, { tone: Tone; text: string }> = {
  open: { tone: 'good', text: 'Переказ відкритий' },
  blocked: { tone: 'bad', text: 'Недоступна для переказу' },
  unknown: { tone: 'muted', text: 'Статус гаманців невідомий' },
};

export const VOLATILITY_TEXT: Record<VolatilityLevel, { tone: Tone; text: string; title: string }> = {
  low: { tone: 'good', text: 'Ціна стабільна', title: 'За останню хвилину ціна майже не рухалась' },
  medium: { tone: 'warn', text: 'Помірна волатильність', title: 'Ціна помітно рухалась за останню хвилину — спред може змінитися під час переказу' },
  high: { tone: 'bad', text: 'Висока волатильність', title: 'Ризик однієї ноги: ціна сильно рухається — поки монети йдуть між біржами, спред може зникнути' },
  unknown: { tone: 'muted', text: 'Волатильність ?', title: 'Ще недостатньо історії цін (потрібно кілька циклів сканування)' },
};

export const WARNING_TEXT: Record<WarningCode, string> = {
  transfer_blocked: 'Недоступна для переказу',
  slippage_eats_spread: 'Прослизання з’їдає спред',
  network_fee_exceeds_spread: 'Комісія мережі більша за спред',
  unprofitable: 'Збиткова після комісій',
  below_min_withdraw: 'Менше мінімального виводу',
  fee_unknown: 'Комісія мережі невідома',
  high_volatility: 'Ризик волатильності',
};

export const VERDICT_TEXT: Record<JournalVerdict, { tone: Tone; text: string; title: string }> = {
  actionable: { tone: 'good', text: 'Робоча', title: 'Переказ відкритий, стакан і мережа перевірені, прибуток після всіх витрат додатний' },
  blocked: { tone: 'bad', text: 'Заблокована', title: 'Переказ недоступний (вивід/депозит закрито, інший контракт або немає мережі)' },
  unprofitable: { tone: 'warn', text: 'Збиткова', title: 'Спред є, але прослизання і комісії з’їдають прибуток' },
  suspicious: { tone: 'bad', text: 'Підозріла', title: 'Різні контракти, аномальний спред або ціна-викид — ймовірно хибний сигнал' },
  unverified: { tone: 'muted', text: 'Не перевірена', title: 'Стакан або мережу не вдалося перевірити' },
};
