import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// If TURSO_DATABASE_URL is set (production, connected via Vercel Marketplace),
// use the remote Turso database — it persists across serverless invocations.
// Otherwise fall back to a local SQLite file for local development.
const localDbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/store.db');
if (!process.env.TURSO_DATABASE_URL) {
  const dir = path.dirname(localDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const db = process.env.TURSO_DATABASE_URL
  ? createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${localDbPath}` });

async function run(sql, args = []) { return db.execute({ sql, args }); }
async function all(sql, args = []) { return (await db.execute({ sql, args })).rows; }
async function get(sql, args = []) { return (await db.execute({ sql, args })).rows[0] || null; }

const schemaStatements = [
`CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  original_price INTEGER,
  badge TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE TABLE IF NOT EXISTS groups_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  original_price INTEGER,
  link TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  product_type TEXT NOT NULL CHECK (product_type IN ('package','group')),
  product_id INTEGER NOT NULL,
  original_price INTEGER NOT NULL,
  sale_price INTEGER NOT NULL,
  start_at TEXT,
  end_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_contact TEXT NOT NULL,
  product_type TEXT NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','approved','rejected','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
`CREATE INDEX IF NOT EXISTS idx_packages_active_order ON packages(active, display_order)`,
`CREATE INDEX IF NOT EXISTS idx_groups_active_order ON groups_catalog(active, display_order)`,
`CREATE INDEX IF NOT EXISTS idx_offers_active_dates ON offers(active, start_at, end_at)`,
`CREATE INDEX IF NOT EXISTS idx_faqs_active_order ON faqs(active, display_order)`,
`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)`
];

const defaultSettings = {
  store_name: 'Video Selling',
  website_title: 'Video Selling — Digital Packages',
  hero_title: 'Choose your access.',
  hero_subtitle: 'Pay in seconds.',
  hero_supporting: 'Browse the available packages, review the details, and continue to UPI checkout.',
  announcement: '',
  upi_id: 'jaduuugarrr@okaxis',
  telegram_1: 'ZzzNnnVvvv',
  telegram_2: 'Ramerusaan',
  email: '',
  phone: '',
  support_hours: 'Support available for order assistance.',
  refund_summary: 'Digital purchases are generally final after successful delivery, subject to applicable law.',
  delivery_summary: 'Digital access details are provided after payment confirmation.',
  footer_text: ''
};

let readyPromise = null;

export function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

async function init() {
  for (const stmt of schemaStatements) await run(stmt);
  await seedIfEmpty();
}

async function seedIfEmpty() {
  const settingsCount = (await get('SELECT COUNT(*) c FROM settings')).c;
  if (Number(settingsCount) === 0) {
    for (const [key, value] of Object.entries(defaultSettings)) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  const packageCount = (await get('SELECT COUNT(*) c FROM packages')).c;
  if (Number(packageCount) === 0) {
    const seedPackages = [
      ['Prime Access', 'prime-access', 'Prime digital access.', 149, 199, 'POPULAR', ['Instant access', '24×7 support'], 1],
      ['Exclusive Access', 'exclusive-access', 'Exclusive digital access.', 249, 299, 'VALUE', ['Instant access', '24×7 support'], 2],
      ['VIP Access', 'vip-access', 'VIP digital access.', 299, 399, 'VIP', ['Premium access', '24×7 support'], 3],
      ['VIP Elite', 'vip-elite', 'Elite VIP access.', 349, 449, 'BEST VALUE', ['Premium access', 'Priority support'], 4],
      ['VVIP Access', 'vvip-access', 'VVIP digital access.', 399, 499, 'VVIP', ['Premium access', 'Priority support'], 5],
      ['VVIP Black', 'vvip-black', 'VVIP Black access.', 449, 599, 'BLACK', ['Premium access', 'Priority support'], 6],
      ['Ultra Elite', 'ultra-elite', 'Ultra Elite access.', 499, 699, 'ULTRA', ['Premium access', 'Priority support'], 7]
    ];
    for (const [name, slug, description, price, original_price, badge, features, display_order] of seedPackages) {
      await run(
        `INSERT INTO packages (name, slug, description, price, original_price, badge, features, category, display_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, 1)`,
        [name, slug, description, price, original_price, badge, JSON.stringify(features), display_order]
      );
    }
  }

  const faqCount = (await get('SELECT COUNT(*) c FROM faqs')).c;
  if (Number(faqCount) === 0) {
    const seedFaqs = [
      ['How do I pay?', 'Select a package and use the generated UPI QR or the UPI app button.'],
      ['Does the QR amount update?', 'Yes. The QR is generated from the current live package price and any active offer.'],
      ['Is the payment automatically verified?', 'The current flow records your order and reference for admin review. Automatic bank verification requires a payment provider and webhook integration.'],
      ['Can I request a refund?', 'Review the Refund Policy before purchase. Digital purchases are generally final after successful delivery, subject to applicable law.']
    ];
    for (let i = 0; i < seedFaqs.length; i++) {
      const [question, answer] = seedFaqs[i];
      await run('INSERT INTO faqs (question, answer, display_order, active) VALUES (?, ?, ?, 1)', [question, answer, i + 1]);
    }
  }
}

export { run, all, get };

export async function getSettings() {
  const rows = await all('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, String(value ?? '')]
    );
  }
  return getSettings();
}
