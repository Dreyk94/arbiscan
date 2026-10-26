import crypto from 'node:crypto';
import { normalizeContract, normalizeNetwork } from '../domain/networks.js';
import { type AssetInfo, type ChainInfo, EXCLUDED_ASSETS, type ExchangeId, type OrderBook, QUOTE_ASSET } from '../domain/types.js';
import { num } from './http.js';

export type RawLevels = Array<Array<number | string>> | undefined;

export function parseLevels(asks: RawLevels, bids: RawLevels, ts?: number | string): OrderBook {
  if (!Array.isArray(asks) || !Array.isArray(bids)) throw new Error('Некоректна відповідь стакана: немає asks/bids');
  return {
    asks: asks.map((l) => [num(l[0]), num(l[1])]),
    bids: bids.map((l) => [num(l[0]), num(l[1])]),
    ts: num(ts) || Date.now(),
  };
}

export function isAllowedSpot(base: string, quote: string): boolean {
  return quote === QUOTE_ASSET && !EXCLUDED_ASSETS.has(base);
}

export function hmacHex(alg: 'sha256' | 'sha512', secret: string, payload: string): string {
  return crypto.createHmac(alg, secret).update(payload).digest('hex');
}

/** Binance/MEXC: capital/config/getall — однакова структура відповіді */
export interface CapitalCoin {
  coin: string;
  name?: string;
  networkList?: Array<{
    network?: string;
    netWork?: string;
    contract?: string;
    contractAddress?: string;
    depositEnable: boolean;
    withdrawEnable: boolean;
    withdrawFee: string;
    withdrawMin?: string;
  }>;
}

export function capitalToAssets(exchange: ExchangeId, rows: CapitalCoin[]): Map<string, AssetInfo> {
  const assets = new Map<string, AssetInfo>();
  for (const r of rows) {
    if (EXCLUDED_ASSETS.has(r.coin) && r.coin !== QUOTE_ASSET) continue;
    const chains: ChainInfo[] = (r.networkList ?? []).map((n) => {
      const raw = n.netWork || n.network || '';
      return {
        network: normalizeNetwork(raw, r.coin),
        rawChain: raw,
        contract: normalizeContract(n.contractAddress ?? n.contract),
        depositEnabled: Boolean(n.depositEnable),
        withdrawEnabled: Boolean(n.withdrawEnable),
        withdrawFee: num(n.withdrawFee),
        minWithdraw: num(n.withdrawMin),
      };
    });
    assets.set(r.coin, { exchange, coin: r.coin, fullName: r.name || undefined, chains });
  }
  return assets;
}
