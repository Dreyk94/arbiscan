import type { OpportunitiesResponse, Settings } from '../types';

const TOKEN_KEY = 'arbiscan.adminToken';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (admin) headers['x-admin-token'] = getAdminToken() ?? '';
  const res = await fetch(`/api${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* порожня відповідь */
  }
  if (!res.ok) {
    const b = body as { error?: string; details?: unknown } | null;
    throw new ApiError(b?.error ?? `Помилка ${res.status}`, res.status, b?.details);
  }
  return body as T;
}

export const getAdminToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setAdminToken = (t: string | null) => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY));

export const api = {
  opportunities: () => request<OpportunitiesResponse>('/opportunities'),
  login: (token: string) => request<{ ok: true }>('/admin/login', { method: 'POST', headers: { 'x-admin-token': token } }),
  getSettings: () => request<{ settings: Settings; defaults: Settings }>('/admin/settings', {}, true),
  updateSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings }>('/admin/settings', { method: 'PUT', body: JSON.stringify(patch) }, true),
  resetSettings: () => request<{ settings: Settings }>('/admin/settings/reset', { method: 'POST' }, true),
  getDemoScenario: () => request<{ scenario: unknown }>('/admin/demo-scenario', {}, true),
  putDemoScenario: (scenario: unknown) =>
    request<{ scenario: unknown }>('/admin/demo-scenario', { method: 'PUT', body: JSON.stringify(scenario) }, true),
  resetDemoScenario: () => request<{ scenario: unknown }>('/admin/demo-scenario/reset', { method: 'POST' }, true),
  reseedDemo: () => request<{ ok: true }>('/admin/demo/reseed', { method: 'POST' }, true),
  scanNow: () => request<unknown>('/admin/scan', { method: 'POST' }, true),
  exportConfig: () => request<unknown>('/admin/export', {}, true),
  importConfig: (data: unknown) => request<unknown>('/admin/import', { method: 'POST', body: JSON.stringify(data) }, true),
};
