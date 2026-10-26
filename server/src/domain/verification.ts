import { normalizeContract, normalizeName } from './networks.js';
import type { AssetInfo, AssetInfoState, ChainInfo, NetworkRoute, NetworkStatus } from './types.js';

export interface NetworkVerification {
  status: NetworkStatus;
  /** Мережі, якими можна переказати актив (або відомі мережі, якщо перевірка неможлива) */
  networks: string[];
  route?: NetworkRoute;
  contractMismatch: boolean;
  /** Хоча б в одній спільній мережі контракти збігаються явно */
  contractConfirmed: boolean;
  nameMismatch: boolean;
  notes: string[];
}

export function getAsset(state: AssetInfoState | undefined, coin: string): AssetInfo | undefined {
  if (!state || state.status !== 'ok') return undefined;
  return state.assets.get(coin);
}

/**
 * Перевіряє, що актив на двох біржах — той самий токен (мережа + контракт),
 * та що його можна вивести з біржі купівлі й завести на біржу продажу.
 */
export function verifyTransfer(
  buy: AssetInfo | undefined,
  sell: AssetInfo | undefined,
  price: number,
): NetworkVerification {
  const notes: string[] = [];
  const nameMismatch = Boolean(
    buy?.fullName && sell?.fullName && normalizeName(buy.fullName) !== normalizeName(sell.fullName),
  );
  if (nameMismatch) notes.push(`Різні назви активу: «${buy!.fullName}» vs «${sell!.fullName}»`);

  if (!buy || !sell) {
    const known = new Set<string>();
    for (const c of [...(buy?.chains ?? []), ...(sell?.chains ?? [])]) known.add(c.network);
    notes.push(
      !buy && !sell
        ? 'Немає даних про мережі на обох біржах'
        : `Немає даних про мережі на біржі ${!buy ? 'купівлі' : 'продажу'}`,
    );
    return { status: 'unverified', networks: [...known].sort(), contractMismatch: false, contractConfirmed: false, nameMismatch, notes };
  }

  const sellByNet = new Map<string, ChainInfo>();
  for (const c of sell.chains) sellByNet.set(c.network, c);

  const common: Array<{ b: ChainInfo; s: ChainInfo }> = [];
  for (const b of buy.chains) {
    const s = sellByNet.get(b.network);
    if (s) {
      common.push({
        b: { ...b, contract: normalizeContract(b.contract) },
        s: { ...s, contract: normalizeContract(s.contract) },
      });
    }
  }
  if (!common.length) {
    notes.push('Немає спільної мережі для переказу');
    return { status: 'no_common', networks: [], contractMismatch: false, contractConfirmed: false, nameMismatch, notes };
  }

  const sameToken = common.filter(({ b, s }) => !b.contract || !s.contract || b.contract === s.contract);
  const contractConfirmed = sameToken.some(({ b, s }) => Boolean(b.contract && s.contract));
  const mismatched = common.filter(({ b, s }) => b.contract && s.contract && b.contract !== s.contract);
  for (const { b } of mismatched) notes.push(`Різні контракти в мережі ${b.network}`);
  if (!sameToken.length) {
    return { status: 'mismatch', networks: [], contractMismatch: true, contractConfirmed: false, nameMismatch, notes };
  }

  const open = sameToken.filter(({ b, s }) => b.withdrawEnabled && s.depositEnabled);
  if (!open.length) {
    notes.push('Вивід на біржі купівлі або депозит на біржі продажу призупинено');
    return {
      status: 'suspended',
      networks: sameToken.map(({ b }) => b.network).sort(),
      contractMismatch: mismatched.length > 0,
      contractConfirmed,
      nameMismatch,
      notes,
    };
  }

  const cheapest = [...open].sort((x, y) => feeKey(x.b.withdrawFee) - feeKey(y.b.withdrawFee))[0];
  return {
    status: 'verified',
    networks: open.map(({ b }) => b.network).sort(),
    route: {
      network: cheapest.b.network,
      withdrawFeeCoin: cheapest.b.withdrawFee,
      withdrawFeeUsd: cheapest.b.withdrawFee * price,
      contract: cheapest.b.contract ?? cheapest.s.contract,
    },
    contractMismatch: mismatched.length > 0,
    contractConfirmed,
    nameMismatch,
    notes,
  };
}

function feeKey(fee: number): number {
  return Number.isFinite(fee) ? fee : Number.POSITIVE_INFINITY;
}
