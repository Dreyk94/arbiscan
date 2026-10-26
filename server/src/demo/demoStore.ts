import fs from 'node:fs';
import path from 'node:path';
import type { DemoSource } from './demoSource.js';
import { DEFAULT_DEMO_SCENARIO, type DemoScenario, demoScenarioSchema } from './scenario.js';

/** Зберігає відредагований адміністратором демо-сценарій у JSON-файлі. */
export class DemoStore {
  constructor(private readonly file: string, private readonly source: DemoSource) {
    source.setScenario(this.load());
  }

  get(): DemoScenario {
    return this.source.getScenario();
  }

  set(s: DemoScenario): void {
    this.source.setScenario(s);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(s, null, 2));
  }

  reset(): void {
    this.source.setScenario(DEFAULT_DEMO_SCENARIO);
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
  }

  reseed(): void {
    this.source.reseed();
  }

  private load(): DemoScenario {
    try {
      if (fs.existsSync(this.file)) return demoScenarioSchema.parse(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch (e) {
      console.warn('[demo] Некоректний файл сценарію, використовую стандартний:', e);
    }
    return DEFAULT_DEMO_SCENARIO;
  }
}
