import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { createApiRouter } from './api/router.js';
import { SettingsStore } from './config/settingsStore.js';
import { DemoSource } from './demo/demoSource.js';
import { DemoStore } from './demo/demoStore.js';
import { DEFAULT_DEMO_SCENARIO } from './demo/scenario.js';
import { LiveSource } from './exchanges/liveSource.js';
import { Scanner } from './scanner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const dataDir = process.env.DATA_DIR ?? path.join(serverRoot, 'data');
const webDist = path.resolve(serverRoot, '../web/dist');

const PORT = Number(process.env.PORT ?? 8787);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin';
if (!process.env.ADMIN_TOKEN) {
  console.warn('[arbiscan] ADMIN_TOKEN не задано — використовується "admin". Змініть його для реального використання.');
}

const store = new SettingsStore(path.join(dataDir, 'settings.json'));
const demoSource = new DemoSource(DEFAULT_DEMO_SCENARIO);
const demo = new DemoStore(path.join(dataDir, 'demo-scenario.json'), demoSource);
const scanner = new Scanner(store, { demo: demoSource, live: new LiveSource() });

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use('/api', createApiRouter({ store, scanner, demo, adminToken: ADMIN_TOKEN }));

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[arbiscan] API: http://localhost:${PORT}/api  (режим даних: ${store.get().dataMode})`);
  scanner.start();
});
