import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/store.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS packages (
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
);

CREATE TABLE IF NOT EXISTS groups_catalog (
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
);

CREATE TABLE IF NOT EXISTS offers (
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
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
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
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_packages_active_order ON packages(active, display_order);
CREATE INDEX IF NOT EXISTS idx_groups_active_order ON groups_catalog(active, display_order);
CREATE INDEX IF NOT EXISTS idx_offers_active_dates ON offers(active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_faqs_active_order ON faqs(active, display_order);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
`);

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

const seedIfEmpty = db.transaction(() => {
  const settingsCount = db.prepare('SELECT COUNT(*) c FROM settings').get().c;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaultSettings)) insertSetting.run(key, value);
  }

  const packageCount = db.prepare('SELECT COUNT(*) c FROM packages').get().c;
  if (packageCount === 0) {
    const insertPackage = db.prepare(`INSERT INTO packages
      (name, slug, description, price, original_price, badge, features, category, display_order, active)
      VALUES (@name, @slug, @description, @price, @original_price, @badge, @features, @category, @display_order, 1)`);
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
      insertPackage.run({ name, slug, description, price, original_price, badge, features: JSON.stringify(features), category: '', display_order });
    }
  }

  const faqCount = db.prepare('SELECT COUNT(*) c FROM faqs').get().c;
  if (faqCount === 0) {
    const insertFaq = db.prepare(`INSERT INTO faqs (question, answer, display_order, active) VALUES (?, ?, ?, 1)`);
    const seedFaqs = [
      ['How do I pay?', 'Select a package and use the generated UPI QR or the UPI app button.'],
      ['Does the QR amount update?', 'Yes. The QR is generated from the current live package price and any active offer.'],
      ['Is the payment automatically verified?', 'The current flow records your order and reference for admin review. Automatic bank verification requires a payment provider and webhook integration.'],
      ['Can I request a refund?', 'Review the Refund Policy before purchase. Digital purchases are generally final after successful delivery, subject to applicable law.']
    ];
    seedFaqs.forEach(([question, answer], i) => insertFaq.run(question, answer, i + 1));
  }
});

seedIfEmpty();

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSettings(patch) {
  const upsert = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`);
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) upsert.run(key, String(value ?? ''));
  });
  tx(Object.entries(patch));
  return getSettings();
}
