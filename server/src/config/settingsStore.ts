import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, mergeSettings, type PartialSettings, type Settings, settingsSchema } from './settings.js';

export class SettingsStore {
  private settings: Settings;
  private listeners = new Set<(s: Settings, prev: Settings) => void>();

  constructor(private readonly file: string) {
    this.settings = this.load();
  }

  get(): Settings {
    return this.settings;
  }

  update(patch: PartialSettings): Settings {
    return this.replace(mergeSettings(this.settings, patch));
  }

  replace(next: Settings): Settings {
    const prev = this.settings;
    this.settings = settingsSchema.parse(next);
    this.persist();
    for (const l of this.listeners) l(this.settings, prev);
    return this.settings;
  }

  reset(): Settings {
    return this.replace(DEFAULT_SETTINGS);
  }

  onChange(fn: (s: Settings, prev: Settings) => void): void {
    this.listeners.add(fn);
  }

  private load(): Settings {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        return mergeSettings(DEFAULT_SETTINGS, raw);
      }
    } catch (e) {
      console.warn(`[settings] Не вдалося прочитати ${this.file}, використовую значення за замовчуванням:`, e);
    }
    return DEFAULT_SETTINGS;
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.settings, null, 2));
    } catch (e) {
      console.warn('[settings] Не вдалося зберегти налаштування:', e);
    }
  }
}
