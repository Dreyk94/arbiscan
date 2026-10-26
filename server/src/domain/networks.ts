/** Нормалізація назв мереж між біржами (OKX: "USDT-TRC20", Bybit: "TRX", Bitget: "TRC20"). */
const ALIASES: Record<string, string> = {
  ERC20: 'ETH',
  ETH: 'ETH',
  ETHEREUM: 'ETH',
  TRC20: 'TRX',
  TRX: 'TRX',
  TRON: 'TRX',
  BEP20: 'BSC',
  BSC: 'BSC',
  'BNB SMART CHAIN': 'BSC',
  BNBSMARTCHAIN: 'BSC',
  'BSC (BEP20)': 'BSC',
  BEP2: 'BNB',
  SOL: 'SOL',
  SOLANA: 'SOL',
  SPL: 'SOL',
  ARBITRUM: 'ARB',
  ARBITRUMONE: 'ARB',
  'ARBITRUM ONE': 'ARB',
  ARBONE: 'ARB',
  ARBI: 'ARB',
  ARBEVM: 'ARB',
  ARBITRUMONEARB: 'ARB',
  BASEEVM: 'BASE',
  OPTIMISMOP: 'OP',
  BEP20BSC: 'BSC',
  ERC20ETH: 'ETH',
  TRC20TRX: 'TRX',
  ETHEREUMERC20: 'ETH',
  AVAX_C: 'AVAXC',
  LINEAETH: 'LINEA',
  ZKSERA: 'ZKSYNC',
  ZKSYNC2: 'ZKSYNC',
  SUINEW: 'SUI',
  OPTIMISM: 'OP',
  OP: 'OP',
  OPETH: 'OP',
  POLYGON: 'POLYGON',
  MATIC: 'POLYGON',
  'POLYGON POS': 'POLYGON',
  POL: 'POLYGON',
  BASE: 'BASE',
  AVAXC: 'AVAXC',
  'AVAX C-CHAIN': 'AVAXC',
  'AVALANCHE C-CHAIN': 'AVAXC',
  CAVAX: 'AVAXC',
  'C-CHAIN': 'AVAXC',
  TON: 'TON',
  TONCOIN: 'TON',
  BTC: 'BTC',
  BITCOIN: 'BTC',
  LTC: 'LTC',
  LITECOIN: 'LTC',
  XRP: 'XRP',
  RIPPLE: 'XRP',
  DOGE: 'DOGE',
  DOGECOIN: 'DOGE',
  APT: 'APT',
  APTOS: 'APT',
  SUI: 'SUI',
  NEAR: 'NEAR',
  'NEAR PROTOCOL': 'NEAR',
  ADA: 'ADA',
  CARDANO: 'ADA',
  DOT: 'DOT',
  POLKADOT: 'DOT',
  ZKSYNC: 'ZKSYNC',
  'ZKSYNC ERA': 'ZKSYNC',
  ZKSYNCERA: 'ZKSYNC',
  LINEA: 'LINEA',
  KAVAEVM: 'KAVAEVM',
  ATOM: 'ATOM',
  COSMOS: 'ATOM',
};

export function normalizeNetwork(raw: string, coin?: string): string {
  let s = raw.trim().toUpperCase();
  // OKX формат: "<COIN>-<CHAIN>", напр. "USDT-TRC20", "BTC-Bitcoin"
  if (coin) {
    const prefix = `${coin.toUpperCase()}-`;
    if (s.startsWith(prefix)) s = s.slice(prefix.length);
  }
  s = s.replace(/\s+/g, ' ');
  if (ALIASES[s]) return ALIASES[s];
  const compact = s.replace(/[\s_\-()]/g, '');
  if (ALIASES[compact]) return ALIASES[compact];
  return compact;
}

export function normalizeContract(c?: string | null): string | undefined {
  if (!c) return undefined;
  const t = c.trim();
  if (!t || t === '0' || t === '-') return undefined;
  // EVM-адреси нечутливі до регістру; інші (TRON, Solana) — чутливі
  return /^0x[0-9a-fA-F]+$/.test(t) ? t.toLowerCase() : t;
}

export function normalizeName(n?: string): string | undefined {
  if (!n) return undefined;
  const t = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  return t || undefined;
}
