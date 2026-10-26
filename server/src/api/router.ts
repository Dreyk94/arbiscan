import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { DEFAULT_SETTINGS, partialSettingsSchema, settingsSchema } from '../config/settings.js';
import type { SettingsStore } from '../config/settingsStore.js';
import type { DemoStore } from '../demo/demoStore.js';
import { demoScenarioSchema } from '../demo/scenario.js';
import { EXCHANGE_LABELS, EXCHANGES } from '../domain/types.js';
import type { Scanner } from '../scanner.js';

export function createApiRouter(deps: { store: SettingsStore; scanner: Scanner; demo: DemoStore; adminToken: string }) {
  const { store, scanner, demo, adminToken } = deps;
  const r = express.Router();

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = String(req.header('x-admin-token') ?? '');
    const a = Buffer.from(token);
    const b = Buffer.from(adminToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Невірний токен адміністратора' });
    }
    next();
  };

  r.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

  r.get('/opportunities', (_req, res) => {
    const s = store.get();
    const { opportunities, meta } = scanner.getSnapshot();
    res.json({
      opportunities,
      meta,
      config: {
        tradeSizeUsd: s.tradeSizeUsd,
        depthWindowPct: s.depthWindowPct,
        scanIntervalSec: s.scanIntervalSec,
        maxPlausibleSpreadPct: s.maxPlausibleSpreadPct,
        notifications: s.notifications,
        fees: Object.fromEntries(EXCHANGES.map((ex) => [ex, s.exchanges[ex].takerFeePct])),
        exchanges: EXCHANGES.map((ex) => ({ id: ex, label: EXCHANGE_LABELS[ex], enabled: s.exchanges[ex].enabled })),
      },
    });
  });

  r.post('/admin/login', requireAdmin, (_req, res) => res.json({ ok: true }));

  r.get('/admin/settings', requireAdmin, (_req, res) => res.json({ settings: store.get(), defaults: DEFAULT_SETTINGS }));

  r.put('/admin/settings', requireAdmin, (req, res) => {
    const parsed = partialSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некоректні налаштування', details: parsed.error.issues });
    try {
      res.json({ settings: store.update(parsed.data) });
    } catch (e) {
      res.status(400).json({ error: 'Некоректні налаштування', details: (e as z.ZodError).issues ?? String(e) });
    }
  });

  r.post('/admin/settings/reset', requireAdmin, (_req, res) => res.json({ settings: store.reset() }));

  r.get('/admin/demo-scenario', requireAdmin, (_req, res) => res.json({ scenario: demo.get() }));

  r.put('/admin/demo-scenario', requireAdmin, (req, res) => {
    const parsed = demoScenarioSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некоректний демо-сценарій', details: parsed.error.issues });
    demo.set(parsed.data);
    scanner.resetState();
    void scanner.scanNow();
    res.json({ scenario: demo.get() });
  });

  r.post('/admin/demo-scenario/reset', requireAdmin, (_req, res) => {
    demo.reset();
    scanner.resetState();
    void scanner.scanNow();
    res.json({ scenario: demo.get() });
  });

  r.post('/admin/demo/reseed', requireAdmin, (_req, res) => {
    demo.reseed();
    void scanner.scanNow();
    res.json({ ok: true });
  });

  r.post('/admin/scan', requireAdmin, async (_req, res) => {
    await scanner.scanNow();
    res.json({ meta: scanner.getSnapshot().meta });
  });

  r.get('/admin/export', requireAdmin, (_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="arbiscan-config-${Date.now()}.json"`);
    res.json({ app: 'arbiscan', version: 1, exportedAt: new Date().toISOString(), settings: store.get(), demoScenario: demo.get() });
  });

  const importSchema = z.object({
    app: z.literal('arbiscan').optional(),
    settings: settingsSchema.optional(),
    demoScenario: demoScenarioSchema.optional(),
  });

  r.post('/admin/import', requireAdmin, (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некоректний файл імпорту', details: parsed.error.issues });
    if (!parsed.data.settings && !parsed.data.demoScenario) {
      return res.status(400).json({ error: 'Файл не містить ні settings, ні demoScenario' });
    }
    if (parsed.data.demoScenario) demo.set(parsed.data.demoScenario);
    if (parsed.data.settings) store.replace(parsed.data.settings);
    scanner.resetState();
    void scanner.scanNow();
    res.json({ settings: store.get(), demoScenario: demo.get() });
  });

  return r;
}
