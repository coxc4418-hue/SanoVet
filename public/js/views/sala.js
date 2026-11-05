// SanoVet — En la clínica: tablero de peluquería (recibido → baño → secado → listo) y hospitalización (evolución y alta)
import { store } from '../store.js';
import { esc, usd, emptyState, openModal, toast, setBusy, fmtTime, fmtDateTime, fmtAgo, parseNum, promptDialog, confirmDialog } from '../utils.js';
import { icon } from '../icons.js';
import { GROOM_STATUS, GROOM_FLOW, HOSP_STATUS, GROOM_SERVICES, speciesOf } from '../vet.js';
import { openStay, setStayStatus, addStayNote, closeStay } from '../ops.js';
import { petAvatar, pickPet, openPet, alertsHTML, consultForm } from '../client.js';
import { waClient } from '../shared.js';

const nav = async (route, params = {}) => { const { navigate } = await import('../main.js'); navigate(route, { params, force: true }); };

/** Recibir una mascota en peluquería u hospitalización */
export function stayForm(kind = 'peluqueria', { pet: pet0 = null, appt = null } = {}) {
  return new Promise((resolve) => {
    let saved = null; let pet = pet0;
    const hosp = kind === 'hospital';
    const svc = new Set();
    const priceOf = (name) => Number(store.products.find((p) => p.trackStock === false && p.active !== false && p.name.toLowerCase().includes(name.toLowerCase()))?.price) || 0;
    const m = openModal({
      title: hosp ? 'Hospitalizar' : 'Recibir en peluquería', size: 'md',
      body: `<div class="stack"><div data-pet></div>
        ${hosp ? `<div class="field"><label>Motivo de ingreso *</label><input class="input" data-r placeholder="Ej.: gastroenteritis, fluidoterapia" value="${esc(appt?.note || '')}"></div>
          <div class="field"><label>Estado</label><div class="seg seg-block" data-s>${Object.entries(HOSP_STATUS).filter(([k]) => k !== 'alta').map(([k, v], i) => `<button type="button" data-v="${k}" class="${i === 0 ? 'on' : ''}">${v.label}</button>`).join('')}</div></div>`
        : `<div class="field"><label>Servicios</label><div class="chips chips-wrap" data-sv>${GROOM_SERVICES.map((s) => `<button type="button" class="chip" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}
        <div class="form-grid">
          <div class="field"><label>${hosp ? 'Médico responsable' : 'Peluquero(a)'}</label><select class="select" data-st>${(store.staffBy(hosp ? 'vet' : 'groomer').length ? store.staffBy(hosp ? 'vet' : 'groomer') : store.activeSellers).map((s) => `<option value="${s.id}" ${appt?.staffId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label>${hosp ? 'Costo estimado' : 'Precio'}</label><input class="input" data-p inputmode="decimal" placeholder="0,00"></div>
        </div>
        <div class="field"><label>${hosp ? 'Indicaciones / tratamiento' : 'Notas (estado del pelaje, nudos, pulgas…)'}</label><textarea class="input" rows="2" data-n></textarea></div>
        <div class="error-msg" data-err></div></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon(hosp ? 'bed' : 'scissors')} ${hosp ? 'Hospitalizar' : 'Recibir'}</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    let status = hosp ? 'internado' : 'recibido';
    const drawPet = () => {
      q('[data-pet]').innerHTML = pet ? `<div class="list-item box">${petAvatar(pet)}<div class="grow" style="min-width:0"><b>${esc(pet.name)}</b><div class="t-sub">${speciesOf(pet).label}${pet.breed ? ' · ' + esc(pet.breed) : ''}${pet.weight ? ` · ${pet.weight} kg` : ''} · ${esc(pet.ownerName || '')}</div>${alertsHTML(pet, true)}</div><button type="button" class="btn btn-ghost btn-sm" data-chg>${icon('refresh')}</button></div>`
        : `<button type="button" class="btn btn-secondary btn-block" data-chg>${icon('search')} Elegir mascota</button>`;
      q('[data-chg]').onclick = async () => { const p = await pickPet(); if (p) { pet = p; drawPet(); } };
    };
    drawPet();
    m.el.querySelectorAll('[data-s] [data-v]').forEach((b) => b.onclick = () => { status = b.dataset.v; m.el.querySelectorAll('[data-s] [data-v]').forEach((y) => y.classList.toggle('on', y === b)); });
    m.el.querySelectorAll('[data-sv] [data-v]').forEach((b) => b.onclick = () => {
      const v = b.dataset.v; svc.has(v) ? svc.delete(v) : svc.add(v); b.classList.toggle('on', svc.has(v));
      const tot = [...svc].reduce((a, s) => a + priceOf(s), 0);
      if (tot) q('[data-p]').value = String(tot).replace('.', ',');
    });
    q('[data-ok]').onclick = async (e) => {
      const err = q('[data-err]'); err.textContent = '';
      if (!pet) { err.textContent = 'Elige la mascota.'; return; }
      if (hosp && !q('[data-r]').value.trim()) { err.textContent = 'Escribe el motivo de ingreso.'; return; }
      if (!hosp && !svc.size) { err.textContent = 'Marca al menos un servicio.'; return; }
      setBusy(e.currentTarget, true);
      try {
        saved = await openStay({ kind, petId: pet.id, status, services: [...svc], notes: q('[data-n]').value, staffId: q('[data-st]').value || null, price: parseNum(q('[data-p]').value), apptId: appt?.id || null, reason: hosp ? q('[data-r]').value : '' });
        m.close(); toast(hosp ? `${pet.name} hospitalizado(a)` : `${pet.name} recibido(a) en peluquería`);
      } catch (ex) { err.textContent = ex.message; setBusy(e.currentTarget, false); }
    };
  });
}

function charge(s) { nav('vender', { clientId: s.ownerId, petId: s.petId, stayId: s.id }); }

function stayDetail(s0) {
  const hosp = s0.kind === 'hospital';
  const m = openModal({ title: '', size: 'md', body: '<div data-r></div>', footer: '<button class="btn btn-secondary" data-close>Cerrar</button>' });
  const off = store.on('stays', () => draw());
  const close0 = m.close; m.close = () => { off(); close0(); };
  function draw() {
    const s = store.stays.find((x) => x.id === s0.id);
    if (!s) { m.close(); return; }
    const p = store.pet(s.petId);
    const st = (hosp ? HOSP_STATUS : GROOM_STATUS)[s.status] || { label: s.status, tone: 'neutral' };
    m.el.querySelector('[data-r]').innerHTML = `<div class="mhead">${p ? petAvatar(p, 'avatar-lg') : ''}<div class="grow" style="min-width:0"><h2 class="mhead-name">${esc(s.petName)}</h2><div class="t-sub">${esc(s.ownerName || '')}${s.phone ? ' · ' + esc(s.phone) : ''} · ingresó ${fmtDateTime(s.inAt)}</div><div class="row row-wrap mt-xs" style="gap:4px"><span class="badge badge-${st.tone}">${st.label}</span>${s.price ? `<span class="badge badge-neutral">${usd(s.price)}</span>` : ''}${s.charged ? '<span class="badge badge-success">Cobrado</span>' : ''}</div>${p ? alertsHTML(p, true) : ''}</div></div>
      ${hosp ? `<div class="small mt"><b>Motivo:</b> ${esc(s.reason || '—')}</div>` : `<div class="small mt"><b>Servicios:</b> ${esc((s.services || []).join(', '))}</div>`}${s.notes ? `<div class="small"><b>${hosp ? 'Indicaciones' : 'Notas'}:</b> ${esc(s.notes)}</div>` : ''}
      <div class="section-title mt">${icon('history')} ${hosp ? 'Evolución' : 'Seguimiento'}</div>
      <div class="timeline">${(s.log || []).slice().reverse().map((l) => `<div class="tl-item"><span class="tl-dot"></span><div><b class="small">${esc(l.text)}</b><div class="t-sub">${fmtDateTime(l.at)}${l.by ? ' · ' + esc(String(l.by).split('@')[0]) : ''}</div></div></div>`).join('')}</div>
      <div class="row mt"><input class="input" data-note placeholder="${hosp ? 'Ej.: comió bien, temperatura 38,6 °C, se aplicó antibiótico' : 'Nota'}"><button class="btn btn-secondary" data-add>${icon('plus')}</button></div>
      <div class="row row-wrap mt" style="gap:6px">
        ${hosp ? Object.entries(HOSP_STATUS).filter(([k]) => k !== 'alta' && k !== s.status).map(([k, v]) => `<button class="btn btn-ghost btn-sm" data-st="${k}">${icon(v.icon)} ${v.label}</button>`).join('') : ''}
        ${hosp ? `<button class="btn btn-secondary btn-sm" data-o="cons">${icon('stethoscope')} Consulta</button><button class="btn btn-whatsapp btn-sm" data-o="parte">${icon('whatsapp')} Enviar parte</button>` : ''}
        ${!s.charged && s.price ? `<button class="btn btn-secondary btn-sm" data-o="charge">${icon('cart')} Cobrar</button>` : ''}
        <button class="btn btn-primary btn-sm" data-o="out">${icon('checkCircle')} ${hosp ? 'Dar de alta' : 'Entregar'}</button>
      </div>`;
    const R = m.el.querySelector('[data-r]');
    R.querySelector('[data-add]').onclick = async () => { const v = R.querySelector('[data-note]').value; if (!v.trim()) return; await addStayNote(s, v); toast('Nota agregada'); };
    R.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => setStayStatus(s, b.dataset.st, `Estado: ${HOSP_STATUS[b.dataset.st].label}`));
    R.querySelector('[data-o="cons"]')?.addEventListener('click', () => p && consultForm(p));
    R.querySelector('[data-o="parte"]')?.addEventListener('click', async () => { const last = (s.log || []).slice(-1)[0]?.text || ''; const t = await promptDialog({ title: 'Parte para el tutor', label: '¿Cómo sigue?', value: last, confirmText: 'Abrir WhatsApp' }); if (t) waClient('hospital', { client: store.client(s.ownerId), pet: p, stay: s, extra: t }); });
    R.querySelector('[data-o="charge"]')?.addEventListener('click', () => { m.close(); charge(s); });
    R.querySelector('[data-o="out"]').onclick = () => { m.close(); checkout(s); };
  }
  draw();
}

async function checkout(s) {
  const hosp = s.kind === 'hospital';
  let text = '';
  if (hosp) { text = await promptDialog({ title: 'Alta médica', label: 'Indicaciones para la casa (opcional)', value: '', confirmText: 'Dar de alta' }); if (text == null) return; }
  else if (!(await confirmDialog({ title: 'Entregar', message: `¿${esc(s.petName)} ya se fue con su tutor?${!s.charged && s.price ? `<br><b>Aún no se ha cobrado (${usd(s.price)}).</b>` : ''}`, confirmText: 'Entregado' }))) return;
  await closeStay(s, { text: hosp ? `Alta médica${text ? ': ' + text : ''}` : '' });
  toast(hosp ? 'Alta registrada' : 'Entregado');
  if (hosp && s.phone) waClient('alta', { client: store.client(s.ownerId), pet: store.pet(s.petId), stay: s, extra: text });
  if (!s.charged && s.price && await confirmDialog({ title: 'Cobrar ahora', message: `Falta cobrar ${usd(s.price)}.`, confirmText: 'Ir a cobrar', cancelText: 'Después' })) charge(s);
}

export function mount(el, { params = {} }) {
  let tab = params.tab === 'hospital' ? 'hospital' : 'peluqueria';
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">En la clínica</h1><p class="view-sub" id="s-sub"></p></div>
    <div class="view-actions"><button class="btn btn-primary" id="s-new">${icon('plus')} Recibir</button></div></div>
    <div class="tabs" id="s-tabs"><button data-t="peluqueria">${icon('scissors')} Peluquería <span class="count" id="s-c1"></span></button><button data-t="hospital">${icon('bed')} Hospitalización <span class="count" id="s-c2"></span></button></div>
    <div id="s-body" class="mt"></div>`;
  const $ = (s) => el.querySelector(s);
  function draw() {
    el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    $('#s-c1').textContent = store.grooming.length; $('#s-c2').textContent = store.hospitalized.length;
    $('#s-sub').textContent = `${store.grooming.length} en peluquería · ${store.hospitalized.length} hospitalizado(s)`;
    $('#s-new').innerHTML = `${icon('plus')} ${tab === 'hospital' ? 'Hospitalizar' : 'Recibir en peluquería'}`;
    if (tab === 'peluqueria') {
      const cols = GROOM_FLOW.filter((k) => k !== 'entregado');
      $('#s-body').innerHTML = `<div class="kanban" data-tour="groom">${cols.map((k) => { const list = store.grooming.filter((s) => s.status === k); return `<div class="kcol"><div class="kcol-head"><span class="badge badge-${GROOM_STATUS[k].tone}">${icon(GROOM_STATUS[k].icon)} ${GROOM_STATUS[k].label}</span><span class="count">${list.length}</span></div>${list.map((s) => { const p = store.pet(s.petId); const i = GROOM_FLOW.indexOf(s.status); const nx = GROOM_FLOW[i + 1]; return `<div class="kcard"><button class="kcard-main" data-d="${s.id}">${p ? petAvatar(p) : ''}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(s.petName)}</b><div class="t-sub ellipsis">${esc((s.services || []).join(', '))}</div><div class="t-sub">${fmtTime(s.inAt)} · ${fmtAgo(s.inAt)}${s.staffName ? ' · ' + esc(s.staffName) : ''}</div></div></button>
        <div class="row" style="gap:4px">${nx === 'entregado' ? `<button class="btn btn-primary btn-sm grow" data-out="${s.id}">${icon('checkCircle')} Entregar</button>` : `<button class="btn btn-secondary btn-sm grow" data-nx="${s.id}" data-v="${nx}">${icon(GROOM_STATUS[nx].icon)} ${GROOM_STATUS[nx].label}</button>`}${s.status === 'listo' && s.phone ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-wa="${s.id}" title="Avisar que está listo">${icon('whatsapp')}</button>` : ''}</div></div>`; }).join('') || '<div class="kempty">—</div>'}</div>`; }).join('')}</div>`;
    } else {
      const list = store.hospitalized;
      $('#s-body').innerHTML = list.length ? `<div class="grid-cards" data-tour="hosp">${list.map((s) => { const p = store.pet(s.petId); const st = HOSP_STATUS[s.status] || HOSP_STATUS.internado; const last = (s.log || []).slice(-1)[0]; return `<button class="card hosp-card st-${s.status}" data-d="${s.id}"><div class="row">${p ? petAvatar(p, 'avatar-lg') : ''}<div class="grow" style="min-width:0"><b>${esc(s.petName)}</b><div class="t-sub">${esc(s.ownerName || '')}</div></div><span class="badge badge-${st.tone}">${st.label}</span></div><div class="small mt-xs"><b>${esc(s.reason || '')}</b></div>${last ? `<div class="t-sub mt-xs ellipsis">${icon('history')} ${esc(last.text)} · ${fmtAgo(last.at)}</div>` : ''}<div class="t-sub">Ingresó ${fmtDateTime(s.inAt)}${s.staffName ? ' · ' + esc(s.staffName) : ''}</div></button>`; }).join('')}</div>`
        : emptyState('bed', 'Nadie hospitalizado', 'Interna una mascota para llevar su evolución y enviar partes al tutor.');
    }
    el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => stayDetail(store.stays.find((s) => s.id === b.dataset.d)));
    el.querySelectorAll('[data-nx]').forEach((b) => b.onclick = async () => {
      const s = store.stays.find((x) => x.id === b.dataset.nx); const v = b.dataset.v;
      await setStayStatus(s, v, GROOM_STATUS[v].label);
      if (v === 'listo' && s.phone && await confirmDialog({ title: `${esc(s.petName)} está listo(a)`, message: '¿Le avisas al tutor por WhatsApp?', confirmText: 'Avisar' })) waClient('peluqueria_lista', { client: store.client(s.ownerId), pet: store.pet(s.petId), stay: s });
    });
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const s = store.stays.find((x) => x.id === b.dataset.wa); waClient('peluqueria_lista', { client: store.client(s.ownerId), pet: store.pet(s.petId), stay: s }); });
    el.querySelectorAll('[data-out]').forEach((b) => b.onclick = () => checkout(store.stays.find((x) => x.id === b.dataset.out)));
  }
  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  $('#s-new').onclick = () => stayForm(tab);
  draw();
  const off = store.on('*', (evt) => { if (evt === 'stays' || evt === 'pets') draw(); });
  return () => off();
}
export { openPet };
