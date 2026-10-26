import clsx from 'clsx';
import { Download, LogOut, Play, RotateCcw, Save, Shuffle, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, getAdminToken, setAdminToken } from '../lib/api';
import { ALL_EXCHANGES, EXCHANGE_LABELS, type Settings } from '../types';

type Tab = 'general' | 'fees' | 'risk' | 'notify' | 'demo' | 'io';
const TABS: Array<[Tab, string]> = [
  ['general', 'Загальні'],
  ['fees', 'Біржі та комісії'],
  ['risk', 'Ризики та журнал'],
  ['notify', 'Сповіщення'],
  ['demo', 'Демо-дані'],
  ['io', 'Імпорт / експорт'],
];

function NumField({ label, value, onChange, step = 1, min, max, hint, suffix }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative">
        <input type="number" className="input pr-10" value={Number.isFinite(value) ? value : ''} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const details = Array.isArray(e.details) ? (e.details as Array<{ path?: unknown[]; message?: string }>).slice(0, 3).map((d) => `${(d.path ?? []).join('.')}: ${d.message}`).join('; ') : '';
    return details ? `${e.message} — ${details}` : e.message;
  }
  return (e as Error).message;
}

export function AdminPanel({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [authed, setAuthed] = useState(Boolean(getAdminToken()));
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<Tab>('general');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [scenario, setScenario] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (ok: boolean, text: string) => setMsg({ ok, text });

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api.getSettings(), api.getDemoScenario()]);
      setSettings(s.settings);
      setDraft(s.settings);
      setScenario(JSON.stringify(d.scenario, null, 2));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setAdminToken(null);
        setAuthed(false);
      }
      flash(false, errorText(e));
    }
  }, []);

  useEffect(() => {
    if (open && authed) void load();
    if (open) setMsg(null);
  }, [open, authed, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      flash(false, errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const login = () =>
    run(async () => {
      await api.login(token);
      setAdminToken(token);
      setAuthed(true);
      setToken('');
    });

  const save = () =>
    run(async () => {
      if (!draft) return;
      const r = await api.updateSettings(draft);
      setSettings(r.settings);
      setDraft(r.settings);
      flash(true, 'Налаштування збережено. Новий цикл сканування запущено.');
      onChanged();
    });

  if (!open) return null;
  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => draft && setDraft({ ...draft, [k]: v });

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-label="Панель адміністратора" className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-white">Панель адміністратора</h2>
            <p className="text-xs text-slate-500">Комісії, параметри сканування, демо-дані, імпорт/експорт</p>
          </div>
          <div className="flex items-center gap-1">
            {authed && (
              <button className="btn-ghost" onClick={() => { setAdminToken(null); setAuthed(false); }} title="Вийти">
                <LogOut size={16} />
              </button>
            )}
            <button className="btn-ghost" onClick={onClose} aria-label="Закрити">
              <X size={18} />
            </button>
          </div>
        </div>

        {!authed ? (
          <form className="m-auto w-full max-w-sm space-y-3 p-6" onSubmit={(e) => { e.preventDefault(); void login(); }}>
            <label className="block">
              <span className="label">Токен адміністратора</span>
              <input className="input" type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN (за замовчуванням: admin)" />
            </label>
            <button className="btn-primary w-full" disabled={!token || busy}>Увійти</button>
            {msg && <p className="text-sm text-rose-300">{msg.text}</p>}
          </form>
        ) : (
          <>
            <nav className="flex gap-1 overflow-x-auto border-b border-white/5 px-3 sm:px-5">
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={clsx('border-b-2 px-3 py-2.5 text-sm whitespace-nowrap', tab === k ? 'border-emerald-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              {!draft && <p className="text-sm text-slate-400">Завантаження…</p>}
              {draft && tab === 'general' && (
                <div className="space-y-5">
                  <div>
                    <span className="label">Джерело даних</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(['demo', 'live'] as const).map((m) => (
                        <button key={m} onClick={() => set('dataMode', m)} className={clsx('rounded-lg border p-3 text-left', draft.dataMode === m ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 hover:border-white/20')}>
                          <div className="text-sm font-semibold text-white">{m === 'demo' ? 'Демонстраційні дані' : 'Реальні біржі (LIVE)'}</div>
                          <div className="mt-0.5 text-xs text-slate-400">{m === 'demo' ? 'Генеровані стакани і мережі для тестування' : 'Публічні Spot API OKX, Bybit, Bitget V3, Gate, MEXC, Binance, KuCoin'}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumField label="Обсяг тестової угоди" suffix="USDT" value={draft.tradeSizeUsd} min={1} onChange={(v) => set('tradeSizeUsd', v)} hint="Для перевірки «чи вистачить обсягу»" />
                    <NumField label="Вікно глибини стакана" suffix="%" step={0.1} value={draft.depthWindowPct} onChange={(v) => set('depthWindowPct', v)} hint="Скільки можна купити/продати в межах ±% від найкращої ціни" />
                    <NumField label="Рівнів стакана" value={draft.orderbookLimit} min={5} max={200} onChange={(v) => set('orderbookLimit', v)} />
                    <NumField label="Мін. спред для перевірки" suffix="%" step={0.1} value={draft.minCandidateSpreadPct} onChange={(v) => set('minCandidateSpreadPct', v)} hint="Пари нижче порогу не потрапляють у список" />
                    <NumField label="Макс. кандидатів за цикл" value={draft.maxCandidates} onChange={(v) => set('maxCandidates', v)} hint="Обмежує кількість запитів стаканів (rate limit)" />
                    <NumField label="Поріг підозрілого спреду" suffix="%" value={draft.maxPlausibleSpreadPct} onChange={(v) => set('maxPlausibleSpreadPct', v)} hint="Вище — ймовірно різні активи або помилкова ціна" />
                    <NumField label="Мін. обіг ринку за 24г" suffix="USD" step={1000} value={draft.minVolume24hUsd} onChange={(v) => set('minVolume24hUsd', v)} />
                    <NumField label="Інтервал сканування" suffix="с" value={draft.scanIntervalSec} min={3} onChange={(v) => set('scanIntervalSec', v)} />
                    <NumField label="Пам’ять новизни" suffix="с" value={draft.staleAfterSec} onChange={(v) => set('staleAfterSec', v)} hint="Через скільки зникла зв’язка знову вважатиметься новою" />
                    <NumField label="Оновлення статусів гаманців" suffix="с" value={draft.assetInfoRefreshSec} min={30} max={3600} onChange={(v) => set('assetInfoRefreshSec', v)} hint="Як часто в LIVE перепитувати біржі про deposit/withdraw і комісії мереж" />
                  </div>
                </div>
              )}
              {draft && tab === 'fees' && (
                <div className="space-y-4">
                  {ALL_EXCHANGES.map((ex) => (
                    <div key={ex} className="flex flex-wrap items-end gap-4 rounded-lg border border-white/5 p-3">
                      <label className="flex min-w-[120px] items-center gap-2 pb-2">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={draft.exchanges[ex].enabled} onChange={(e) => set('exchanges', { ...draft.exchanges, [ex]: { ...draft.exchanges[ex], enabled: e.target.checked } })} />
                        <span className="font-semibold text-white">{EXCHANGE_LABELS[ex]}</span>
                      </label>
                      <div className="w-40">
                        <NumField label="Тейкер-комісія" suffix="%" step={0.01} value={draft.exchanges[ex].takerFeePct} onChange={(v) => set('exchanges', { ...draft.exchanges, [ex]: { ...draft.exchanges[ex], takerFeePct: v } })} />
                      </div>
                    </div>
                  ))}
                  <NumField label="Комісія мережі, якщо мережу не перевірено" suffix="USD" step={0.1} value={draft.fallbackNetworkFeeUsd} onChange={(v) => set('fallbackNetworkFeeUsd', v)} hint="Для перевірених мереж береться реальна комісія виводу з біржі" />
                  <p className="text-xs text-slate-500">USDC повністю виключено: ринки з USDC не завантажуються ні як котирувальна, ні як базова валюта.</p>
                </div>
              )}
              {draft && tab === 'risk' && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Прослизання (VWAP)</h3>
                    <p className="mt-1 mb-3 text-xs text-slate-400">Ціни купівлі/продажу рахуються як VWAP за глибиною стакана під обсяг угоди. Коли прослизання з’їдає більшу частку спреду за поріг — зв’язка отримує попередження.</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NumField label="Поріг частки спреду, яку з’їдає прослизання" suffix="%" value={draft.maxSlippageShareOfSpreadPct} min={1} max={100} onChange={(v) => set('maxSlippageShareOfSpreadPct', v)} />
                      <NumField label="Обсяг угоди (той самий, що в «Загальних»)" suffix="USDT" value={draft.tradeSizeUsd} min={1} onChange={(v) => set('tradeSizeUsd', v)} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Волатильність (ризик однієї ноги)</h3>
                    <p className="mt-1 mb-3 text-xs text-slate-400">Сканер зберігає mid-ціни кожного ринку і рахує розмах за вікно. Високий розмах = попередження, що спред може зникнути, поки монети йдуть між біржами.</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <NumField label="Вікно аналізу" suffix="с" value={draft.volatility.windowSec} min={10} max={600} onChange={(v) => set('volatility', { ...draft.volatility, windowSec: v })} hint="Потрібно ≥2 циклів сканування у вікні" />
                      <NumField label="Помірна волатильність від" suffix="%" step={0.1} value={draft.volatility.warnPct} onChange={(v) => set('volatility', { ...draft.volatility, warnPct: v })} />
                      <NumField label="Висока волатильність від" suffix="%" step={0.1} value={draft.volatility.highPct} onChange={(v) => set('volatility', { ...draft.volatility, highPct: v })} hint="Показується попередження" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Журнал зв’язок</h3>
                    <p className="mt-1 mb-3 text-xs text-slate-400">Кожна поява спреду від порога записується у <code>server/data/journal.json</code> з часом, біржами, станом стакана, переказу й вердиктом. Перегляд — кнопка «Журнал» у шапці.</p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="flex items-center gap-2 pt-6">
                        <input type="checkbox" className="h-4 w-4 accent-emerald-400" checked={draft.journal.enabled} onChange={(e) => set('journal', { ...draft.journal, enabled: e.target.checked })} />
                        <span className="text-sm text-white">Вести журнал</span>
                      </label>
                      <NumField label="Записувати від спреду" suffix="%" step={0.1} value={draft.journal.minSpreadPct} onChange={(v) => set('journal', { ...draft.journal, minSpreadPct: v })} />
                      <NumField label="Макс. записів" value={draft.journal.maxEntries} min={100} max={100000} step={100} onChange={(v) => set('journal', { ...draft.journal, maxEntries: v })} hint="Найстаріші закриті записи видаляються" />
                    </div>
                    <button className="btn-danger mt-3" disabled={busy} onClick={() => run(async () => { if (!window.confirm('Видалити всі записи журналу?')) return; await api.clearJournal(); flash(true, 'Журнал очищено'); onChanged(); })}>
                      <Trash2 size={14} /> Очистити журнал
                    </button>
                  </div>
                </div>
              )}
              {draft && tab === 'notify' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumField label="Сповіщати від спреду" suffix="%" step={0.1} value={draft.notifications.minSpreadPct} onChange={(v) => set('notifications', { ...draft.notifications, minSpreadPct: v })} />
                  <NumField label="Пауза між повторами" suffix="хв" value={draft.notifications.cooldownMin} onChange={(v) => set('notifications', { ...draft.notifications, cooldownMin: v })} hint="Та сама зв’язка не сповіщається повторно протягом цього часу" />
                  <p className="text-xs text-slate-500 sm:col-span-2">Підозрілі зв’язки та зв’язки з закритим виводом/депозитом («Недоступна для переказу») ніколи не сповіщаються. Сповіщення не змінюють фільтри й не приховують зв’язки. Увімкнути сповіщення в браузері — кнопка «Сповіщення» у шапці.</p>
                </div>
              )}
              {tab === 'demo' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Сценарій демо-даних (JSON): активи, базові ціни, зміщення цін на біржах (bias, %), глибина стакана (depthUsd), мережі й контракти, а також спецвипадки — різні контракти, призупинений вивід, відсутні дані про мережу, періодичні «спалахові» зв’язки (flash).
                  </p>
                  <textarea className="input h-[50vh] font-mono text-xs leading-relaxed" spellCheck={false} value={scenario} onChange={(e) => setScenario(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                      let parsed: unknown;
                      try { parsed = JSON.parse(scenario); } catch { throw new Error('Некоректний JSON'); }
                      const r = await api.putDemoScenario(parsed);
                      setScenario(JSON.stringify(r.scenario, null, 2));
                      flash(true, 'Демо-сценарій збережено');
                      onChanged();
                    })}>
                      <Save size={14} /> Зберегти сценарій
                    </button>
                    <button className="btn-outline" disabled={busy} onClick={() => run(async () => { await api.reseedDemo(); flash(true, 'Шум цін перегенеровано'); onChanged(); })}>
                      <Shuffle size={14} /> Перемішати ціни
                    </button>
                    <button className="btn-danger" disabled={busy} onClick={() => run(async () => {
                      const r = await api.resetDemoScenario();
                      setScenario(JSON.stringify(r.scenario, null, 2));
                      flash(true, 'Демо-сценарій скинуто до стандартного');
                      onChanged();
                    })}>
                      <RotateCcw size={14} /> Стандартний сценарій
                    </button>
                  </div>
                </div>
              )}
              {tab === 'io' && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Експорт</h3>
                    <p className="mt-1 text-xs text-slate-400">Завантажити налаштування та демо-сценарій одним JSON-файлом.</p>
                    <button className="btn-outline mt-3" disabled={busy} onClick={() => run(async () => {
                      const data = await api.exportConfig();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `arbiscan-config-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    })}>
                      <Download size={14} /> Експортувати JSON
                    </button>
                  </div>
                  <div className="rounded-lg border border-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Імпорт</h3>
                    <p className="mt-1 text-xs text-slate-400">Файл перевіряється на сервері перед застосуванням. Поточні налаштування буде замінено.</p>
                    <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      void run(async () => {
                        let parsed: unknown;
                        try { parsed = JSON.parse(await file.text()); } catch { throw new Error('Файл не є коректним JSON'); }
                        await api.importConfig(parsed);
                        await load();
                        flash(true, `Імпортовано «${file.name}»`);
                        onChanged();
                      });
                    }} />
                    <button className="btn-outline mt-3" disabled={busy} onClick={() => fileRef.current?.click()}>
                      <Upload size={14} /> Імпортувати JSON
                    </button>
                  </div>
                  <div className="rounded-lg border border-white/5 p-4">
                    <h3 className="text-sm font-semibold text-white">Скидання</h3>
                    <button className="btn-danger mt-3" disabled={busy} onClick={() => run(async () => { const r = await api.resetSettings(); setSettings(r.settings); setDraft(r.settings); flash(true, 'Налаштування скинуто до стандартних'); onChanged(); })}>
                      <RotateCcw size={14} /> Скинути налаштування
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3 sm:px-6">
              {msg && <span className={clsx('mr-auto text-sm', msg.ok ? 'text-emerald-300' : 'text-rose-300')}>{msg.text}</span>}
              <div className="ml-auto flex gap-2">
                <button className="btn-outline" disabled={busy} onClick={() => run(async () => { await api.scanNow(); flash(true, 'Сканування виконано'); onChanged(); })}>
                  <Play size={14} /> Сканувати зараз
                </button>
                {['general', 'fees', 'risk', 'notify'].includes(tab) && (
                  <button className="btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
                    <Save size={14} /> Зберегти
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
