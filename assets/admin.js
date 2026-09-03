const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const ICONS = {
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M15.5 14.3c2.7.4 4.5 2.4 4.5 5.7"/>',
  tag: '<path d="M20 12.5 12.5 20 4 11.5V4h7.5Z"/><circle cx="8" cy="8" r="1.4"/>',
  receipt: '<path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.6Z"/><path d="M9 8h6M9 12h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.5 2.5 0 1 1 3.6 2.3c-.9.5-1.1 1-1.1 2M12 17h.01"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M19 18h1"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9 5.5 5.5 0 0 1 10.7-1.6A4 4 0 0 1 17 18Z"/>',
  external: '<path d="M14 4h6v6M10 14 20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
  logout: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l4-5-4-5M20 12H9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  wallet: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h13A1.5 1.5 0 0 1 19 7.5v9A1.5 1.5 0 0 1 17.5 18h-13A1.5 1.5 0 0 1 3 16.5Z"/><path d="M15.5 12h2M15 12a1.2 1.2 0 1 0 0-.01"/>',
  inbox: '<path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 5h13l2 7v6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-6Z"/>'
};
function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; }
function emptyState(iconName, title, sub) {
  return `<div class="empty-state">${icon(iconName, 26)}<b>${esc(title)}</b><p class="muted">${esc(sub)}</p></div>`;
}

// hydrate sidebar icons (kept out of the HTML to keep markup light)
document.querySelectorAll('[data-icon]').forEach(el => {
  el.insertAdjacentHTML('afterbegin', `<span class="nav-icon">${icon(el.dataset.icon, 17)}</span>`);
});

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin'
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (res.status === 401) { showLogin(); throw new Error('Session expired. Please sign in again.'); }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed.');
  return data;
}

function showLogin() {
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  showTab('dashboard');
}

// ---- tabs ----
function showTab(tab) {
  document.querySelectorAll('[data-page]').forEach(x => x.classList.toggle('hidden', x.dataset.page !== tab));
  document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  const loaders = { dashboard: loadStats, packages: loadPackages, groups: loadGroups, offers: loadOffers, orders: loadOrders, faq: loadFaq, settings: loadSettings };
  loaders[tab]?.();
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---- editor dialog ----
function openEditor(title, fields, submit) {
  $('#editTitle').textContent = title;
  $('#fields').innerHTML = fields.map(f => {
    if (f.type === 'hidden') return `<input type="hidden" name="${esc(f.name)}" value="${esc(f.value)}">`;
    if (f.type === 'textarea') return `<label class="${f.wide ? 'wide' : ''}">${esc(f.label)}<textarea name="${esc(f.name)}">${esc(f.value)}</textarea></label>`;
    if (f.type === 'select') return `<label>${esc(f.label)}<select name="${esc(f.name)}">${f.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    if (f.type === 'checkbox') return `<label>${esc(f.label)}<input name="${esc(f.name)}" type="checkbox" ${f.value ? 'checked' : ''}></label>`;
    return `<label class="${f.wide ? 'wide' : ''}">${esc(f.label)}<input name="${esc(f.name)}" type="${f.type || 'text'}" value="${esc(f.value)}" ${f.required ? 'required' : ''}></label>`;
  }).join('');
  $('#editMsg').className = 'message hidden';
  $('#editor').showModal();
  $('#editForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await submit(fd); $('#editor').close(); }
    catch (err) { $('#editMsg').className = 'message error'; $('#editMsg').textContent = err.message; }
  };
}

// ---- dashboard ----
async function loadStats() {
  const s = await api('/api/admin/dashboard');
  const cards = [
    ['box', 'Packages', s.packages],
    ['users', 'Groups', s.groups],
    ['tag', 'Active Offers', s.offers],
    ['receipt', 'Orders', s.totalOrders],
    ['clock', 'Pending Orders', s.pendingOrders],
    ['check', 'Approved Orders', s.approvedOrders],
    ['wallet', 'Revenue (Approved)', money(s.revenue)]
  ];
  $('#stats').innerHTML = cards.map(([ic, label, value]) =>
    `<div class="stat"><div class="stat-icon">${icon(ic, 17)}</div><span class="muted">${label}</span><strong>${value}</strong></div>`
  ).join('');
}

// ---- packages ----
async function loadPackages() {
  const list = await api('/api/admin/packages');
  $('#packageAdmin').innerHTML = list.length ? list.map(p => `<div class="admin-row"><span class="status-dot ${p.active ? 'on' : 'off'}"></span><div class="row-main"><b>${esc(p.name)}</b><p class="muted">${esc(p.description)}</p></div><div class="row-price">${money(p.price)}${p.original_price > p.price ? `<span class="strike">${money(p.original_price)}</span>` : ''}</div><div class="actions"><button class="small-btn" onclick='editPackage(${JSON.stringify(p)})'>${icon('sliders', 14)}Edit</button><button class="small-btn" onclick="togglePackage(${p.id})">${p.active ? 'Hide' : 'Show'}</button><button class="small-btn danger" onclick="deletePackage(${p.id})">Delete</button></div></div>`).join('') : emptyState('box', 'No packages yet', 'Add your first package to start selling access.');
}
function packageFields(p = {}) {
  return [
    { name: 'id', value: p.id || '', type: 'hidden' },
    { name: 'name', label: 'Package Name', value: p.name || '', required: true },
    { name: 'price', label: 'Current Price', value: p.price ?? '', type: 'number', required: true },
    { name: 'original_price', label: 'Original Price', value: p.original_price || '', type: 'number' },
    { name: 'description', label: 'Description', value: p.description || '', type: 'textarea', wide: true },
    { name: 'badge', label: 'Badge', value: p.badge || '' },
    { name: 'category', label: 'Category', value: p.category || '' },
    { name: 'features', label: 'Features (one per line)', value: (p.features || []).join('\n'), type: 'textarea', wide: true },
    { name: 'display_order', label: 'Sort Order', value: p.display_order ?? 0, type: 'number' }
  ];
}
function packageBody(fd) {
  return {
    name: fd.get('name'), price: +fd.get('price'), original_price: +fd.get('original_price') || null,
    description: fd.get('description'), badge: fd.get('badge'), category: fd.get('category'),
    features: String(fd.get('features') || '').split('\n').map(x => x.trim()).filter(Boolean),
    display_order: +fd.get('display_order') || 0
  };
}
window.editPackage = (p) => openEditor('Edit Package', packageFields(p), async fd => {
  await api(`/api/admin/packages/${fd.get('id')}`, { method: 'PUT', body: JSON.stringify(packageBody(fd)) });
  loadPackages(); loadStats();
});
$('#newPackage').onclick = () => openEditor('Add Package', packageFields(), async fd => {
  await api('/api/admin/packages', { method: 'POST', body: JSON.stringify(packageBody(fd)) });
  loadPackages(); loadStats();
});
window.togglePackage = async (id) => { await api(`/api/admin/packages/${id}/toggle`, { method: 'PATCH' }); loadPackages(); loadStats(); };
window.deletePackage = async (id) => {
  if (!confirm('Delete this package? Packages referenced by orders will be hidden instead.')) return;
  await api(`/api/admin/packages/${id}`, { method: 'DELETE' });
  loadPackages(); loadStats();
};

// ---- groups ----
async function loadGroups() {
  const list = await api('/api/admin/groups');
  $('#groupAdmin').innerHTML = list.length ? list.map(g => `<div class="admin-row"><span class="status-dot ${g.active ? 'on' : 'off'}"></span><div class="row-main"><b>${esc(g.name)}</b><p class="muted">${esc(g.description)}</p></div><div class="row-price">${money(g.price)}</div><div class="actions"><button class="small-btn" onclick='editGroup(${JSON.stringify(g)})'>${icon('sliders', 14)}Edit</button><button class="small-btn" onclick="toggleGroup(${g.id})">${g.active ? 'Hide' : 'Show'}</button><button class="small-btn danger" onclick="deleteGroup(${g.id})">Delete</button></div></div>`).join('') : emptyState('users', 'No groups yet', 'Add your first group to link a community.');
}
function groupFields(g = {}) {
  return [
    { name: 'id', value: g.id || '', type: 'hidden' },
    { name: 'name', label: 'Group Name', value: g.name || '', required: true },
    { name: 'description', label: 'Description', value: g.description || '', type: 'textarea', wide: true },
    { name: 'price', label: 'Group Price', value: g.price ?? 0, type: 'number' },
    { name: 'original_price', label: 'Original Price', value: g.original_price || '', type: 'number' },
    { name: 'link', label: 'Group Link', value: g.link || '' },
    { name: 'category', label: 'Category', value: g.category || '' },
    { name: 'badge', label: 'Badge', value: g.badge || '' },
    { name: 'display_order', label: 'Sort Order', value: g.display_order ?? 0, type: 'number' }
  ];
}
function groupBody(fd) {
  return {
    name: fd.get('name'), description: fd.get('description'), price: +fd.get('price') || 0,
    original_price: +fd.get('original_price') || null, link: fd.get('link'), category: fd.get('category'),
    badge: fd.get('badge'), display_order: +fd.get('display_order') || 0
  };
}
window.editGroup = (g) => openEditor('Edit Group', groupFields(g), async fd => {
  await api(`/api/admin/groups/${fd.get('id')}`, { method: 'PUT', body: JSON.stringify(groupBody(fd)) });
  loadGroups(); loadStats();
});
$('#newGroup').onclick = () => openEditor('Add Group', groupFields(), async fd => {
  await api('/api/admin/groups', { method: 'POST', body: JSON.stringify(groupBody(fd)) });
  loadGroups(); loadStats();
});
window.toggleGroup = async (id) => { await api(`/api/admin/groups/${id}/toggle`, { method: 'PATCH' }); loadGroups(); loadStats(); };
window.deleteGroup = async (id) => {
  if (!confirm('Delete this group? Groups referenced by orders will be hidden instead.')) return;
  await api(`/api/admin/groups/${id}`, { method: 'DELETE' });
  loadGroups(); loadStats();
};

// ---- offers ----
let cachedPackages = [], cachedGroups = [];
async function loadOffers() {
  const [offers, packages, groups] = await Promise.all([api('/api/admin/offers'), api('/api/admin/packages'), api('/api/admin/groups')]);
  cachedPackages = packages; cachedGroups = groups;
  const nameFor = (o) => (o.product_type === 'package' ? packages : groups).find(x => x.id === o.product_id)?.name || 'Deleted item';
  $('#offerAdmin').innerHTML = offers.length ? offers.map(o => `<div class="admin-row"><span class="status-dot ${o.active ? 'on' : 'off'}"></span><div class="row-main"><b>${esc(o.title)}</b><p class="muted">${esc(nameFor(o))} · ${o.product_type}</p></div><div class="row-price">${money(o.sale_price)}<span class="strike">${money(o.original_price)}</span></div><div class="actions"><button class="small-btn" onclick='editOffer(${JSON.stringify(o)})'>${icon('sliders', 14)}Edit</button><button class="small-btn danger" onclick="deleteOffer(${o.id})">Delete</button></div></div>`).join('') : emptyState('tag', 'No active offers', 'Add a time-boxed discount on a package or group.');
}
function offerFields(o = {}) {
  const productOptions = [
    ...cachedPackages.map(p => ({ value: `package:${p.id}`, label: `[Package] ${p.name}` })),
    ...cachedGroups.map(g => ({ value: `group:${g.id}`, label: `[Group] ${g.name}` }))
  ];
  return [
    { name: 'id', value: o.id || '', type: 'hidden' },
    { name: 'title', label: 'Offer Title', value: o.title || '', required: true },
    { name: 'description', label: 'Description', value: o.description || '', type: 'textarea', wide: true },
    { name: 'product', label: 'Applies To', value: o.product_type ? `${o.product_type}:${o.product_id}` : '', type: 'select', options: productOptions },
    { name: 'original_price', label: 'Original Price', value: o.original_price || '', type: 'number', required: true },
    { name: 'sale_price', label: 'Sale Price', value: o.sale_price || '', type: 'number', required: true },
    { name: 'start_at', label: 'Start Date/Time', value: o.start_at ? o.start_at.slice(0, 16) : '', type: 'datetime-local' },
    { name: 'end_at', label: 'End Date/Time', value: o.end_at ? o.end_at.slice(0, 16) : '', type: 'datetime-local' }
  ];
}
async function saveOffer(fd) {
  const [product_type, product_id] = String(fd.get('product') || '').split(':');
  const body = {
    title: fd.get('title'), description: fd.get('description'), product_type, product_id: Number(product_id),
    original_price: +fd.get('original_price'), sale_price: +fd.get('sale_price'),
    start_at: fd.get('start_at') || null, end_at: fd.get('end_at') || null
  };
  const id = fd.get('id');
  if (id) await api(`/api/admin/offers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  else await api('/api/admin/offers', { method: 'POST', body: JSON.stringify(body) });
  loadOffers(); loadStats();
}
window.editOffer = (o) => openEditor('Edit Special Offer', offerFields(o), saveOffer);
$('#newOffer').onclick = async () => { await loadOffers(); openEditor('Add Special Offer', offerFields(), saveOffer); };
window.deleteOffer = async (id) => { if (!confirm('Delete this offer?')) return; await api(`/api/admin/offers/${id}`, { method: 'DELETE' }); loadOffers(); loadStats(); };

// ---- orders ----
async function loadOrders() {
  const params = new URLSearchParams({
    status: $('#orderStatus').value, search: $('#orderSearch').value, sort: $('#orderSort').value
  });
  const list = await api('/api/admin/orders?' + params.toString());
  $('#orderAdmin').innerHTML = list.length ? list.map(o => `<div class="admin-row order-row"><div class="row-main"><b>${esc(o.product_name)} <span class="status ${esc(o.status)}">${esc(o.status)}</span></b><p>${esc(o.customer_name)} · ${esc(o.customer_contact)}</p><p class="muted">${esc(o.order_id)}${o.payment_reference ? ' · Ref: ' + esc(o.payment_reference) : ''} · ${esc(o.created_at)}</p></div><div class="row-price">${money(o.amount)}</div><div class="actions"><button class="small-btn" onclick="setOrder('${o.order_id}','approved')">Approve</button><button class="small-btn" onclick="setOrder('${o.order_id}','rejected')">Reject</button><button class="small-btn" onclick="setOrder('${o.order_id}','pending')">Pending</button></div></div>`).join('') : emptyState('inbox', 'No orders yet', 'Customer payment confirmations will show up here.');
}
window.setOrder = async (id, status) => { await api(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); loadOrders(); loadStats(); };
$('#orderSearch').oninput = debounce(loadOrders, 300);
$('#orderStatus').onchange = loadOrders;
$('#orderSort').onchange = loadOrders;
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---- faq ----
async function loadFaq() {
  const list = await api('/api/admin/faq');
  $('#faqAdmin').innerHTML = list.length ? list.map(f => `<div class="admin-row"><span class="status-dot ${f.active ? 'on' : 'off'}"></span><div class="row-main"><b>${esc(f.question)}</b><p class="muted">${esc(f.answer)}</p></div><div class="actions"><button class="small-btn" onclick='editFaq(${JSON.stringify(f)})'>${icon('sliders', 14)}Edit</button><button class="small-btn danger" onclick="deleteFaq(${f.id})">Delete</button></div></div>`).join('') : emptyState('help', 'No FAQ entries yet', 'Add answers to common pre-purchase questions.');
}
function faqFields(f = {}) {
  return [
    { name: 'id', value: f.id || '', type: 'hidden' },
    { name: 'question', label: 'Question', value: f.question || '', required: true },
    { name: 'answer', label: 'Answer', value: f.answer || '', type: 'textarea', wide: true },
    { name: 'display_order', label: 'Sort Order', value: f.display_order ?? 0, type: 'number' },
    { name: 'active', label: 'Active', value: f.active !== false, type: 'checkbox' }
  ];
}
function faqBody(fd) { return { question: fd.get('question'), answer: fd.get('answer'), display_order: +fd.get('display_order') || 0, active: fd.get('active') === 'on' }; }
window.editFaq = (f) => openEditor('Edit FAQ', faqFields(f), async fd => { await api(`/api/admin/faq/${fd.get('id')}`, { method: 'PUT', body: JSON.stringify(faqBody(fd)) }); loadFaq(); });
$('#newFaq').onclick = () => openEditor('Add FAQ', faqFields(), async fd => { await api('/api/admin/faq', { method: 'POST', body: JSON.stringify(faqBody(fd)) }); loadFaq(); });
window.deleteFaq = async (id) => { if (!confirm('Delete this FAQ entry?')) return; await api(`/api/admin/faq/${id}`, { method: 'DELETE' }); loadFaq(); };

// ---- settings ----
async function loadSettings() {
  const s = await api('/api/admin/settings');
  const f = $('#settingsForm');
  for (const [k, v] of Object.entries(s)) if (f.elements[k]) f.elements[k].value = v;
}
$('#settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const m = $('#settingsMsg');
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
    m.className = 'message success wide'; m.textContent = 'Settings saved.';
  } catch (err) {
    m.className = 'message error wide'; m.textContent = err.message;
  }
};

// ---- backup ----
$('#exportBackup').onclick = () => { window.location.href = '/api/admin/backup'; };
$('#importBackup').onclick = async () => {
  const file = $('#importFile').files[0];
  const m = $('#backupMsg');
  if (!file) { m.className = 'message error'; m.textContent = 'Choose a backup JSON file first.'; return; }
  if (!confirm('Importing will replace existing packages, groups, offers and FAQ. Continue?')) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    await api('/api/admin/backup/import', { method: 'POST', body: JSON.stringify(json) });
    m.className = 'message success'; m.textContent = 'Backup imported.';
  } catch (err) {
    m.className = 'message error'; m.textContent = err.message || 'Import failed.';
  }
};

// ---- auth (PIN keypad) ----
const PIN_LENGTH = 4;
let pinValue = '';

function renderPinDots() {
  document.querySelectorAll('#pinDots .dot').forEach((dot, i) => dot.classList.toggle('filled', i < pinValue.length));
}

async function submitPin() {
  const errBox = $('#loginMsg');
  errBox.classList.add('hidden');
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pinValue }) });
    pinValue = '';
    showApp();
  } catch (err) {
    $('#loginMsgText').textContent = err.message || 'Incorrect PIN';
    errBox.classList.remove('hidden');
    pinValue = '';
    renderPinDots();
  }
}

$('#keypad').addEventListener('click', (e) => {
  const key = e.target.closest('[data-key]');
  if (key) {
    if (pinValue.length >= PIN_LENGTH) return;
    pinValue += key.dataset.key;
    renderPinDots();
    if (pinValue.length === PIN_LENGTH) submitPin();
    return;
  }
  if (e.target.closest('#pinBack')) {
    pinValue = pinValue.slice(0, -1);
    renderPinDots();
  }
});

document.addEventListener('keydown', (e) => {
  if ($('#login').classList.contains('hidden')) return;
  if (/^[0-9]$/.test(e.key) && pinValue.length < PIN_LENGTH) {
    pinValue += e.key;
    renderPinDots();
    if (pinValue.length === PIN_LENGTH) submitPin();
  } else if (e.key === 'Backspace') {
    pinValue = pinValue.slice(0, -1);
    renderPinDots();
  }
});

$('#logout').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }).catch(() => {}); showLogin(); };

(async () => {
  try {
    const { authenticated } = await api('/api/admin/session');
    if (authenticated) showApp(); else showLogin();
  } catch { showLogin(); }
})();
