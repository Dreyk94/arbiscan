import { afterEach, describe, expect, it, vi } from 'vitest';
import { BinanceLikeAdapter } from './binance.js';
import { capitalToAssets, parseLevels } from './cex.js';
import { GateAdapter } from './gate.js';
import { KucoinAdapter } from './kucoin.js';

afterEach(() => vi.restoreAllMocks());

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('нові біржі', () => {
  it('parseLevels розбирає asks/bids', () => {
    expect(parseLevels([['1.1', '5']], [['1', '3']], 7)).toEqual({ asks: [[1.1, 5]], bids: [[1, 3]], ts: 7 });
    expect(() => parseLevels(undefined, [])).toThrow();
  });

  it('capitalToAssets нормалізує мережі MEXC/Binance', () => {
    const a = capitalToAssets('mexc', [
      { coin: 'PEPE', name: 'Pepe', networkList: [{ netWork: 'ETH', network: 'ERC20', contract: '0xABC', depositEnable: true, withdrawEnable: false, withdrawFee: '100' }] },
      { coin: 'USDC', networkList: [] },
    ]);
    expect(a.has('USDC')).toBe(false);
    expect(a.get('PEPE')!.chains[0]).toMatchObject({ network: 'ETH', contract: '0xabc', withdrawEnabled: false, withdrawFee: 100 });
  });

  it('Binance: лише TRADING USDT, без USDC', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const u = String(input);
      if (u.includes('exchangeInfo'))
        return json({ symbols: [
          { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' },
          { symbol: 'BTCUSDC', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDC' },
          { symbol: 'USDCUSDT', status: 'TRADING', baseAsset: 'USDC', quoteAsset: 'USDT' },
          { symbol: 'XUSDT', status: 'BREAK', baseAsset: 'X', quoteAsset: 'USDT' },
        ] });
      if (u.includes('bookTicker')) return json(['BTCUSDT', 'BTCUSDC', 'USDCUSDT', 'XUSDT'].map((symbol) => ({ symbol, bidPrice: '1', askPrice: '2' })));
      return json(['BTCUSDT', 'BTCUSDC', 'USDCUSDT', 'XUSDT'].map((symbol) => ({ symbol, quoteVolume: '10', lastPrice: '1.5' })));
    });
    const m = await new BinanceLikeAdapter('binance', 'https://x', { capitalPath: '/c', keyHeader: 'K', label: 'B' }).fetchMarkets();
    expect(m.map((x) => x.symbol)).toEqual(['BTCUSDT']);
  });

  it('KuCoin: мережі з комісіями з публічного /api/v3/currencies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ code: '200000', data: [{ currency: 'PEPE', fullName: 'Pepe', chains: [{ chainName: 'ERC20', chainId: 'eth', contractAddress: '0xAb', isDepositEnabled: true, isWithdrawEnabled: true, withdrawalMinFee: '600000' }] }] }),
    );
    const s = await new KucoinAdapter().fetchAssetInfo();
    expect(s.status).toBe('ok');
    if (s.status === 'ok') expect(s.assets.get('PEPE')!.chains[0]).toMatchObject({ network: 'ETH', contract: '0xab', withdrawFee: 600000 });
  });

  it('Gate без ключів: мережі є, комісія невідома (NaN)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json([{ currency: 'PEPE', name: 'Pepe', chains: [{ name: 'ETH', addr: '0xAB', withdraw_disabled: false, deposit_disabled: true }] }]),
    );
    const s = await new GateAdapter().fetchAssetInfo();
    if (s.status !== 'ok') throw new Error('expected ok');
    const c = s.assets.get('PEPE')!.chains[0];
    expect(c).toMatchObject({ network: 'ETH', depositEnabled: false, withdrawEnabled: true });
    expect(Number.isNaN(c.withdrawFee)).toBe(true);
  });
});
