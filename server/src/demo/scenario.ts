import { z } from 'zod';
import { EXCHANGES } from '../domain/types.js';

const listing = z.object({
  /** Зміщення ціни на цій біржі відносно базової, % */
  bias: z.number(),
  /** Приблизна ліквідність однієї сторони стакана, USD */
  depthUsd: z.number().positive(),
  contractOverride: z.string().optional(),
  fullNameOverride: z.string().optional(),
  withdrawDisabled: z.boolean().optional(),
  depositDisabled: z.boolean().optional(),
  /** Біржа «не віддає» дані про мережі для цього активу */
  noAssetInfo: z.boolean().optional(),
  /** Біржа не віддає стакан (помилка API) — прибуток буде попереднім */
  bookUnavailable: z.boolean().optional(),
});

export const demoScenarioSchema = z.object({
  version: z.literal(1),
  coins: z
    .array(
      z.object({
        base: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/, 'Тикер: лише A-Z та 0-9'),
        fullName: z.string(),
        price: z.number().positive(),
        volume24hUsd: z.number().nonnegative(),
        networks: z.array(z.object({ network: z.string(), contract: z.string().optional(), withdrawFee: z.number().nonnegative() })).min(1),
        listings: z.object({ okx: listing.optional(), bybit: listing.optional(), bitget: listing.optional(), gate: listing.optional(), mexc: listing.optional(), binance: listing.optional(), kucoin: listing.optional() }),
        /** Періодична «спалахова» зв'язка: додаткове зміщення на біржі протягом activeSec кожні periodSec */
        flash: z
          .object({ exchange: z.enum(EXCHANGES), bias: z.number(), periodSec: z.number().positive(), activeSec: z.number().positive() })
          .optional(),
      }),
    )
    .max(500),
});

export type DemoScenario = z.infer<typeof demoScenarioSchema>;

const ETH_USDT_LIKE = (contract: string, fee = 1.5) => [{ network: 'ETH', contract, withdrawFee: fee }];

export const DEFAULT_DEMO_SCENARIO: DemoScenario = {
  version: 1,
  coins: [
    {
      base: 'BTC', fullName: 'Bitcoin', price: 67250, volume24hUsd: 950_000_000,
      networks: [{ network: 'BTC', withdrawFee: 0.0002 }],
      listings: { okx: { bias: 0, depthUsd: 2_000_000 }, bybit: { bias: 0.02, depthUsd: 2_000_000 }, bitget: { bias: -0.01, depthUsd: 1_500_000 }, gate: { bias: 0.01, depthUsd: 900_000 }, mexc: { bias: -0.02, depthUsd: 700_000 }, binance: { bias: 0, depthUsd: 5_000_000 }, kucoin: { bias: 0.03, depthUsd: 800_000 } },
    },
    {
      base: 'ETH', fullName: 'Ethereum', price: 3480, volume24hUsd: 520_000_000,
      networks: [{ network: 'ETH', withdrawFee: 0.0015 }, { network: 'ARB', withdrawFee: 0.0001 }, { network: 'BASE', withdrawFee: 0.00005 }],
      listings: { okx: { bias: 0, depthUsd: 1_500_000 }, bybit: { bias: -0.03, depthUsd: 1_200_000 }, bitget: { bias: 0.02, depthUsd: 900_000 }, gate: { bias: 0.04, depthUsd: 600_000 }, mexc: { bias: 0.01, depthUsd: 500_000 }, binance: { bias: 0, depthUsd: 4_000_000 }, kucoin: { bias: -0.02, depthUsd: 600_000 } },
    },
    {
      base: 'SOL', fullName: 'Solana', price: 152.4, volume24hUsd: 210_000_000,
      networks: [{ network: 'SOL', withdrawFee: 0.008 }],
      listings: { okx: { bias: 0, depthUsd: 600_000 }, bybit: { bias: 0.05, depthUsd: 700_000 }, bitget: { bias: -0.04, depthUsd: 400_000 }, gate: { bias: 0.06, depthUsd: 300_000 }, mexc: { bias: -0.05, depthUsd: 250_000 }, binance: { bias: 0.01, depthUsd: 2_000_000 }, kucoin: { bias: 0.04, depthUsd: 300_000 } },
    },
    {
      base: 'JUP', fullName: 'Jupiter', price: 0.92, volume24hUsd: 18_000_000,
      networks: [{ network: 'SOL', contract: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', withdrawFee: 2 }],
      listings: { okx: { bias: -1.4, depthUsd: 45_000 }, bybit: { bias: 1.6, depthUsd: 60_000 }, bitget: { bias: 0.2, depthUsd: 30_000 }, gate: { bias: 1.2, depthUsd: 20_000 }, binance: { bias: 0.2, depthUsd: 150_000 }, kucoin: { bias: 2.6, depthUsd: 25_000 } },
    },
    {
      base: 'TIA', fullName: 'Celestia', price: 6.1, volume24hUsd: 25_000_000,
      networks: [{ network: 'TIA', withdrawFee: 0.05 }],
      listings: { okx: { bias: -1.3, depthUsd: 80_000, noAssetInfo: true }, bybit: { bias: 0.1, depthUsd: 90_000 }, bitget: { bias: 1.2, depthUsd: 50_000 }, mexc: { bias: 2.1, depthUsd: 30_000, noAssetInfo: true }, binance: { bias: 0.1, depthUsd: 200_000 }, kucoin: { bias: 0.9, depthUsd: 40_000 } },
    },
    {
      base: 'KAS', fullName: 'Kaspa', price: 0.135, volume24hUsd: 12_000_000,
      networks: [{ network: 'KAS', withdrawFee: 1 }],
      listings: { bitget: { bias: -1.8, depthUsd: 40_000, withdrawDisabled: true }, bybit: { bias: 0.4, depthUsd: 50_000 }, gate: { bias: 3.1, depthUsd: 45_000 }, mexc: { bias: 2.4, depthUsd: 60_000 }, kucoin: { bias: 0.6, depthUsd: 30_000, depositDisabled: true } },
    },
    {
      base: 'MEME', fullName: 'Memecoin', price: 0.0115, volume24hUsd: 900_000,
      networks: ETH_USDT_LIKE('0xb131f4a55907b10d1f0a50d8ab8fa09ec342cd74', 400),
      listings: { bybit: { bias: -2.2, depthUsd: 9_000 }, bitget: { bias: 1.4, depthUsd: 70 }, binance: { bias: 0.1, depthUsd: 80_000 }, gate: { bias: 2.8, depthUsd: 4_000 } },
    },
    {
      base: 'GMT', fullName: 'STEPN', price: 0.21, volume24hUsd: 6_000_000,
      networks: [{ network: 'SOL', contract: '7i5KKsX2weiTkry7jA4ZwSuXGhs5eJBEjY8vVxR4pfRx', withdrawFee: 3 }],
      listings: {
        okx: { bias: 0, depthUsd: 50_000 },
        bitget: { bias: 0.1, depthUsd: 40_000 },
        bybit: { bias: 42, depthUsd: 30_000, contractOverride: 'GMTfakeTokenDifferentProject1111111111111', fullNameOverride: 'Gomining Token' },
      },
    },
    {
      base: 'ZRO', fullName: 'LayerZero', price: 3.4, volume24hUsd: 15_000_000,
      networks: ETH_USDT_LIKE('0x6985884c4392d348587b19cb9eaaf157f13271cd', 0.5),
      listings: { okx: { bias: 0, depthUsd: 70_000 }, bybit: { bias: 0.15, depthUsd: 60_000 }, bitget: { bias: 65, depthUsd: 2_000 }, binance: { bias: 0, depthUsd: 120_000 }, mexc: { bias: 0.3, depthUsd: 30_000 } },
    },
    {
      base: 'DOGS', fullName: 'Dogs', price: 0.00014, volume24hUsd: 40_000_000,
      networks: [{ network: 'TON', withdrawFee: 2500 }],
      listings: { okx: { bias: 0, depthUsd: 250_000 }, bybit: { bias: 0.3, depthUsd: 200_000 }, bitget: { bias: 0.85, depthUsd: 150_000 }, gate: { bias: 0.5, depthUsd: 120_000 }, mexc: { bias: -0.4, depthUsd: 100_000 }, kucoin: { bias: 0.2, depthUsd: 80_000 } },
    },
    {
      base: 'PEPE', fullName: 'Pepe', price: 0.0000112, volume24hUsd: 140_000_000,
      networks: ETH_USDT_LIKE('0x6982508145454ce325ddbe47a25d4ec3d2311933', 450_000),
      listings: { okx: { bias: 0.1, depthUsd: 300_000 }, bybit: { bias: -0.6, depthUsd: 280_000 }, bitget: { bias: 0.7, depthUsd: 200_000 }, gate: { bias: 0.2, depthUsd: 150_000 }, mexc: { bias: 0.3, depthUsd: 180_000 }, binance: { bias: 0, depthUsd: 1_500_000 }, kucoin: { bias: -0.2, depthUsd: 120_000 } },
    },
    {
      base: 'WIF', fullName: 'dogwifhat', price: 2.45, volume24hUsd: 60_000_000,
      networks: [{ network: 'SOL', contract: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', withdrawFee: 0.1 }],
      listings: { okx: { bias: 0, depthUsd: 150_000 }, bybit: { bias: 0.1, depthUsd: 160_000 }, bitget: { bias: -0.1, depthUsd: 120_000 }, gate: { bias: -0.3, depthUsd: 60_000 }, mexc: { bias: 0.4, depthUsd: 70_000 }, binance: { bias: 0, depthUsd: 600_000 } },
      flash: { exchange: 'bitget', bias: 2.9, periodSec: 180, activeSec: 70 },
    },
    {
      base: 'NOT', fullName: 'Notcoin', price: 0.0081, volume24hUsd: 30_000_000,
      networks: [{ network: 'TON', contract: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', withdrawFee: 15 }],
      listings: { okx: { bias: 0, depthUsd: 90_000 }, bybit: { bias: 0.05, depthUsd: 100_000 }, bitget: { bias: 0, depthUsd: 60_000 }, gate: { bias: 0.4, depthUsd: 40_000 }, mexc: { bias: 2.9, depthUsd: 50_000, contractOverride: 'EQBnotFAKEcontract0000000000000000000000000000000' }, binance: { bias: 0.1, depthUsd: 300_000 }, kucoin: { bias: 0.5, depthUsd: 35_000 } },
      flash: { exchange: 'okx', bias: -2.6, periodSec: 240, activeSec: 90 },
    },
    {
      base: 'ARB', fullName: 'Arbitrum', price: 0.78, volume24hUsd: 45_000_000,
      networks: [{ network: 'ARB', contract: '0x912ce59144191c1204e64559fe8253a0e49e6548', withdrawFee: 0.3 }],
      listings: { okx: { bias: 0, depthUsd: 120_000 }, bybit: { bias: 0.55, depthUsd: 130_000 }, bitget: { bias: -0.6, depthUsd: 90_000, depositDisabled: true, bookUnavailable: true }, gate: { bias: 0.3, depthUsd: 70_000 }, binance: { bias: 0, depthUsd: 900_000 }, kucoin: { bias: 1.9, depthUsd: 60_000 } },
    },
    {
      base: 'SUI', fullName: 'Sui', price: 1.85, volume24hUsd: 80_000_000,
      networks: [{ network: 'SUI', withdrawFee: 0.1 }],
      listings: { okx: { bias: -0.5, depthUsd: 160_000 }, bybit: { bias: 0.7, depthUsd: 170_000 }, gate: { bias: 2.3, depthUsd: 90_000, withdrawDisabled: true }, mexc: { bias: 0.6, depthUsd: 80_000 }, binance: { bias: 0, depthUsd: 1_000_000 }, kucoin: { bias: 0.3, depthUsd: 70_000 } },
    },
  ],
};
