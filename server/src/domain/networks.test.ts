import { describe, expect, it } from 'vitest';
import { normalizeContract, normalizeNetwork } from './networks.js';

describe('normalizeNetwork', () => {
  it('зводить назви мереж різних бірж до спільного вигляду', () => {
    expect(normalizeNetwork('USDT-TRC20', 'USDT')).toBe('TRX');
    expect(normalizeNetwork('TRX')).toBe('TRX');
    expect(normalizeNetwork('TRC20')).toBe('TRX');
    expect(normalizeNetwork('ERC20')).toBe('ETH');
    expect(normalizeNetwork('ETH-ERC20', 'ETH')).toBe('ETH');
    expect(normalizeNetwork('BEP20')).toBe('BSC');
    expect(normalizeNetwork('ArbitrumOne')).toBe('ARB');
    expect(normalizeNetwork('ARBI')).toBe('ARB');
    expect(normalizeNetwork('USDT-Arbitrum One', 'USDT')).toBe('ARB');
    expect(normalizeNetwork('BTC-Bitcoin', 'BTC')).toBe('BTC');
  });
  it('EVM-контракти порівнюються без урахування регістру', () => {
    expect(normalizeContract('0xDAC17F958D2ee523a2206206994597C13D831ec7')).toBe('0xdac17f958d2ee523a2206206994597c13d831ec7');
    expect(normalizeContract('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    expect(normalizeContract('')).toBeUndefined();
  });
});
