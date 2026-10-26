import { afterEach, describe, expect, it, vi } from 'vitest';
import { BitgetAdapter, parseBitgetBook } from './bitget.js';

afterEach(() => vi.restoreAllMocks());

describe('Bitget V3', () => {
  it('розбирає сторони стакана з data.a / data.b', () => {
    const b = parseBitgetBook({ a: [[100.5, '2'], ['101', 1]], b: [['100.4', '3']], ts: '1700000000000' });
    expect(b.asks).toEqual([[100.5, 2], [101, 1]]);
    expect(b.bids).toEqual([[100.4, 3]]);
  });

  it('відхиляє відповідь без data.a / data.b', () => {
    expect(() => parseBitgetBook({ asks: [], bids: [] } as never)).toThrow(/data\.a/);
  });

  it('запит стакана містить category=SPOT', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: '00000', msg: 'success', data: { a: [[1, 1]], b: [[0.9, 1]], ts: '1' } })),
    );
    await new BitgetAdapter().fetchOrderBook('BTCUSDT', 50);
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('/api/v3/market/orderbook');
    expect(url).toContain('category=SPOT');
    expect(url).toContain('symbol=BTCUSDT');
  });

  it('виключає USDC та не-USDT ринки', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const data = url.includes('instruments')
        ? [
            { symbol: 'BTCUSDT', baseCoin: 'BTC', quoteCoin: 'USDT', status: 'online' },
            { symbol: 'USDCUSDT', baseCoin: 'USDC', quoteCoin: 'USDT', status: 'online' },
            { symbol: 'BTCUSDC', baseCoin: 'BTC', quoteCoin: 'USDC', status: 'online' },
          ]
        : [
            { symbol: 'BTCUSDT', bid1Price: '1', ask1Price: '2', lastPrice: '1', turnover24h: '10', ts: '1' },
            { symbol: 'USDCUSDT', bid1Price: '1', ask1Price: '1', lastPrice: '1', turnover24h: '10', ts: '1' },
            { symbol: 'BTCUSDC', bid1Price: '1', ask1Price: '2', lastPrice: '1', turnover24h: '10', ts: '1' },
          ];
      expect(url).toContain('category=SPOT');
      return new Response(JSON.stringify({ code: '00000', msg: 'success', data }));
    });
    const markets = await new BitgetAdapter().fetchMarkets();
    expect(markets.map((m) => m.symbol)).toEqual(['BTCUSDT']);
  });
});
