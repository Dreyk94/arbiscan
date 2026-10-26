import fs from 'node:fs';
import path from 'node:path';
import { Journal, type JournalEntry } from './domain/journal.js';

/** Журнал зв'язок із збереженням у JSON-файлі (server/data/journal.json). */
export function createFileJournal(file: string): Journal {
  let initial: JournalEntry[] = [];
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(raw)) initial = raw as JournalEntry[];
    }
  } catch (e) {
    console.warn(`[journal] Не вдалося прочитати ${file}, починаю з порожнього журналу:`, e);
  }
  let timer: NodeJS.Timeout | null = null;
  let pending: JournalEntry[] | null = null;
  const write = () => {
    timer = null;
    if (!pending) return;
    const entries = pending;
    pending = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(entries));
      fs.renameSync(tmp, file);
    } catch (e) {
      console.warn('[journal] Не вдалося зберегти журнал:', e);
    }
  };
  const persist = (entries: JournalEntry[]) => {
    pending = entries;
    if (!timer) timer = setTimeout(write, 2000);
  };
  const journal = new Journal(initial, persist);
  process.once('beforeExit', write);
  return journal;
}
