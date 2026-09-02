import express from 'express';
import { all, get, run, getSettings, setSettings } from '../db.js';
import {
  requireAuth, setSessionCookie, clearSessionCookie, isAuthenticated,
  checkPassword, rateLimitLogin, recordLoginFailure, recordLoginSuccess
} from '../auth.js';

export const adminRouter = express.Router();

function nowIso() { return new Date().toISOString(); }
function bool(v) { return !!(Number(v) || v === true); }

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

// wrap async handlers so thrown errors reach the error middleware
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---- dashboard ----
adminRouter.get('/dashboard', h(async (req, res) => {
  const packages = (await get('SELECT COUNT(*) c FROM packages WHERE active = 1')).c;
  const groups = (await get('SELECT COUNT(*) c FROM groups_catalog WHERE active = 1')).c;
  const offers = (await get('SELECT COUNT(*) c FROM offers WHERE active = 1')).c;
  const totalOrders = (await get('SELECT COUNT(*) c FROM orders')).c;
  const pendingOrders = (await get("SELECT COUNT(*) c FROM orders WHERE status = 'pending'")).c;
  const approvedOrders = (await get("SELECT COUNT(*) c FROM orders WHERE status = 'approved'")).c;
  const revenue = (await get("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE status = 'approved'")).s;
  res.json({
    packages: Number(packages), groups: Number(groups), offers: Number(offers),
    totalOrders: Number(totalOrders), pendingOrders: Number(pendingOrders),
    approvedOrders: Number(approvedOrders), revenue: Number(revenue)
  });
}));

// ---- packages ----
adminRouter.get('/packages', h(async (req, res) => {
  const rows = await all('SELECT * FROM packages ORDER BY display_order, id');
  res.json(rows.map(p => ({ ...p, id: Number(p.id), features: JSON.parse(p.features || '[]'), active: bool(p.active) })));
}));

adminRouter.post('/packages', h(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !Number(b.price)) return res.status(400).json({ error: 'Name and price are required.' });
  const result = await run(
    `INSERT INTO packages (name, slug, description, price, original_price, badge, features, category, display_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [String(b.name).slice(0, 120), String(b.slug || '').slice(0, 120), String(b.description || ''),
      Math.round(Number(b.price)), b.original_price ? Math.round(Number(b.original_price)) : null,
      String(b.badge || '').slice(0, 40), JSON.stringify(Array.isArray(b.features) ? b.features : []),
      String(b.category || '').slice(0, 60), Number(b.display_order) || 0, b.active === false ? 0 : 1]
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

adminRouter.put('/packages/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT id FROM packages WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Package not found.' });
  const b = req.body || {};
  if (!b.name || !Number(b.price)) return res.status(400).json({ error: 'Name and price are required.' });
  await run(
    `UPDATE packages SET name=?, slug=?, description=?, price=?, original_price=?, badge=?, features=?, category=?, display_order=?, active=?, updated_at=? WHERE id=?`,
    [String(b.name).slice(0, 120), String(b.slug || '').slice(0, 120), String(b.description || ''),
      Math.round(Number(b.price)), b.original_price ? Math.round(Number(b.original_price)) : null,
      String(b.badge || '').slice(0, 40), JSON.stringify(Array.isArray(b.features) ? b.features : []),
      String(b.category || '').slice(0, 60), Number(b.display_order) || 0, b.active === false ? 0 : 1, nowIso(), id]
  );
  res.json({ ok: true });
}));

adminRouter.patch('/packages/:id/toggle', h(async (req, res) => {
  const id = Number(req.params.id);
  const row = await get('SELECT active FROM packages WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Package not found.' });
  await run('UPDATE packages SET active = ?, updated_at = ? WHERE id = ?', [bool(row.active) ? 0 : 1, nowIso(), id]);
  res.json({ ok: true });
}));

adminRouter.delete('/packages/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const refCount = (await get("SELECT COUNT(*) c FROM orders WHERE product_type = 'package' AND product_id = ?", [id])).c;
  if (Number(refCount) > 0) {
    await run('UPDATE packages SET active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
    return res.json({ ok: true, softDeleted: true, reason: 'Package is referenced by past orders, so it was hidden instead of deleted.' });
  }
  const result = await run('DELETE FROM packages WHERE id = ?', [id]);
  if (Number(result.rowsAffected) === 0) return res.status(404).json({ error: 'Package not found.' });
  res.json({ ok: true, softDeleted: false });
}));

// ---- groups ----
adminRouter.get('/groups', h(async (req, res) => {
  const rows = await all('SELECT * FROM groups_catalog ORDER BY display_order, id');
  res.json(rows.map(g => ({ ...g, id: Number(g.id), active: bool(g.active) })));
}));

adminRouter.post('/groups', h(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name is required.' });
  const result = await run(
    `INSERT INTO groups_catalog (name, description, category, price, original_price, link, badge, display_order, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [String(b.name).slice(0, 120), String(b.description || ''), String(b.category || '').slice(0, 60),
      Math.round(Number(b.price) || 0), b.original_price ? Math.round(Number(b.original_price)) : null,
      String(b.link || ''), String(b.badge || '').slice(0, 40), Number(b.display_order) || 0, b.active === false ? 0 : 1]
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

adminRouter.put('/groups/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT id FROM groups_catalog WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Group not found.' });
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Name is required.' });
  await run(
    `UPDATE groups_catalog SET name=?, description=?, category=?, price=?, original_price=?, link=?, badge=?, display_order=?, active=?, updated_at=? WHERE id=?`,
    [String(b.name).slice(0, 120), String(b.description || ''), String(b.category || '').slice(0, 60),
      Math.round(Number(b.price) || 0), b.original_price ? Math.round(Number(b.original_price)) : null,
      String(b.link || ''), String(b.badge || '').slice(0, 40), Number(b.display_order) || 0, b.active === false ? 0 : 1, nowIso(), id]
  );
  res.json({ ok: true });
}));

adminRouter.patch('/groups/:id/toggle', h(async (req, res) => {
  const id = Number(req.params.id);
  const row = await get('SELECT active FROM groups_catalog WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'Group not found.' });
  await run('UPDATE groups_catalog SET active = ?, updated_at = ? WHERE id = ?', [bool(row.active) ? 0 : 1, nowIso(), id]);
  res.json({ ok: true });
}));

adminRouter.delete('/groups/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const refCount = (await get("SELECT COUNT(*) c FROM orders WHERE product_type = 'group' AND product_id = ?", [id])).c;
  if (Number(refCount) > 0) {
    await run('UPDATE groups_catalog SET active = 0, updated_at = ? WHERE id = ?', [nowIso(), id]);
    return res.json({ ok: true, softDeleted: true, reason: 'Group is referenced by past orders, so it was hidden instead of deleted.' });
  }
  const result = await run('DELETE FROM groups_catalog WHERE id = ?', [id]);
  if (Number(result.rowsAffected) === 0) return res.status(404).json({ error: 'Group not found.' });
  res.json({ ok: true, softDeleted: false });
}));

// ---- offers ----
adminRouter.get('/offers', h(async (req, res) => {
  const rows = await all('SELECT * FROM offers ORDER BY created_at DESC');
  res.json(rows.map(o => ({ ...o, id: Number(o.id), product_id: Number(o.product_id), active: bool(o.active) })));
}));

function validateOfferBody(b) {
  if (!b.title) return 'Title is required.';
  if (!['package', 'group'].includes(b.product_type)) return 'A valid product type is required.';
  if (!b.product_id) return 'A product must be selected.';
  const original = Number(b.original_price), sale = Number(b.sale_price);
  if (!original || !sale || sale <= 0 || original <= 0 || sale > original) return 'Enter valid offer pricing.';
  return null;
}

adminRouter.post('/offers', h(async (req, res) => {
  const b = req.body || {};
  const err = validateOfferBody(b);
  if (err) return res.status(400).json({ error: err });
  const result = await run(
    `INSERT INTO offers (title, description, product_type, product_id, original_price, sale_price, start_at, end_at, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [String(b.title).slice(0, 120), String(b.description || ''), b.product_type, Number(b.product_id),
      Math.round(Number(b.original_price)), Math.round(Number(b.sale_price)),
      b.start_at || null, b.end_at || null, b.active === false ? 0 : 1]
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

adminRouter.put('/offers/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT id FROM offers WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Offer not found.' });
  const b = req.body || {};
  const err = validateOfferBody(b);
  if (err) return res.status(400).json({ error: err });
  await run(
    `UPDATE offers SET title=?, description=?, product_type=?, product_id=?, original_price=?, sale_price=?, start_at=?, end_at=?, active=?, updated_at=? WHERE id=?`,
    [String(b.title).slice(0, 120), String(b.description || ''), b.product_type, Number(b.product_id),
      Math.round(Number(b.original_price)), Math.round(Number(b.sale_price)),
      b.start_at || null, b.end_at || null, b.active === false ? 0 : 1, nowIso(), id]
  );
  res.json({ ok: true });
}));

adminRouter.delete('/offers/:id', h(async (req, res) => {
  const result = await run('DELETE FROM offers WHERE id = ?', [Number(req.params.id)]);
  if (Number(result.rowsAffected) === 0) return res.status(404).json({ error: 'Offer not found.' });
  res.json({ ok: true });
}));

// ---- faqs ----
adminRouter.get('/faq', h(async (req, res) => {
  const rows = await all('SELECT * FROM faqs ORDER BY display_order, id');
  res.json(rows.map(f => ({ ...f, id: Number(f.id), active: bool(f.active) })));
}));

adminRouter.post('/faq', h(async (req, res) => {
  const b = req.body || {};
  if (!b.question) return res.status(400).json({ error: 'Question is required.' });
  const result = await run(
    'INSERT INTO faqs (question, answer, display_order, active) VALUES (?, ?, ?, ?)',
    [String(b.question).slice(0, 200), String(b.answer || ''), Number(b.display_order) || 0, b.active === false ? 0 : 1]
  );
  res.status(201).json({ id: Number(result.lastInsertRowid) });
}));

adminRouter.put('/faq/:id', h(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await get('SELECT id FROM faqs WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'FAQ not found.' });
  const b = req.body || {};
  if (!b.question) return res.status(400).json({ error: 'Question is required.' });
  await run(
    'UPDATE faqs SET question=?, answer=?, display_order=?, active=?, updated_at=? WHERE id=?',
    [String(b.question).slice(0, 200), String(b.answer || ''), Number(b.display_order) || 0, b.active === false ? 0 : 1, nowIso(), id]
  );
  res.json({ ok: true });
}));

adminRouter.delete('/faq/:id', h(async (req, res) => {
  const result = await run('DELETE FROM faqs WHERE id = ?', [Number(req.params.id)]);
  if (Number(result.rowsAffected) === 0) return res.status(404).json({ error: 'FAQ not found.' });
  res.json({ ok: true });
}));

// ---- orders ----
adminRouter.get('/orders', h(async (req, res) => {
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
  const rows = await all(sql, params);
  res.json(rows.map(o => ({ ...o, amount: Number(o.amount) })));
}));

adminRouter.patch('/orders/:id/status', h(async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'paid', 'approved', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const result = await run('UPDATE orders SET status = ?, updated_at = ? WHERE order_id = ?', [status, nowIso(), req.params.id]);
  if (Number(result.rowsAffected) === 0) return res.status(404).json({ error: 'Order not found.' });
  res.json({ ok: true });
}));

// ---- settings ----
adminRouter.get('/settings', h(async (req, res) => res.json(await getSettings())));

adminRouter.put('/settings', h(async (req, res) => {
  const allowed = ['store_name', 'website_title', 'hero_title', 'hero_subtitle', 'hero_supporting', 'announcement',
    'upi_id', 'telegram_1', 'telegram_2', 'email', 'phone', 'support_hours', 'refund_summary', 'delivery_summary', 'footer_text'];
  const patch = {};
  for (const key of allowed) if (key in (req.body || {})) patch[key] = req.body[key];
  res.json(await setSettings(patch));
}));

// ---- backup ----
adminRouter.get('/backup', h(async (req, res) => {
  const data = {
    exported_at: nowIso(),
    packages: (await all('SELECT * FROM packages')).map(p => ({ ...p, id: Number(p.id) })),
    groups_catalog: (await all('SELECT * FROM groups_catalog')).map(g => ({ ...g, id: Number(g.id) })),
    offers: (await all('SELECT * FROM offers')).map(o => ({ ...o, id: Number(o.id), product_id: Number(o.product_id) })),
    faqs: (await all('SELECT * FROM faqs')).map(f => ({ ...f, id: Number(f.id) })),
    orders: (await all('SELECT * FROM orders')).map(o => ({ ...o, amount: Number(o.amount) })),
    settings: await getSettings()
  };
  res.setHeader('Content-Disposition', 'attachment; filename="video-selling-backup.json"');
  res.json(data);
}));

adminRouter.post('/backup/import', h(async (req, res) => {
  const data = req.body || {};
  try {
    if (Array.isArray(data.packages)) {
      await run('DELETE FROM packages');
      for (const p of data.packages) {
        await run(
          `INSERT INTO packages (id, name, slug, description, price, original_price, badge, features, category, display_order, active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [p.id, p.name, p.slug, p.description, p.price, p.original_price, p.badge, p.features, p.category, p.display_order, p.active, p.created_at, p.updated_at]
        );
      }
    }
    if (Array.isArray(data.groups_catalog)) {
      await run('DELETE FROM groups_catalog');
      for (const g of data.groups_catalog) {
        await run(
          `INSERT INTO groups_catalog (id, name, description, category, price, original_price, link, badge, display_order, active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [g.id, g.name, g.description, g.category, g.price, g.original_price, g.link, g.badge, g.display_order, g.active, g.created_at, g.updated_at]
        );
      }
    }
    if (Array.isArray(data.offers)) {
      await run('DELETE FROM offers');
      for (const o of data.offers) {
        await run(
          `INSERT INTO offers (id, title, description, product_type, product_id, original_price, sale_price, start_at, end_at, active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [o.id, o.title, o.description, o.product_type, o.product_id, o.original_price, o.sale_price, o.start_at, o.end_at, o.active, o.created_at, o.updated_at]
        );
      }
    }
    if (Array.isArray(data.faqs)) {
      await run('DELETE FROM faqs');
      for (const f of data.faqs) {
        await run(
          `INSERT INTO faqs (id, question, answer, display_order, active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)`,
          [f.id, f.question, f.answer, f.display_order, f.active, f.created_at, f.updated_at]
        );
      }
    }
    if (data.settings && typeof data.settings === 'object') await setSettings(data.settings);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'Import failed: ' + err.message });
  }
}));
