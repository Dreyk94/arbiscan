import { describe, expect, it } from 'vitest';
import { ALL_EXCHANGES } from '../types';
import { tradeUrl } from './tradeUrl';

describe('tradeUrl', () => {
  it('веде на Spot-пару монети до USDT на кожній біржі', () => {
    expect(tradeUrl('okx', 'PEPE')).toBe('https://www.okx.com/trade-spot/pepe-usdt');
    expect(tradeUrl('bybit', 'PEPE')).toBe('https://www.bybit.com/trade/spot/PEPE/USDT');
    expect(tradeUrl('bitget', 'PEPE')).toBe('https://www.bitget.com/spot/PEPEUSDT');
    expect(tradeUrl('gate', 'PEPE')).toBe('https://www.gate.com/trade/PEPE_USDT');
    expect(tradeUrl('kucoin', 'PEPE')).toBe('https://www.kucoin.com/trade/PEPE-USDT');
    for (const ex of ALL_EXCHANGES) expect(tradeUrl(ex, 'wif')).toMatch(/^https:\/\/www\.[a-z]+\.com\/.*WIF|wif/i);
  });
});
