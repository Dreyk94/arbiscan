const usd0 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 1 });

export function fmtUsd(v: number, precise = false): string {
  if (!Number.isFinite(v)) return '—';
  const f = precise || Math.abs(v) < 100 ? usd2 : usd0;
  return `${v < 0 ? '−' : ''}$${f.format(Math.abs(v))}`;
}

export function fmtUsdCompact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1000) return fmtUsd(v);
  return `${v < 0 ? '−' : ''}$${compact.format(Math.abs(v))}`;
}

export function fmtSignedUsd(v: number): string {
  const s = fmtUsd(Math.abs(v), true);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function fmtPct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  const s = `${Math.abs(v).toFixed(digits).replace('.', ',')}%`;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export function fmtPrice(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  const digits = v >= 1000 ? 2 : v >= 1 ? 4 : v >= 0.01 ? 6 : 10;
  const s = v.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

export function fmtQty(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1000) return compact.format(v);
  return v.toPrecision(5).replace(/\.?0+$/, '').replace('.', ',');
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return 'щойно';
  if (s < 60) return `${s} с тому`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} хв тому`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} д тому`;
}
