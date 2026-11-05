// SanoVet — Recordatorios: vacunas, desparasitaciones, controles, cumpleaños de mascotas, saldos, planes y puntos
import { store } from '../store.js';
import { markReminded, settleAgreement } from '../ops.js';
import { esc, usd, emptyState, fmtDate, toast, openModal, setBusy, PAY_METHODS } from '../utils.js';
import { icon } from '../icons.js';
import { avatar, petAvatar, openClient, openPet, payDebtModal } from '../client.js';
import { waClient, printDoc } from '../shared.js';
import { dueItems, dueTone, dueText, DEWORM } from '../vet.js';

const TABS = { vacunas: 'Vacunas y desparasitación', controles: 'Controles', cumples: 'Cumpleaños', saldos: 'Saldos pendientes', convenios: 'Planes por cobrar', puntos: 'Puntos' };

export function mount(el, { navigate, params = {} }) {
  let tab = TABS[params.tab] ? params.tab : 'vacunas';
  let horizon = 30;
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Recordatorios</h1><p class="view-sub">Una mascota con su plan sanitario al día vuelve a la clínica varias veces al año: avísale al tutor a tiempo.</p></div></div>
    <div class="tabs" id="l-tabs" data-tour="rem-tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v}<span class="tab-n" data-n="${k}" hidden></span></button>`).join('')}</div>
    <div id="l-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  const set = (k, n) => { const b = el.querySelector(`[data-n="${k}"]`); if (b) { b.hidden = !n; b.textContent = n; } };

  function draw() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    set('vacunas', store.dueVaccines.length); set('controles', store.dueControls.length); set('cumples', store.petBirthdaysWithin(7).length); set('saldos', store.debtors.length);
    ({ vacunas, controles, cumples, saldos, convenios, puntos })[tab]();
  }
  const sent = (p, key) => p.reminded?.[key];

  function vacunas() {
    const all = [];
    for (const p of store.livePets) for (const it of dueItems(p)) if (it.d <= horizon && it.d >= -90) all.push({ pet: p, owner: store.client(p.ownerId), ...it });
    all.sort((a, b) => a.d - b.d);
    const late = all.filter((x) => x.d < 0); const soon = all.filter((x) => x.d >= 0);
    const row = (x, i) => { const key = `${x.kind}:${x.name}:${x.next}`; const s = sent(x.pet, key); return `<div class="list-item">${petAvatar(x.pet)}<div class="grow" style="min-width:0"><button class="linkish ellipsis" data-p="${x.pet.id}"><b>${esc(x.pet.name)}</b></button> <span class="t-sub">${esc(x.owner?.name || x.pet.ownerName || '')}</span><div class="t-sub ellipsis">${icon(x.kind === 'vacuna' ? 'syringe' : DEWORM[x.kind]?.icon || 'pill')} ${esc(x.name)} · ${fmtDate(x.next)}</div><div class="small"><span class="badge badge-${dueTone(x.d)}">${dueText(x.d)}</span>${s ? ` <span class="badge badge-success">${icon('check')} avisado ${fmtDate(s)}</span>` : ''}</div></div>
      <div class="row" style="gap:4px">${x.owner?.phone || x.pet.ownerPhone ? `<button class="btn btn-whatsapp btn-sm" data-wa="${i}">${icon('whatsapp')}<span class="hide-sm"> Avisar</span></button>` : ''}<button class="btn btn-secondary btn-icon btn-sm" data-ap="${x.pet.id}" title="Agendar">${icon('calendar')}</button></div></div>`; };
    $('#l-body').innerHTML = `<div class="row row-wrap mb" style="gap:6px"><span class="small muted">Mostrar los que tocan en:</span>${[7, 15, 30, 60].map((d) => `<button class="chip chip-sm ${horizon === d ? 'on' : ''}" data-h="${d}">${d} días</button>`).join('')}</div>
      <div class="grid-2">
      <div class="card"><div class="card-head"><div class="card-title text-danger">${icon('alert')} Vencidas</div><span class="small muted">${late.length}</span></div>${late.length ? `<div class="list">${late.map((x) => row(x, all.indexOf(x))).join('')}</div>` : emptyState('checkCircle', 'Ninguna vencida', 'Todas las mascotas tienen su plan al día.')}</div>
      <div class="card"><div class="card-head"><div class="card-title">${icon('calendar')} Próximas</div><span class="small muted">${soon.length}</span></div>${soon.length ? `<div class="list">${soon.map((x) => row(x, all.indexOf(x))).join('')}</div>` : emptyState('calendar', 'Nada en este período', 'Registra vacunas y desparasitaciones con su fecha de refuerzo.')}</div>
    </div>`;
    el.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { horizon = Number(b.dataset.h); draw(); });
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => openPet(b.dataset.p));
    el.querySelectorAll('[data-ap]').forEach((b) => b.onclick = async () => { const { apptForm } = await import('./agenda.js'); apptForm(null, { pet: store.pet(b.dataset.ap), service: 'vacuna' }); });
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = async () => { const x = all[+b.dataset.wa]; waClient(x.kind === 'vacuna' ? 'vacuna' : 'desparasitar', { client: x.owner, pet: x.pet, item: x }); await markReminded(x.pet, `${x.kind}:${x.name}:${x.next}`); });
  }

  function controles() {
    const list = store.dueControls;
    $('#l-body').innerHTML = list.length ? `<div class="card"><div class="list">${list.map((x) => `<div class="list-item">${petAvatar(x.pet)}<div class="grow" style="min-width:0"><button class="linkish" data-p="${x.pet.id}"><b>${esc(x.pet.name)}</b></button> <span class="t-sub">${esc(x.owner?.name || '')}</span><div class="t-sub ellipsis">${esc(x.pet.lastDx || 'Control')} · ${fmtDate(x.pet.nextControl)}</div></div><span class="badge badge-${dueTone(x.d)}">${dueText(x.d).replace('vencida', 'atrasado')}</span>${x.owner?.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${x.pet.id}">${icon('whatsapp')}</button>` : ''}<button class="btn btn-secondary btn-icon btn-sm" data-ap="${x.pet.id}" title="Agendar">${icon('calendar')}</button></div>`).join('')}</div></div>`
      : emptyState('refresh', 'Sin controles pendientes', 'Al guardar una consulta con “Próximo control”, la mascota aparece aquí unos días antes.');
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => openPet(b.dataset.p));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const p = store.pet(b.dataset.wa); waClient('control', { client: store.client(p.ownerId), pet: p }); });
    el.querySelectorAll('[data-ap]').forEach((b) => b.onclick = async () => { const { apptForm } = await import('./agenda.js'); apptForm(null, { pet: store.pet(b.dataset.ap), service: 'control', date: store.pet(b.dataset.ap).nextControl }); });
  }

  function cumples() {
    const list = store.petBirthdaysWithin(30);
    $('#l-body').innerHTML = list.length ? `<div class="card"><div class="list">${list.map((x) => { const age = new Date().getFullYear() - Number(x.pet.birthDate.slice(0, 4)); return `<div class="list-item">${petAvatar(x.pet)}<div class="grow"><button class="linkish" data-p="${x.pet.id}"><b>${esc(x.pet.name)}</b></button> <span class="t-sub">${esc(x.owner?.name || '')}</span><div class="t-sub">${x.inDays === 0 ? '🎂 ¡Hoy!' : `en ${x.inDays} día(s)`} · cumple ${age} año${age === 1 ? '' : 's'}</div></div>${x.owner?.phone ? `<button class="btn btn-whatsapp btn-sm" data-wa="${x.pet.id}">${icon('whatsapp')} Felicitar</button>` : ''}</div>`; }).join('')}</div></div>`
      : emptyState('cake', 'Sin cumpleaños en los próximos 30 días', 'Registra la fecha de nacimiento en la ficha de la mascota.');
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => openPet(b.dataset.p));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const p = store.pet(b.dataset.wa); waClient('cumple', { client: store.client(p.ownerId), pet: p }); });
  }

  function saldos() {
    const list = store.debtors;
    $('#l-body').innerHTML = list.length ? `<div class="card"><div class="card-head"><div class="card-title">${icon('wallet')} Tutores con saldo</div><b>${usd(store.totalDebt)}</b></div><div class="list">${list.map((c) => `<div class="list-item">${avatar(c)}<div class="grow" style="min-width:0"><button class="linkish" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${esc(c.phone || '')}</div></div><b class="text-danger num">${usd(c.balance)}</b>${c.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${c.id}">${icon('whatsapp')}</button>` : ''}<button class="btn btn-primary btn-sm" data-pay="${c.id}">${icon('dollar')} Cobrar</button></div>`).join('')}</div></div>`
      : emptyState('checkCircle', 'Nadie debe', 'Lo que se deja a crédito (cirugías, hospitalización) queda aquí para cobrarlo después.');
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => waClient('deuda', { client: store.client(b.dataset.wa) }));
    el.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payDebtModal(store.client(b.dataset.pay)));
  }

  async function convenios() {
    $('#l-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    let sales = [];
    try { sales = await store.agreementSales(); } catch (e) { console.error(e); }
    if (tab !== 'convenios') return;
    const pending = sales.filter((s) => !s.agreementPaid);
    const by = {};
    for (const s of pending) (by[s.agreementId || '?'] ||= []).push(s);
    const ags = Object.entries(by);
    $('#l-body').innerHTML = !store.settings.agreements.length ? emptyState('handshake', 'Sin planes ni convenios', 'Crea planes de salud o convenios (seguros para mascotas, empresas, protectoras) en Configuración: descuento y porcentaje que cubre.')
      : ags.length ? ags.map(([id, L]) => { const ag = store.agreement(id); const tot = L.reduce((a, s) => a + (s.agreementDue || 0), 0); return `<div class="card mt"><div class="card-head"><div class="card-title">${icon('handshake')} ${esc(ag?.name || L[0].agreementName || 'Plan')}</div><div class="row" style="gap:6px"><b>${usd(tot)}</b><button class="btn btn-secondary btn-sm" data-pr="${id}">${icon('print')} Relación</button><button class="btn btn-primary btn-sm" data-st="${id}">${icon('check')} Marcar cobrado</button></div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Factura</th><th>Fecha</th><th>Tutor / mascota</th><th class="r">Total</th><th class="r">Cubre</th></tr></thead><tbody>${L.map((s) => `<tr><td><b>${esc(s.number)}</b></td><td>${fmtDate(s.date)}</td><td>${esc(s.memberName || '')}<div class="t-sub">${esc(s.petName || '')}</div></td><td class="r num">${usd(s.total)}</td><td class="r num"><b>${usd(s.agreementDue)}</b></td></tr>`).join('')}</tbody></table></div></div>`; }).join('')
        : emptyState('checkCircle', 'Todo cobrado', 'No hay montos pendientes por cobrar a planes o convenios.');
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { const L = by[b.dataset.pr]; const ag = store.agreement(b.dataset.pr); printDoc(`Relación de cobro · ${ag?.name || ''}`, `<p>${esc(store.businessName)}${store.settings.rif ? ' · ' + esc(store.settings.rif) : ''}</p><table><thead><tr><th>Factura</th><th>Fecha</th><th>Tutor</th><th>Mascota</th><th>N° afiliado</th><th class="r">Monto</th></tr></thead><tbody>${L.map((s) => { const c = store.client(s.memberId); return `<tr><td>${esc(s.number)}</td><td>${fmtDate(s.date)}</td><td>${esc(s.memberName || '')}</td><td>${esc(s.petName || '')}</td><td>${esc(c?.agreementNumber || '')}</td><td class="r">${usd(s.agreementDue)}</td></tr>`; }).join('')}</tbody></table><p class="r"><b>Total: ${usd(L.reduce((a, s) => a + s.agreementDue, 0))}</b></p><div class="sign"><div>Clínica</div><div>Plan / convenio</div></div>`); });
    el.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
      const L = by[b.dataset.st];
      const m = openModal({ title: 'Cobro del plan', sub: `${L.length} factura(s) · ${usd(L.reduce((a, s) => a + s.agreementDue, 0))}`, size: 'sm', body: `<div class="stack"><div class="field"><label>Forma de pago</label><select class="select" data-m>${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div><div class="field"><label>Referencia</label><input class="input" data-n></div></div>`, footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Confirmar</button>` });
      m.el.querySelector('[data-ok]').onclick = async (e) => { setBusy(e.currentTarget, true); await settleAgreement(L, { method: m.el.querySelector('[data-m]').value, note: m.el.querySelector('[data-n]').value }); m.close(); toast('Marcado como cobrado'); convenios(); };
    });
  }

  function puntos() {
    const L = store.loyalty;
    const list = store.liveClients.filter((c) => Number(c.points) > 0).sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 100);
    $('#l-body').innerHTML = `<div class="card"><div class="small">${L.enabled ? `Programa activo: <b>1 punto por cada ${usd(L.per)}</b> de compra · cada punto vale <b>${usd(L.pointValue)}</b> · canje desde <b>${L.minRedeem} pts</b>.` : 'El programa de puntos está apagado.'} <button class="linkish" id="l-cfg">Configurar</button></div></div>
      ${list.length ? `<div class="card mt"><div class="list">${list.map((c) => `<div class="list-item">${avatar(c)}<div class="grow"><button class="linkish" data-c="${c.id}"><b>${esc(c.name)}</b></button><div class="t-sub">${c.visits || 0} visita(s)</div></div><span class="badge badge-violet">${icon('star')} ${Math.floor(c.points)} pts · ${usd(Math.floor(c.points) * L.pointValue)}</span>${c.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${c.id}">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div></div>` : emptyState('star', 'Aún nadie tiene puntos', 'Se suman solos al cobrarle a un tutor registrado.')}`;
    $('#l-cfg').onclick = () => navigate('ajustes', { tab: 'fidelidad' });
    el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => openClient(b.dataset.c));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => waClient('puntos', { client: store.client(b.dataset.wa) }));
  }

  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  draw();
  const off = store.on('*', (evt) => { if ((evt === 'clients' || evt === 'pets') && tab !== 'convenios') draw(); });
  return () => off();
}
