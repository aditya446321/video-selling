import express from 'express';
import { db, getSettings, setSettings } from '../db.js';
import {
  requireAuth, setSessionCookie, clearSessionCookie, isAuthenticated,
  checkPassword, rateLimitLogin, recordLoginFailure, recordLoginSuccess
} from '../auth.js';

export const adminRouter = express.Router();

// ---- auth ----
adminRouter.post('/login', rateLimitLogin, async (req, res) => {
  try {
    const ok = await checkPassword(req.body?.password);
    if (!ok) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Invalid password.' });
    }
    recordLoginSuccess(req);
    setSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Login is not configured.' });
  }
});

adminRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

adminRouter.get('/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// everything below requires a valid session
adminRouter.use(requireAuth);

function nowIso() { return new Date().toISOString(); }

// ---- dashboard ----
adminRouter.get('/dashboard', (req, res) => {
  const packages = db.prepare('SELECT COUNT(*) c FROM packages WHERE active = 1').get().c;
  const groups = db.prepare('SELECT COUNT(*) c FROM groups_catalog WHERE active = 1').get().c;
  const offers = db.prepare('SELECT COUNT(*) c FROM offers WHERE active = 1').get().c;
  const totalOrders = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").get().c;
  const approvedOrders = db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'approved'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status = 'approved'").get().s;
  res.json({ packages, groups, offers, totalOrders, pendingOrders, approvedOrders, revenue });
});

// ---- packages ----
adminRouter.get('/packages', (req, res) => {
  res.json(db.prepare('SELECT * FROM packages ORDER BY display_order, id').all()
    .map(p => ({ ...p, features: JSON.parse(p.features || '[]'), active: !!p.active })));
});

adminRouter.post('/packages', (req, res) => {
  const b = req.body || {};
  if (!b.name || !Number(b.price)) return res.status(400).json({ error: 'Name and price are required.' });
  const info = db.prepare(`INSERT INTO packages (name, slug, description, price, original_price, badge, features, category, display_order, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    String(b.name).slice(0, 120), String(b.slug || '').slice(0, 120), String(b.description || ''),
    Math.round(Number(b.price)), b.original_price ? Math.round(Number(b.original_price)) : null,
    String(b.badge || '').slice(0, 40), JSON.stringify(Array.isArray(b.features) ? b.features : []),
    String(b.category || '').slice(0, 60), Number(b.display_order) || 0, b.active === false ? 0 : 1
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.put('/packages/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM packages WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Package not found.' });
  const b = req.body || {};
  if (!b.name || !Number(b.price)) return res.status(400).json({ error: 'Name and price are required.' });
  db.prepare(`UPDATE packages SET name=?, slug=?, description=?, price=?, original_price=?, badge=?, features=?, category=?, display_order=?, active=?, updated_at=? WHERE id=?`)
    .run(String(b.name).slice(0, 120), String(b.slug || '').slice(0, 120), String(b.description || ''),
      Math.round(Number(b.price)), b.original_price ? Math.round(Number(b.original_price)) : null,
      String(b.badge || '').slice(0, 40), JSON.stringify(Array.isArray(b.features) ? b.features : []),
      String(b.category || '').slice(0, 60), Number(b.display_order) || 0, b.active === false ? 0 : 1, nowIso(), id);
  res.json({ ok: true });
});

adminRouter.patch('/packages/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT active FROM packages WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Package not found.' });
  db.prepare('UPDATE packages SET active = ?, updated_at = ? WHERE id = ?').run(row.active ? 0 : 1, nowIso(), id);
  res.json({ ok: true });
});

adminRouter.delete('/packages/:id', (req, res) => {
  const id = Number(req.params.id);
  const refCount = db.prepare("SELECT COUNT(*) c FROM orders WHERE product_type = 'package' AND product_id = ?").get(id).c;
  if (refCount > 0) {
    db.prepare('UPDATE packages SET active = 0, updated_at = ? WHERE id = ?').run(nowIso(), id);
    return res.json({ ok: true, softDeleted: true, reason: 'Package is referenced by past orders, so it was hidden instead of deleted.' });
  }
  const result = db.prepare('DELETE FROM packages WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Package not found.' });
  res.json({ ok: true, softDeleted: false });
});

// ---- groups ----
adminRouter.get('/groups', (req, res) => {
  res.json(db.prepare('SELECT * FROM groups_catalog ORDER BY display_order, id').all().map(g => ({ ...g, active: !!g.active })));
});

adminRouter.post('/groups', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name is required.' });
  const info = db.prepare(`INSERT INTO groups_catalog (name, description, category, price, original_price, link, badge, display_order, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    String(b.name).slice(0, 120), String(b.description || ''), String(b.category || '').slice(0, 60),
    Math.round(Number(b.price) || 0), b.original_price ? Math.round(Number(b.original_price)) : null,
    String(b.link || ''), String(b.badge || '').slice(0, 40), Number(b.display_order) || 0, b.active === false ? 0 : 1
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.put('/groups/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM groups_catalog WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Group not found.' });
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name is required.' });
  db.prepare(`UPDATE groups_catalog SET name=?, description=?, category=?, price=?, original_price=?, link=?, badge=?, display_order=?, active=?, updated_at=? WHERE id=?`)
    .run(String(b.name).slice(0, 120), String(b.description || ''), String(b.category || '').slice(0, 60),
      Math.round(Number(b.price) || 0), b.original_price ? Math.round(Number(b.original_price)) : null,
      String(b.link || ''), String(b.badge || '').slice(0, 40), Number(b.display_order) || 0, b.active === false ? 0 : 1, nowIso(), id);
  res.json({ ok: true });
});

adminRouter.patch('/groups/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT active FROM groups_catalog WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Group not found.' });
  db.prepare('UPDATE groups_catalog SET active = ?, updated_at = ? WHERE id = ?').run(row.active ? 0 : 1, nowIso(), id);
  res.json({ ok: true });
});

adminRouter.delete('/groups/:id', (req, res) => {
  const id = Number(req.params.id);
  const refCount = db.prepare("SELECT COUNT(*) c FROM orders WHERE product_type = 'group' AND product_id = ?").get(id).c;
  if (refCount > 0) {
    db.prepare('UPDATE groups_catalog SET active = 0, updated_at = ? WHERE id = ?').run(nowIso(), id);
    return res.json({ ok: true, softDeleted: true, reason: 'Group is referenced by past orders, so it was hidden instead of deleted.' });
  }
  const result = db.prepare('DELETE FROM groups_catalog WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'Group not found.' });
  res.json({ ok: true, softDeleted: false });
});

// ---- offers ----
adminRouter.get('/offers', (req, res) => {
  res.json(db.prepare('SELECT * FROM offers ORDER BY created_at DESC').all().map(o => ({ ...o, active: !!o.active })));
});

function validateOfferBody(b) {
  if (!b.title) return 'Title is required.';
  if (!['package', 'group'].includes(b.product_type)) return 'A valid product type is required.';
  if (!b.product_id) return 'A product must be selected.';
  const original = Number(b.original_price), sale = Number(b.sale_price);
  if (!original || !sale || sale <= 0 || original <= 0 || sale > original) return 'Enter valid offer pricing.';
  return null;
}

adminRouter.post('/offers', (req, res) => {
  const b = req.body || {};
  const err = validateOfferBody(b);
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare(`INSERT INTO offers (title, description, product_type, product_id, original_price, sale_price, start_at, end_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    String(b.title).slice(0, 120), String(b.description || ''), b.product_type, Number(b.product_id),
    Math.round(Number(b.original_price)), Math.round(Number(b.sale_price)),
    b.start_at || null, b.end_at || null, b.active === false ? 0 : 1
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.put('/offers/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM offers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Offer not found.' });
  const b = req.body || {};
  const err = validateOfferBody(b);
  if (err) return res.status(400).json({ error: err });
  db.prepare(`UPDATE offers SET title=?, description=?, product_type=?, product_id=?, original_price=?, sale_price=?, start_at=?, end_at=?, active=?, updated_at=? WHERE id=?`)
    .run(String(b.title).slice(0, 120), String(b.description || ''), b.product_type, Number(b.product_id),
      Math.round(Number(b.original_price)), Math.round(Number(b.sale_price)),
      b.start_at || null, b.end_at || null, b.active === false ? 0 : 1, nowIso(), id);
  res.json({ ok: true });
});

adminRouter.delete('/offers/:id', (req, res) => {
  const result = db.prepare('DELETE FROM offers WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Offer not found.' });
  res.json({ ok: true });
});

// ---- faqs ----
adminRouter.get('/faq', (req, res) => {
  res.json(db.prepare('SELECT * FROM faqs ORDER BY display_order, id').all().map(f => ({ ...f, active: !!f.active })));
});

adminRouter.post('/faq', (req, res) => {
  const b = req.body || {};
  if (!b.question) return res.status(400).json({ error: 'Question is required.' });
  const info = db.prepare('INSERT INTO faqs (question, answer, display_order, active) VALUES (?, ?, ?, ?)')
    .run(String(b.question).slice(0, 200), String(b.answer || ''), Number(b.display_order) || 0, b.active === false ? 0 : 1);
  res.status(201).json({ id: info.lastInsertRowid });
});

adminRouter.put('/faq/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM faqs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'FAQ not found.' });
  const b = req.body || {};
  if (!b.question) return res.status(400).json({ error: 'Question is required.' });
  db.prepare('UPDATE faqs SET question=?, answer=?, display_order=?, active=?, updated_at=? WHERE id=?')
    .run(String(b.question).slice(0, 200), String(b.answer || ''), Number(b.display_order) || 0, b.active === false ? 0 : 1, nowIso(), id);
  res.json({ ok: true });
});

adminRouter.delete('/faq/:id', (req, res) => {
  const result = db.prepare('DELETE FROM faqs WHERE id = ?').run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'FAQ not found.' });
  res.json({ ok: true });
});

// ---- orders ----
adminRouter.get('/orders', (req, res) => {
  const { status, search, sort } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (search) {
    sql += ' AND (order_id LIKE ? OR customer_name LIKE ? OR customer_contact LIKE ? OR product_name LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  sql += sort === 'oldest' ? ' ORDER BY created_at ASC' : ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

adminRouter.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'paid', 'approved', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const result = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE order_id = ?').run(status, nowIso(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Order not found.' });
  res.json({ ok: true });
});

// ---- settings ----
adminRouter.get('/settings', (req, res) => res.json(getSettings()));

adminRouter.put('/settings', (req, res) => {
  const allowed = ['store_name', 'website_title', 'hero_title', 'hero_subtitle', 'hero_supporting', 'announcement',
    'upi_id', 'telegram_1', 'telegram_2', 'email', 'phone', 'support_hours', 'refund_summary', 'delivery_summary', 'footer_text'];
  const patch = {};
  for (const key of allowed) if (key in (req.body || {})) patch[key] = req.body[key];
  res.json(setSettings(patch));
});

// ---- backup ----
adminRouter.get('/backup', (req, res) => {
  const data = {
    exported_at: nowIso(),
    packages: db.prepare('SELECT * FROM packages').all(),
    groups_catalog: db.prepare('SELECT * FROM groups_catalog').all(),
    offers: db.prepare('SELECT * FROM offers').all(),
    faqs: db.prepare('SELECT * FROM faqs').all(),
    orders: db.prepare('SELECT * FROM orders').all(),
    settings: getSettings()
  };
  res.setHeader('Content-Disposition', 'attachment; filename="video-selling-backup.json"');
  res.json(data);
});

adminRouter.post('/backup/import', (req, res) => {
  const data = req.body || {};
  const tx = db.transaction(() => {
    if (Array.isArray(data.packages)) {
      db.prepare('DELETE FROM packages').run();
      const ins = db.prepare(`INSERT INTO packages (id, name, slug, description, price, original_price, badge, features, category, display_order, active, created_at, updated_at)
        VALUES (@id,@name,@slug,@description,@price,@original_price,@badge,@features,@category,@display_order,@active,@created_at,@updated_at)`);
      for (const p of data.packages) ins.run(p);
    }
    if (Array.isArray(data.groups_catalog)) {
      db.prepare('DELETE FROM groups_catalog').run();
      const ins = db.prepare(`INSERT INTO groups_catalog (id, name, description, category, price, original_price, link, badge, display_order, active, created_at, updated_at)
        VALUES (@id,@name,@description,@category,@price,@original_price,@link,@badge,@display_order,@active,@created_at,@updated_at)`);
      for (const g of data.groups_catalog) ins.run(g);
    }
    if (Array.isArray(data.offers)) {
      db.prepare('DELETE FROM offers').run();
      const ins = db.prepare(`INSERT INTO offers (id, title, description, product_type, product_id, original_price, sale_price, start_at, end_at, active, created_at, updated_at)
        VALUES (@id,@title,@description,@product_type,@product_id,@original_price,@sale_price,@start_at,@end_at,@active,@created_at,@updated_at)`);
      for (const o of data.offers) ins.run(o);
    }
    if (Array.isArray(data.faqs)) {
      db.prepare('DELETE FROM faqs').run();
      const ins = db.prepare(`INSERT INTO faqs (id, question, answer, display_order, active, created_at, updated_at)
        VALUES (@id,@question,@answer,@display_order,@active,@created_at,@updated_at)`);
      for (const f of data.faqs) ins.run(f);
    }
    if (data.settings && typeof data.settings === 'object') setSettings(data.settings);
  });
  try {
    tx();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Import failed: ' + err.message });
  }
});
