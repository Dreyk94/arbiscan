export class HttpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ArbiScan/1.0', ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new HttpError(`HTTP ${res.status}: відповідь не є JSON (${text.slice(0, 120).replace(/\s+/g, ' ')})`, res.status);
    }
    if (!res.ok) {
      const msg = (body as { msg?: string; retMsg?: string })?.msg ?? (body as { retMsg?: string })?.retMsg ?? '';
      throw new HttpError(`HTTP ${res.status} ${msg}`.trim(), res.status);
    }
    return body as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new HttpError(`Тайм-аут запиту (${timeoutMs} мс)`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Мінімальний обмежувач паралельності запитів (захист від rate limit). */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (run) run();
  };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
