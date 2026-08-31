const $ = (s) => document.querySelector(s);

function money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function api(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

let state = { settings: null, packages: [], groups: [], offers: [], faq: [] };

function renderSettings() {
  const s = state.settings;
  if (!s) return;
  document.title = s.website_title || 'Video Selling';
  $('#pageTitle').textContent = s.website_title || 'Video Selling';
  $('#brandName').textContent = '● ' + (s.store_name || 'Video Selling');
  $('#footerBrand').innerHTML = `© <span id="year">${new Date().getFullYear()}</span> ${esc(s.store_name || 'Video Selling')}`;
  $('#heroTitle').firstChild.textContent = (s.hero_title || 'Choose your access.') + ' ';
  $('#heroSubtitle').textContent = s.hero_subtitle || 'Pay in seconds.';
  $('#heroSupporting').textContent = s.hero_supporting || '';
  if (s.announcement) { $('#announcement').textContent = s.announcement; $('#announcement').classList.remove('hidden'); }
  else $('#announcement').classList.add('hidden');
  $('#supportText').textContent = s.support_hours || 'Use the configured support contacts for order assistance.';
  const contacts = [];
  if (s.telegram_1) contacts.push(`<a href="https://t.me/${encodeURIComponent(String(s.telegram_1).replace(/^@/, ''))}" target="_blank" rel="noopener noreferrer">@${esc(String(s.telegram_1).replace(/^@/, ''))} ↗</a>`);
  if (s.telegram_2) contacts.push(`<a href="https://t.me/${encodeURIComponent(String(s.telegram_2).replace(/^@/, ''))}" target="_blank" rel="noopener noreferrer">@${esc(String(s.telegram_2).replace(/^@/, ''))} ↗</a>`);
  if (s.email) contacts.push(`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`);
  if (s.phone) contacts.push(`<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>`);
  $('#contacts').innerHTML = contacts.join('');
}

function renderPackages() {
  const packages = state.packages;
  $('#packageStatus').textContent = packages.length ? `${packages.length} available` : '';
  $('#empty').classList.toggle('hidden', packages.length > 0);
  $('#packagesGrid').innerHTML = packages.map(p => {
    const off = p.discount_percentage || 0;
    return `<article class="card">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}<small>${esc(p.name)}</small><h3>${esc(p.description || 'Digital access')}</h3><div class="price">${off ? `<span class="strike">${money(p.original_price)}</span>` : ''}${money(p.price)} ${off ? `<span class="off">${off}% OFF</span>` : ''}</div><ul>${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul><button class="btn light" onclick="openCheckout('package', ${p.id})">Buy Now</button></article>`;
  }).join('');
}

function renderGroups() {
  const groups = state.groups;
  $('#groupsEmpty').classList.toggle('hidden', groups.length > 0);
  $('#groupsList').innerHTML = groups.map(g => {
    const off = g.discount_percentage || 0;
    return `<article class="card"><small>${esc(g.category || 'GROUP')}</small><h3>${esc(g.name)}</h3><p class="muted">${esc(g.description || '')}</p><div class="price">${off ? `<span class="strike">${money(g.original_price)}</span>` : ''}${g.price ? money(g.price) : ''} ${off ? `<span class="off">${off}% OFF</span>` : ''}</div>${g.link ? `<a class="btn ghost" href="${esc(g.link)}" target="_blank" rel="noopener noreferrer">Open Group</a>` : `<button class="btn light" onclick="openCheckout('group', ${g.id})">Buy Now</button>`}</article>`;
  }).join('');
}

function renderOffers() {
  const offers = state.offers;
  $('#offersList').innerHTML = offers.length
    ? offers.map(o => `<div class="offer"><b>${esc(o.title)}</b> · ${esc(o.product_name)}<strong> — ${money(o.sale_price)}</strong><span class="off">${o.discount_percentage}% OFF</span><p class="muted">${esc(o.description || 'Limited-time offer.')}</p></div>`).join('')
    : '<div class="offer">No active offers right now.</div>';
}

function renderFaq() {
  $('#faqList').innerHTML = state.faq.length
    ? state.faq.map(f => `<details><summary>${esc(f.question)}</summary><p class="muted">${esc(f.answer)}</p></details>`).join('')
    : '<p class="muted">No FAQ entries yet.</p>';
}

async function loadAll() {
  $('#packagesError').classList.add('hidden');
  try {
    const [settings, packages, groups, offers, faq] = await Promise.all([
      api('/api/settings'), api('/api/packages'), api('/api/groups'), api('/api/offers'), api('/api/faq')
    ]);
    state = { settings, packages, groups, offers, faq };
    renderSettings(); renderPackages(); renderGroups(); renderOffers(); renderFaq();
  } catch {
    $('#packageStatus').textContent = '';
    $('#packagesGrid').innerHTML = '';
    $('#packagesError').classList.remove('hidden');
  }
}

window.openCheckout = (type, id) => {
  const list = type === 'package' ? state.packages : state.groups;
  const item = list.find(x => x.id === id);
  if (!item) return;
  const s = state.settings || {};
  $('#checkoutTitle').textContent = item.name;
  $('#checkoutAmount').textContent = money(item.price);
  $('#offerLine').textContent = item.offer ? `${item.offer.title} • ${item.discount_percentage}% OFF` : '';
  $('#upiId').textContent = s.upi_id || 'UPI unavailable';
  $('#qr').src = `/api/qr?upi=${encodeURIComponent(s.upi_id || '')}&name=${encodeURIComponent(s.store_name || 'Video Selling')}&amount=${encodeURIComponent(item.price)}&t=${Date.now()}`;
  $('#upiPay').onclick = () => {
    if (s.upi_id) location.href = `upi://pay?pa=${encodeURIComponent(s.upi_id)}&pn=${encodeURIComponent(s.store_name || 'Video Selling')}&am=${encodeURIComponent(Number(item.price).toFixed(2))}&cu=INR&tn=${encodeURIComponent(item.name + ' package')}`;
  };
  $('#orderForm').dataset.type = type;
  $('#orderForm').dataset.id = item.id;
  $('#message').className = 'message hidden';
  $('#orderForm').reset();
  $('#checkout').showModal();
};

$('#close').onclick = () => $('#checkout').close();
$('#copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#upiId').textContent); $('#copy').textContent = 'Copied ✓'; setTimeout(() => $('#copy').textContent = 'Copy', 1200); } catch {}
};
$('#menu').onclick = () => {
  const open = $('#nav').style.display === 'flex';
  $('#nav').style.display = open ? '' : 'flex';
  $('#menu').setAttribute('aria-expanded', String(!open));
};
$('#retryPackages').onclick = loadAll;

$('#orderForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const msg = $('#message');
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_type: form.dataset.type,
        product_id: Number(form.dataset.id),
        customer_name: fd.get('customerName'),
        customer_contact: fd.get('customerContact'),
        payment_reference: fd.get('utr')
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to submit order.');
    msg.className = 'message success';
    msg.textContent = `Order saved. Order ID: ${data.order_id}. Send your payment confirmation to support.`;
    form.reset();
  } catch (err) {
    msg.className = 'message error';
    msg.textContent = err.message || 'Unable to submit order.';
  }
};

loadAll();
