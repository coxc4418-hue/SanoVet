// SanoVet — Inicio: el día de la clínica de un vistazo
import { store } from '../store.js';
import { esc, usd, fmtLongDate, todayKey, emptyState, fmtDate, fmtTime } from '../utils.js';
import { icon } from '../icons.js';
import { petAvatar, openPet, petForm, consultForm, pickPet } from '../client.js';
import { waClient } from '../shared.js';
import { SERVICES, apptBadge, dueText, dueTone, GROOM_STATUS, HOSP_STATUS, stockText, productLine, expBadge } from '../vet.js';
import { markReminded, setApptStatus } from '../ops.js';

export function mount(el, { navigate }) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">${hello} ${h < 12 ? '☀️' : h < 19 ? '🐾' : '🌙'}</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
      <div class="view-actions" data-tour="quick">
        <button class="btn btn-primary" data-q="consult">${icon('stethoscope')} Consulta</button>
        <button class="btn btn-secondary" data-q="appt">${icon('calendar')} Agendar cita</button>
        <button class="btn btn-secondary" data-q="sell">${icon('cart')} Vender <kbd class="hide-sm">F1</kbd></button>
        <button class="btn btn-ghost" data-q="new">${icon('plus')} Mascota</button>
      </div></div>
    <div id="d-ord"></div>
    <div class="kpis" data-tour="kpis" id="d-kpis"></div>
    <div class="grid-2 mt-lg">
      <div class="card" data-tour="today"><div class="card-head"><div class="card-title">${icon('calendar')} Citas de hoy</div><button class="btn btn-ghost btn-sm" data-go="agenda">Agenda</button></div><div id="d-appts"></div></div>
      <div class="card" data-tour="due"><div class="card-head"><div class="card-title">${icon('syringe')} Vacunas y controles por avisar</div><button class="btn btn-ghost btn-sm" data-go="recordatorios">Ver todo</button></div><div id="d-due"></div></div>
    </div>
    <div class="grid-2 mt-lg">
      <div class="card" data-tour="clinic"><div class="card-head"><div class="card-title">${icon('home')} En la clínica ahora</div><button class="btn btn-ghost btn-sm" data-go="sala">Peluquería y hospital</button></div><div id="d-in"></div></div>
      <div class="card" data-tour="low"><div class="card-head"><div class="card-title">${icon('alert')} Inventario por atender</div><button class="btn btn-ghost btn-sm" data-go="inventario">Inventario</button></div><div id="d-low"></div></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
  $('[data-q="sell"]').onclick = () => navigate('vender');
  $('[data-q="appt"]').onclick = async () => { const { apptForm } = await import('./agenda.js'); apptForm(null, {}); };
  $('[data-q="consult"]').onclick = async () => { const p = await pickPet({ title: '¿A quién atendemos?' }); if (p) consultForm(p); };
  $('[data-q="new"]').onclick = async () => { const r = await petForm(); if (r) openPet(r.pet.id); };

  function orders() {
    const list = store.pendingOrders;
    const fresh = store.newOrders;
    $('#d-ord').innerHTML = list.length ? `<div class="banner req-banner"><span>${icon('bag')} <b>${list.length} pedido(s) en línea</b> por atender${fresh.length ? ` · ${fresh.length} nuevo(s)` : ''}: ${list.slice(0, 3).map((o) => `${esc((o.name || '').split(' ')[0])} (${o.items?.length || 0})`).join(', ')}</span><button class="btn btn-sm btn-primary" id="d-ord-go">Atender</button></div>` : '';
    $('#d-ord-go')?.addEventListener('click', () => navigate('pedidos'));
  }

  function kpis() {
    const t = todayKey();
    const sales = store.recentSales.filter((s) => s.dayKey === t && s.status !== 'voided' && s.kind !== 'abono');
    const total = sales.reduce((a, s) => a + (Number(s.total) || 0), 0);
    const appts = store.todayAppts;
    const done = appts.filter((a) => a.status === 'atendida').length;
    const wait = store.waiting.length;
    const due = store.dueVaccines;
    const late = due.filter((x) => x.d < 0).length;
    const groom = store.grooming.length; const hosp = store.hospitalized.length;
    const low = store.lowProducts.length; const exp = store.expiringProducts.length;
    $('#d-kpis').innerHTML = `
      <div class="card kpi kpi-link" data-go2="agenda"><div class="kpi-top"><span class="kpi-label">Citas de hoy</span><span class="kpi-icon tone-brand">${icon('calendar')}</span></div><div class="kpi-value">${appts.length}</div><div class="kpi-sub">${done} atendida(s)${wait ? ` · <span class="text-warning">${wait} en espera</span>` : ''}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ventas de hoy</span><span class="kpi-icon tone-success">${icon('dollar')}</span></div><div class="kpi-value">${usd(total)}</div><div class="kpi-sub">${sales.length} cobro(s)${store.openShift ? '' : ' · <span class="text-warning">caja cerrada</span>'}</div></div>
      <div class="card kpi kpi-link" data-go2="recordatorios"><div class="kpi-top"><span class="kpi-label">Vacunas por tocar</span><span class="kpi-icon tone-violet">${icon('syringe')}</span></div><div class="kpi-value">${due.length}</div><div class="kpi-sub">${late ? `<span class="text-danger">${late} vencida(s)</span>` : `próximos ${store.settings.reminderDays || 7} días`}</div></div>
      <div class="card kpi kpi-link" data-go2="sala"><div class="kpi-top"><span class="kpi-label">En la clínica</span><span class="kpi-icon tone-info">${icon('bed')}</span></div><div class="kpi-value">${groom + hosp}</div><div class="kpi-sub">${groom} en peluquería · ${hosp} hospitalizado(s)</div></div>
      <div class="card kpi kpi-link" data-go2="inventario" data-p="bajo"><div class="kpi-top"><span class="kpi-label">Stock bajo</span><span class="kpi-icon tone-warning">${icon('box')}</span></div><div class="kpi-value">${low}</div><div class="kpi-sub">${exp ? `<span class="text-danger">${exp} por vencer</span>` : 'nada por vencer'}</div></div>
      <div class="card kpi kpi-link" data-go2="mascotas"><div class="kpi-top"><span class="kpi-label">Pacientes</span><span class="kpi-icon tone-success">${icon('paw')}</span></div><div class="kpi-value">${store.livePets.length}</div><div class="kpi-sub">${store.liveClients.length} tutor(es)</div></div>`;
    el.querySelectorAll('[data-go2]').forEach((b) => b.onclick = () => navigate(b.dataset.go2, b.dataset.p ? { tab: b.dataset.p } : {}));
  }

  function appts() {
    const list = store.todayAppts;
    $('#d-appts').innerHTML = list.length ? `<div class="list">${list.slice(0, 8).map((a) => {
      const p = store.pet(a.petId); const sv = SERVICES[a.service] || SERVICES.consulta;
      return `<div class="list-item"><div class="appt-time"><b>${esc(a.time)}</b></div>${p ? petAvatar(p) : `<span class="kpi-icon" style="width:38px;height:38px;background:${sv.color}22;color:${sv.color}">${icon(sv.icon)}</span>`}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${a.petId || ''}"><b>${esc(a.petName)}</b></button><div class="t-sub ellipsis">${esc(sv.label)}${a.staffName ? ' · ' + esc(a.staffName) : ''} · ${esc(a.ownerName || '')}</div></div>${apptBadge(a.status)}
        ${['pendiente', 'confirmada'].includes(a.status) ? `<button class="btn btn-secondary btn-sm" data-arr="${a.id}" title="Llegó">${icon('door')}<span class="hide-sm"> Llegó</span></button>` : a.status === 'llego' && p ? `<button class="btn btn-primary btn-sm" data-att="${a.id}">${icon(sv.role === 'groomer' ? 'scissors' : 'stethoscope')}<span class="hide-sm"> Atender</span></button>` : ''}</div>`;
    }).join('')}</div>${list.length > 8 ? `<div class="small muted mt-xs">y ${list.length - 8} más…</div>` : ''}`
      : emptyState('calendar', 'Sin citas para hoy', 'Agenda consultas, vacunas y baños: aparecen aquí con su hora.');
    el.querySelectorAll('#d-appts [data-p]').forEach((b) => b.onclick = () => b.dataset.p && openPet(b.dataset.p));
    el.querySelectorAll('#d-appts [data-arr]').forEach((b) => b.onclick = () => setApptStatus(store.appointments.find((a) => a.id === b.dataset.arr), 'llego'));
    el.querySelectorAll('#d-appts [data-att]').forEach((b) => b.onclick = async () => {
      const a = store.appointments.find((x) => x.id === b.dataset.att); const p = store.pet(a.petId);
      if (SERVICES[a.service]?.role === 'groomer') { const { stayForm } = await import('./sala.js'); stayForm('peluqueria', { pet: p, appt: a }); }
      else consultForm(p, { appt: a });
    });
  }

  function due() {
    const list = store.dueVaccines.slice(0, 6);
    const ctrl = store.dueControls.slice(0, 3);
    const bd = store.petBirthdaysWithin(0);
    $('#d-due').innerHTML = `
      <div class="follow-sums"><div><b>${store.dueVaccines.filter((x) => x.kind === 'vacuna').length}</b><span>vacunas</span></div><div><b>${store.dueVaccines.filter((x) => x.kind !== 'vacuna').length}</b><span>desparasitaciones</span></div><div><b>${store.dueControls.length}</b><span>controles</span></div><div><b>${store.petBirthdaysWithin(7).length}</b><span>cumpleaños (7 d)</span></div></div>
      ${list.length ? `<div class="list mt">${list.map((x, i) => `<div class="list-item">${petAvatar(x.pet)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${x.pet.id}"><b>${esc(x.pet.name)}</b></button><div class="t-sub ellipsis">${esc(x.name)} · ${esc(x.owner?.name || x.pet.ownerName || '')}</div></div><span class="badge badge-${dueTone(x.d)}">${dueText(x.d)}</span>${x.owner?.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${i}" title="Avisar por WhatsApp">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${ctrl.length ? `<div class="section-title mt">${icon('refresh')} Controles</div><div class="list">${ctrl.map((x) => `<div class="list-item">${petAvatar(x.pet)}<div class="grow" style="min-width:0"><button class="linkish" data-p="${x.pet.id}"><b>${esc(x.pet.name)}</b></button><div class="t-sub ellipsis">${esc(x.pet.lastDx || 'Control')} · ${fmtDate(x.pet.nextControl)}</div></div>${x.owner?.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-ct="${x.pet.id}">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${bd.length ? `<div class="section-title mt">${icon('cake')} Cumplen años hoy</div><div class="list">${bd.map((x) => `<div class="list-item">${petAvatar(x.pet)}<div class="grow"><button class="linkish" data-p="${x.pet.id}"><b>${esc(x.pet.name)}</b></button></div>${x.owner?.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-bd="${x.pet.id}">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${!list.length && !ctrl.length && !bd.length ? emptyState('checkCircle', 'Todo al día', 'Registra vacunas y desparasitaciones: aquí verás a quién le toca la próxima.') : ''}`;
    el.querySelectorAll('#d-due [data-p]').forEach((b) => b.onclick = () => openPet(b.dataset.p));
    el.querySelectorAll('#d-due [data-wa]').forEach((b) => b.onclick = () => { const x = list[+b.dataset.wa]; waClient(x.kind === 'vacuna' ? 'vacuna' : 'desparasitar', { client: x.owner, pet: x.pet, item: x }); markReminded(x.pet, `${x.kind}:${x.name}:${x.next}`); });
    el.querySelectorAll('#d-due [data-ct]').forEach((b) => b.onclick = () => { const p = store.pet(b.dataset.ct); waClient('control', { client: store.client(p.ownerId), pet: p }); });
    el.querySelectorAll('#d-due [data-bd]').forEach((b) => b.onclick = () => { const p = store.pet(b.dataset.bd); waClient('cumple', { client: store.client(p.ownerId), pet: p }); });
  }

  function inClinic() {
    const list = store.stays;
    $('#d-in').innerHTML = list.length ? `<div class="list">${list.map((s) => { const st = (s.kind === 'hospital' ? HOSP_STATUS : GROOM_STATUS)[s.status] || { label: s.status, tone: 'neutral' }; const p = store.pet(s.petId); return `<div class="list-item">${p ? petAvatar(p) : ''}<div class="grow" style="min-width:0"><button class="linkish" data-p="${s.petId}"><b>${esc(s.petName)}</b></button><div class="t-sub ellipsis">${s.kind === 'hospital' ? `Hospitalizado · ${esc(s.reason || '')}` : `Peluquería · ${esc((s.services || []).join(', '))}`} · desde ${fmtTime(s.inAt)}</div></div><span class="badge badge-${st.tone}">${icon(s.kind === 'hospital' ? 'bed' : 'scissors')} ${st.label}</span></div>`; }).join('')}</div>`
      : emptyState('home', 'No hay mascotas en la clínica', 'Las que recibas en peluquería u hospitalización aparecen aquí.');
    el.querySelectorAll('#d-in [data-p]').forEach((b) => b.onclick = () => openPet(b.dataset.p));
  }

  function low() {
    const lowL = store.lowProducts.sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0)).slice(0, 5);
    const exp = store.expiringLots(Math.max(30, Number(store.settings.expiryAlertDays) || 90)).slice(0, 3);
    $('#d-low').innerHTML = lowL.length || exp.length ? `<div class="list">${lowL.map((p) => `<div class="list-item"><span class="kpi-icon tone-${(Number(p.stock) || 0) <= 0 ? 'danger' : 'warning'}" style="width:36px;height:36px">${icon('box')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(productLine(p))}</div></div><div class="r"><b class="${(Number(p.stock) || 0) <= 0 ? 'text-danger' : ''}">${(Number(p.stock) || 0) <= 0 ? 'Agotado' : stockText(p)}</b><div class="t-sub">mín. ${stockText(p, p.minStock || 0)}</div></div></div>`).join('')}
      ${exp.map((l) => `<div class="list-item"><span class="kpi-icon tone-${l.exp < todayKey() ? 'danger' : 'warning'}" style="width:36px;height:36px">${icon('calendar')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(l.p.name)}</b><div class="t-sub">Lote ${esc(l.lot || 's/l')} · ${stockText(l.p, l.qty)} · vence ${fmtDate(l.exp)}</div></div>${expBadge(l.exp)}</div>`).join('')}</div>`
      : emptyState('checkCircle', 'Inventario en orden', 'Nada por debajo del mínimo ni por vencer.');
  }

  const all = () => { orders(); kpis(); appts(); due(); inClinic(); low(); };
  all();
  const off = store.on('*', (evt) => {
    if (evt === 'orders') orders();
    if (evt === 'products') { kpis(); low(); }
    if (evt === 'pets' || evt === 'clients') { kpis(); due(); appts(); }
    if (evt === 'appointments') { kpis(); appts(); }
    if (evt === 'stays') { kpis(); inClinic(); }
    if (evt === 'sales' || evt === 'shift') kpis();
    if (evt === 'settings') all();
  });
  return () => off();
}
