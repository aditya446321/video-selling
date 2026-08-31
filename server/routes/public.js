import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { db, getSettings } from '../db.js';

export const publicRouter = express.Router();

function parseFeatures(row) {
  try { return JSON.parse(row.features || '[]'); } catch { return []; }
}

function activeOffersRaw() {
  const now = new Date().toISOString();
  return db.prepare(`SELECT * FROM offers WHERE active = 1
    AND (start_at IS NULL OR start_at = '' OR start_at <= ?)
    AND (end_at IS NULL OR end_at = '' OR end_at >= ?)`).all(now, now);
}

function offerFor(productType, productId, offers) {
  return offers.find(o => o.product_type === productType && o.product_id === productId) || null;
}

publicRouter.get('/packages', (req, res) => {
  const offers = activeOffersRaw();
  const rows = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY display_order, id').all();
  const out = rows.map(p => {
    const offer = offerFor('package', p.id, offers);
    const price = offer ? offer.sale_price : p.price;
    const original = offer ? offer.original_price : (p.original_price || p.price);
    const discount = original > price ? Math.round(((original - price) / original) * 100) : 0;
    return {
      id: p.id, name: p.name, slug: p.slug, description: p.description,
      price, original_price: original, discount_percentage: discount,
      badge: p.badge, features: parseFeatures(p), category: p.category,
      offer: offer ? { id: offer.id, title: offer.title } : null
    };
  });
  res.json(out);
});

publicRouter.get('/groups', (req, res) => {
  const offers = activeOffersRaw();
  const rows = db.prepare('SELECT * FROM groups_catalog WHERE active = 1 ORDER BY display_order, id').all();
  const out = rows.map(g => {
    const offer = offerFor('group', g.id, offers);
    const price = offer ? offer.sale_price : g.price;
    const original = offer ? offer.original_price : (g.original_price || g.price);
    const discount = original > price ? Math.round(((original - price) / original) * 100) : 0;
    return {
      id: g.id, name: g.name, description: g.description, category: g.category,
      price, original_price: original, discount_percentage: discount,
      link: g.link, badge: g.badge
    };
  });
  res.json(out);
});

publicRouter.get('/offers', (req, res) => {
  const offers = activeOffersRaw();
  const packages = new Map(db.prepare('SELECT id, name FROM packages').all().map(p => [p.id, p.name]));
  const groups = new Map(db.prepare('SELECT id, name FROM groups_catalog').all().map(g => [g.id, g.name]));
  const out = offers.map(o => ({
    id: o.id, title: o.title, description: o.description,
    product_type: o.product_type, product_id: o.product_id,
    product_name: o.product_type === 'package' ? packages.get(o.product_id) : groups.get(o.product_id),
    original_price: o.original_price, sale_price: o.sale_price,
    discount_percentage: Math.round(((o.original_price - o.sale_price) / o.original_price) * 100)
  })).filter(o => o.product_name);
  res.json(out);
});

publicRouter.get('/faq', (req, res) => {
  const rows = db.prepare('SELECT id, question, answer FROM faqs WHERE active = 1 ORDER BY display_order, id').all();
  res.json(rows);
});

publicRouter.get('/settings', (req, res) => {
  const s = getSettings();
  res.json({
    store_name: s.store_name, website_title: s.website_title,
    hero_title: s.hero_title, hero_subtitle: s.hero_subtitle, hero_supporting: s.hero_supporting,
    announcement: s.announcement, upi_id: s.upi_id,
    telegram_1: s.telegram_1, telegram_2: s.telegram_2, email: s.email, phone: s.phone,
    support_hours: s.support_hours, refund_summary: s.refund_summary,
    delivery_summary: s.delivery_summary, footer_text: s.footer_text
  });
});

publicRouter.get('/qr', async (req, res) => {
  try {
    const upi = String(req.query.upi || '');
    const name = String(req.query.name || 'Video Selling');
    const amount = Number(req.query.amount || 0);
    if (!upi || !amount || amount <= 0) return res.status(400).send('UPI and amount are required.');
    const uri = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR`;
    const png = await QRCode.toBuffer(uri, { type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M' });
    res.type('png').set('Cache-Control', 'no-store').send(png);
  } catch {
    res.status(500).send('Unable to generate QR.');
  }
});

publicRouter.post('/orders', (req, res) => {
  const { product_type, product_id, customer_name, customer_contact, payment_reference } = req.body || {};
  if (!['package', 'group'].includes(product_type)) return res.status(400).json({ error: 'Invalid product type.' });
  if (!customer_name || !String(customer_name).trim()) return res.status(400).json({ error: 'Name is required.' });
  if (!customer_contact || !String(customer_contact).trim()) return res.status(400).json({ error: 'Contact is required.' });

  const offers = activeOffersRaw();
  let product, price;
  if (product_type === 'package') {
    product = db.prepare('SELECT * FROM packages WHERE id = ? AND active = 1').get(Number(product_id));
    if (!product) return res.status(404).json({ error: 'Package not found.' });
    const offer = offerFor('package', product.id, offers);
    price = offer ? offer.sale_price : product.price;
  } else {
    product = db.prepare('SELECT * FROM groups_catalog WHERE id = ? AND active = 1').get(Number(product_id));
    if (!product) return res.status(404).json({ error: 'Group not found.' });
    const offer = offerFor('group', product.id, offers);
    price = offer ? offer.sale_price : product.price;
  }

  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
  db.prepare(`INSERT INTO orders (order_id, customer_name, customer_contact, product_type, product_id, product_name, amount, payment_reference, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`)
    .run(orderId, String(customer_name).trim().slice(0, 120), String(customer_contact).trim().slice(0, 160),
      product_type, product.id, product.name, price, String(payment_reference || '').trim().slice(0, 120));

  res.status(201).json({ order_id: orderId, amount: price, status: 'pending' });
});
