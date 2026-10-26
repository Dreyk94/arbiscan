import type { ExchangeId } from '../types';

/** Посилання на Spot-сторінку торгівлі монетою до USDT на біржі */
export function tradeUrl(ex: ExchangeId, base: string): string {
  const B = encodeURIComponent(base.toUpperCase());
  switch (ex) {
    case 'okx':
      return `https://www.okx.com/trade-spot/${B.toLowerCase()}-usdt`;
    case 'bybit':
      return `https://www.bybit.com/trade/spot/${B}/USDT`;
    case 'bitget':
      return `https://www.bitget.com/spot/${B}USDT`;
    case 'gate':
      return `https://www.gate.com/trade/${B}_USDT`;
    case 'mexc':
      return `https://www.mexc.com/exchange/${B}_USDT`;
    case 'binance':
      return `https://www.binance.com/en/trade/${B}_USDT?type=spot`;
    case 'kucoin':
      return `https://www.kucoin.com/trade/${B}-USDT`;
  }
}
