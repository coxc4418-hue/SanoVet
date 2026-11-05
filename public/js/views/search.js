// SanoVet — Búsqueda global (Ctrl + K): mascotas, tutores, productos, facturas y pedidos
import { store, clientBadge, orderBadge } from '../store.js';
import { openModal, esc, usd, normalize, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, clientLine, petAvatar, petLine, dueBadge } from '../client.js';
import { searchText, productLine, stockText, rxBadge } from '../vet.js';

export function openSearch() {
  if (document.querySelector('.search-modal')) return;
  const m = openModal({
    size: 'lg',
    body: `<div class="search search-big">${icon('search')}<input data-q placeholder="Mascota, tutor, teléfono, producto, código de barras o factura (F-000045)…" autofocus autocomplete="off"><kbd>Esc</kbd></div><div data-res class="search-results"></div>`
  });
  m.el.querySelector('.modal').classList.add('search-modal');
  const input = m.el.querySelector('[data-q]');
  const res = m.el.querySelector('[data-res]');
  let token = 0;
  const go = async (route, params = {}) => { m.close(); (await import('../main.js')).navigate(route, { params, force: true }); };

  async function run() {
    const raw = input.value.trim();
    const t = normalize(raw);
    const digits = raw.replace(/\D/g, '');
    const my = ++token;
    if (!t) { res.innerHTML = hint(); return; }
    const bc = store.byBarcode(raw);
    const prods = [...(bc ? [bc] : []), ...store.products.filter((p) => p !== bc && searchText(p).includes(t))].slice(0, 8);
    const exact = store.findClient(raw);
    const cls = [...(exact ? [exact] : []), ...store.clients.filter((p) => p !== exact && (normalize(`${p.name} ${p.number} ${p.email || ''} ${p.cardCode || ''} ${p.idDoc || ''}`).includes(t)
      || (digits.length >= 3 && (`${p.phone || ''}`.replace(/\D/g, '').includes(digits) || `${p.idDoc || ''}`.replace(/\D/g, '').includes(digits)))))].slice(0, 6);
    const ep = store.findPet(raw);
    const pets = [...(ep ? [ep] : []), ...store.pets.filter((p) => p !== ep && p.active !== false && (normalize(`${p.name} ${p.number || ''} ${p.ownerName || ''} ${p.breed || ''} ${p.chip || ''}`).includes(t) || (digits.length >= 4 && String(p.ownerPhone || '').replace(/\D/g, '').includes(digits))))].slice(0, 8);
    const orders = store.orders.filter((o) => normalize(`${o.name} ${o.number || ''} ${o.phone || ''}`).includes(t)).slice(0, 4);
    const sales = store.recentSales.filter((s) => normalize(`${s.number} ${s.memberName || ''}`).includes(t)).slice(0, 5);
    draw(prods, cls, orders, sales, pets);
    const up = raw.toUpperCase().replace(/\s/g, '');
    const pre = (store.settings.invoicePrefix || 'F').toUpperCase();
    if (!new RegExp(`^${pre}-?\\d+$`).test(up)) return;
    const num = `${pre}-` + up.replace(/\D/g, '').padStart(6, '0');
    let found = [];
    try { found = await store.listEq('sales', 'number', num); } catch (_) {}
    if (my !== token) return;
    const extra = found.filter((s) => !sales.some((x) => x.id === s.id));
    if (extra.length) draw(prods, cls, orders, [...extra, ...sales], pets);
  }

  function hint() {
    return `<div class="empty">${icon('search')}<b>Busca en toda la clínica</b><span>Busca una mascota por su nombre, el de su tutor, el teléfono o el microchip; un producto por nombre o código de barras; o una factura por su número.</span></div>`;
  }

  function draw(prods, cls, orders, sales, pets = []) {
    res.innerHTML = (prods.length || cls.length || orders.length || sales.length || pets.length) ? `
      ${pets.length ? `<div class="section-title">Mascotas</div>${pets.map((p) => `<button class="sitem" data-pt="${p.id}">${petAvatar(p)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(petLine(p))} · ${esc(p.ownerName || '')}</div></div>${dueBadge(p)}</button>`).join('')}` : ''}
      ${prods.length ? `<div class="section-title">Productos</div>${prods.map((p) => `<button class="sitem" data-p="${p.id}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(p.trackStock === false ? 'stethoscope' : 'box')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(productLine(p))} · ${(Number(p.stock) || 0) > 0 ? stockText(p) : '<span class="text-danger">agotado</span>'}${p.location ? ` · ${esc(p.location)}` : ''}</div></div>${rxBadge(p, true)}<b class="num">${usd(p.price)}</b></button>`).join('')}` : ''}
      ${cls.length ? `<div class="section-title">Tutores</div>${cls.map((c) => `<button class="sitem" data-m="${c.id}">${avatar(c)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(c.name)}</b><div class="t-sub ellipsis">${esc(c.number)}${c.idDoc ? ' · ' + esc(c.idDoc) : ''} · ${clientLine(c)}</div></div>${clientBadge(store.clientStatus(c))}</button>`).join('')}` : ''}
      ${orders.length ? `<div class="section-title">Pedidos en línea</div>${orders.map((o) => `<button class="sitem" data-o="${o.id}">${icon('bag')}<div class="grow"><b>${esc(o.name)}</b><div class="t-sub">${esc(o.number || '')} · ${(o.items || []).length} producto(s)</div></div>${orderBadge(o.status || 'nueva')}<b class="num">${usd(o.total || 0)}</b></button>`).join('')}` : ''}
      ${sales.length ? `<div class="section-title">Facturas</div>${sales.map((s) => `<button class="sitem" data-s="${esc(s.number)}">${icon('receipt')}<div class="grow"><b>${esc(s.number)}</b><div class="t-sub">${esc(s.memberName || 'Cliente de mostrador')}</div></div><b class="num">${usd(s.total)}</b></button>`).join('')}` : ''}`
      : `<div class="empty">${icon('search')}<b>Sin resultados</b><span>Prueba con parte del nombre, el teléfono del tutor o la marca.</span></div>`;
    res.querySelectorAll('[data-pt]').forEach((b) => b.onclick = async () => { m.close(); (await import('../client.js')).openPet(b.dataset.pt); });
    res.querySelectorAll('[data-m]').forEach((b) => b.onclick = async () => { m.close(); (await import('../client.js')).openClient(b.dataset.m); });
    res.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { m.close(); (await import('./inventory.js')).openProduct(b.dataset.p); });
    res.querySelectorAll('[data-o]').forEach((b) => b.onclick = () => go('pedidos'));
    res.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => go('facturas', { q: b.dataset.s }));
  }

  input.oninput = debounce(run, 140);
  input.onkeydown = (e) => { if (e.key === 'Enter') { const first = res.querySelector('.sitem'); if (first) first.click(); } };
  res.innerHTML = hint();
}
