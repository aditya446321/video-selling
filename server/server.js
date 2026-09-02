import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ready } from './db.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Minimal .env loader — no extra dependency. Only fills in variables that
// aren't already set, so real host-provided environment variables (Vercel,
// Render, etc.) always take precedence over a local .env file.
function loadEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const port = Number(process.env.PORT || 3000);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Ensure the database schema/seed is ready before any request is handled.
// On serverless platforms this resolves once per cold start and is cached
// for subsequent requests on the same warm instance.
app.use(async (req, res, next) => {
  try { await ready(); next(); } catch (err) { next(err); }
});

app.use('/api/admin', adminRouter);
app.use('/api', publicRouter);

app.use(express.static(rootDir, { extensions: ['html'] }));

app.use((req, res) => {
  res.status(404).sendFile(path.join(rootDir, '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// Only bind a listening port for a persistent Node process (local dev, npm start,
// or any traditional Node host). Serverless platforms import `app` directly instead.
if (!process.env.VERCEL && !process.env.NETLIFY) {
  app.listen(port, () => console.log(`Video Selling running on http://localhost:${port}`));
}

export default app;
