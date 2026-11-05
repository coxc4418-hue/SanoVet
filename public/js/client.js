// SanoVet — Tutores y mascotas: buscadores, formularios, ficha clínica (consultas, vacunas, desparasitación, peso), récipe y carnet
import { store, clientBadge } from './store.js';
import {
  saveClient, setClientActive, savePet, setPetActive, renewCardCode, cardUrl, payBalance, adjustPoints,
  addVaccine, removeVaccine, addDeworm, removeDeworm, saveConsult, markReminded
} from './ops.js';
import {
  SPECIES, speciesOf, BREEDS, PET_SEX, COATS, petAge, PET_ALLERGIES, PET_CONDITIONS, TEMPERAMENTS, DEWORM, latestBy, dueItems, dueTone, dueText, kindLabel,
  VITALS, MUCOSA, HYDRATION, vitalFlag, CONSULT_TYPES, ROUTES_ADM, FREQS, DX_QUICK, SERVICES, apptBadge, productLine, searchText, rxBadge, packFactor, packPrice, unitCost, upb
} from './vet.js';
import { openModal, esc, usd, toast, setBusy, fmtDate, fmtDateTime, todayKey, dayKey, addDays, loc, normalize, debounce, initials, colorFor, confirmDialog, promptDialog, emptyState, printHTML, num, parseNum, compressImage, round2 } from './utils.js';
import { icon } from './icons.js';
import { qrDataURL, waClient, printReceipt, PRINT_HEAD } from './shared.js';
import { requirePin } from './auth.js';

const nav = async (route, params = {}) => { const { navigate } = await import('./main.js'); navigate(route, { params, force: true }); };
const inDays = (n) => dayKey(addDays(new Date(), n));

// ======================================================================
// PIEZAS VISUALES
// ======================================================================
export function avatar(c, size = '') { return `<span class="avatar ${size}" style="background:${colorFor(c?.name)}">${esc(initials(c?.name))}</span>`; }
export function hydratePhotos() {}
/** Foto de la mascota o su emoji sobre el color de la especie */
export function petAvatar(p, size = '') {
  const sp = speciesOf(p);
  if (p?.photo) return `<span class="avatar pet-av ${size}"><img src="${esc(p.photo)}" alt=""></span>`;
  return `<span class="avatar pet-av ${size}" style="background:${sp.color}22;color:${sp.color}"><span class="pet-emoji">${sp.emoji}</span></span>`;
}
export const petLine = (p) => [speciesOf(p).label, p?.breed, p?.sex ? PET_SEX[p.sex] : '', petAge(p?.birthDate), Number(p?.weight) ? `${num(p.weight, p.weight % 1 ? 1 : 0)} kg` : ''].filter(Boolean).join(' · ');
export const clientLine = (c) => {
  const pets = store.petsOf(c?.id);
  const bits = [];
  if (pets.length) bits.push(pets.map((p) => `${speciesOf(p).emoji} ${p.name}`).join(', '));
  if (c?.lastVisitAt) bits.push(`última visita ${fmtDate(c.lastVisitAt)}`);
  else if (!pets.length) bits.push('sin mascotas registradas');
  return esc(bits.join(' · '));
};
/** Alergias, condiciones y temperamento de la mascota */
export function alertsHTML(p, compact = false) {
  const al = (p?.allergies || []).filter(Boolean); const co = (p?.conditions || []).filter(Boolean);
  const bite = p?.temperament === 'agresivo';
  if (!al.length && !co.length && !bite) return '';
  if (compact && !al.length && !bite) return '';
  return `<div class="row row-wrap" style="gap:4px">${bite ? `<span class="badge badge-danger">${icon('alert')} Muerde: usar bozal</span>` : ''}${al.map((a) => `<span class="badge badge-danger">${icon('alert')} Alergia: ${esc(a)}</span>`).join('')}${compact ? '' : co.map((a) => `<span class="badge badge-info">${esc(a)}</span>`).join('')}</div>`;
}
export function pointsHTML(c) {
  const L = store.loyalty;
  if (!L?.enabled) return '';
  const pts = Math.floor(Number(c?.points) || 0);
  return `<span class="badge badge-violet">${icon('star')} ${pts} pts${L.pointValue ? ` · ${usd(pts * L.pointValue)}` : ''}</span>`;
}
/** Insignia del plan sanitario: lo más urgente */
export function dueBadge(p) {
  const it = dueItems(p)[0];
  if (!it) return '<span class="badge badge-neutral">Sin plan sanitario</span>';
  return `<span class="badge badge-${dueTone(it.d)}">${it.kind === 'vacuna' ? icon('syringe') : icon(DEWORM[it.kind]?.icon || 'pill')} ${esc(it.name.split(' (')[0])}: ${dueText(it.d)}</span>`;
}
/** Mini gráfico del peso */
export function weightChart(p, w = 280, h = 70) {
  const list = (p?.weights || []).slice(-12);
  if (list.length < 2) return '';
  const vals = list.map((x) => Number(x.kg) || 0);
  const mn = Math.min(...vals), mx = Math.max(...vals); const span = mx - mn || 1;
  const X = (i) => (i / (vals.length - 1)) * (w - 16) + 8; const Y = (v) => h - 10 - ((v - mn) / span) * (h - 24);
  return `<svg class="wchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Evolución del peso"><polyline points="${vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="var(--brand)"><title>${fmtDate(list[i].date)}: ${num(v, 1)} kg</title></circle>`).join('')}</svg>
    <div class="between t-sub"><span>${fmtDate(list[0].date)} · ${num(vals[0], 1)} kg</span><span>${fmtDate(list[list.length - 1].date)} · <b>${num(vals[vals.length - 1], 1)} kg</b></span></div>`;
}

// ======================================================================
// BUSCAR TUTOR / MASCOTA
// ======================================================================
const ownerMatch = (x, t, d) => !t || normalize(`${x.name} ${x.number || ''} ${x.idDoc || ''} ${store.petsOf(x.id).map((p) => p.name).join(' ')}`).includes(t) || (d.length >= 3 && (String(x.phone || '').replace(/\D/g, '').includes(d) || String(x.idDoc || '').replace(/\D/g, '').includes(d)));
export function pickClient({ title = 'Buscar tutor', allowNew = true } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><label class="search search-big">${icon('search')}<input data-q placeholder="Tutor, mascota, cédula o teléfono…" autocomplete="off" autofocus></label><div class="pick-list" data-l></div></div>`,
      footer: `${allowNew ? `<button class="btn btn-secondary" data-new style="margin-right:auto">${icon('userPlus')} Tutor nuevo</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button>`,
      onClose: () => resolve(picked)
    });
    const draw = (q = '') => {
      const t = normalize(q); const d = q.replace(/\D/g, '');
      const list = store.clients.filter((x) => x.active !== false && ownerMatch(x, t, d)).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((x) => `<button type="button" class="list-item" data-id="${x.id}">${avatar(x)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(x.name)}</b><div class="t-sub ellipsis">${esc(x.number)}${x.phone ? ' · ' + esc(x.phone) : ''}</div><div class="t-sub ellipsis">${clientLine(x)}</div></div></button>`).join('')
        : emptyState('users', t ? 'Sin resultados' : 'Aún no hay tutores', allowNew ? 'Regístralo con “Tutor nuevo”.' : '');
      m.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = store.client(b.dataset.id); m.close(); });
    };
    m.el.querySelector('[data-q]').oninput = debounce((e) => draw(e.target.value), 80);
    m.el.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') { const f = store.findClient(e.target.value); if (f) { picked = f; m.close(); } } };
    const nb = m.el.querySelector('[data-new]');
    if (nb) nb.onclick = async () => { const q = m.el.querySelector('[data-q]').value.trim(); const isNum = /\d{6,}/.test(q); const r = await clientForm(null, { name: isNum ? '' : q, phone: isNum ? q : '' }); if (r) { picked = r; m.close(); } };
    draw();
  });
}
export function pickPet({ title = 'Buscar mascota', allowNew = true, ownerId = null } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({
      title, size: 'md',
      body: `<div class="stack"><label class="search search-big">${icon('search')}<input data-q placeholder="Mascota, tutor, teléfono o microchip…" autocomplete="off" autofocus></label><div class="pick-list" data-l></div></div>`,
      footer: `${allowNew ? `<button class="btn btn-secondary" data-new style="margin-right:auto">${icon('plus')} Mascota nueva</button>` : ''}<button class="btn btn-secondary" data-close>Cancelar</button>`,
      onClose: () => resolve(picked)
    });
    const draw = (q = '') => {
      const t = normalize(q); const d = q.replace(/\D/g, '');
      const list = store.pets.filter((p) => p.active !== false && !p.deceased && (!ownerId || p.ownerId === ownerId) && (!t || normalize(`${p.name} ${p.ownerName || ''} ${p.breed || ''} ${p.number || ''} ${p.chip || ''} ${p.cardCode || ''}`).includes(t) || (d.length >= 4 && String(p.ownerPhone || '').replace(/\D/g, '').includes(d)))).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.length ? list.map((p) => `<button type="button" class="list-item" data-id="${p.id}">${petAvatar(p)}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b> <span class="t-sub">${esc(p.number || '')}</span><div class="t-sub ellipsis">${esc(petLine(p))}</div><div class="t-sub ellipsis">${icon('user')} ${esc(p.ownerName || '')}${p.ownerPhone ? ' · ' + esc(p.ownerPhone) : ''}</div>${alertsHTML(p, true)}</div></button>`).join('')
        : emptyState('paw', t ? 'Sin resultados' : 'Aún no hay mascotas', allowNew ? 'Regístrala con “Mascota nueva”.' : '');
      m.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = store.pet(b.dataset.id); m.close(); });
    };
    m.el.querySelector('[data-q]').oninput = debounce((e) => draw(e.target.value), 80);
    m.el.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') { const f = store.findPet(e.target.value); if (f) { picked = f; m.close(); } } };
    const nb = m.el.querySelector('[data-new]');
    if (nb) nb.onclick = async () => { const r = await petForm(null, { owner: ownerId ? store.client(ownerId) : null, name: m.el.querySelector('[data-q]').value.trim() }); if (r) { picked = r.pet; m.close(); } };
    draw();
  });
}

// ======================================================================
// FORMULARIO DEL TUTOR
// ======================================================================
export function clientForm(client = null, preset = {}) {
  const x = { ...preset, ...(client || {}) };
  return new Promise((resolve) => {
    let saved = null;
    const m = openModal({
      title: client ? 'Editar tutor' : 'Nuevo tutor', sub: client ? esc(client.number) : 'El dueño o responsable de la mascota. Con nombre y teléfono basta.', size: 'md',
      body: `<form data-f autocomplete="off"><div class="form-grid">
          <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(x.name || '')}" autofocus></div>
          <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" inputmode="tel" value="${esc(x.phone || '')}" placeholder="Para recordarle vacunas y citas"></div>
          <div class="field"><label>${esc(loc().id)}</label><input class="input" name="idDoc" value="${esc(x.idDoc || '')}" placeholder="Para facturas y récipes"></div>
          <div class="field"><label>Otro teléfono</label><input class="input" name="phone2" inputmode="tel" value="${esc(x.phone2 || '')}"></div>
          <div class="field"><label>Correo</label><input class="input" name="email" inputmode="email" value="${esc(x.email || '')}"></div>
          <div class="field full"><label>Dirección (para domicilio o delivery)</label><input class="input" name="address" value="${esc(x.address || '')}"></div>
          ${store.activeAgreements.length ? `<div class="field"><label>Plan de salud / convenio</label><select class="select" name="agreementId"><option value="">Ninguno</option>${store.activeAgreements.map((a) => `<option value="${a.id}" ${x.agreementId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>N° de afiliado</label><input class="input" name="agreementNumber" value="${esc(x.agreementNumber || '')}"></div>` : ''}
          <div class="field"><label>¿Cómo nos conoció?</label><select class="select" name="howFound">${['', 'Recomendación', 'Instagram', 'Facebook', 'Google Maps', 'Pasó por el frente', 'Otro'].map((v) => `<option ${x.howFound === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field full"><label>Notas</label><input class="input" name="notes" value="${esc(x.notes || '')}" placeholder="Ej.: prefiere que lo llamen en la tarde"></div>
        </div><div class="error-msg mt" data-err></div></form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${client ? 'Guardar' : 'Registrar tutor'}</button>`,
      onClose: () => resolve(saved)
    });
    const F = m.el.querySelector('[data-f]').elements;
    m.el.querySelector('[data-f]').onsubmit = (e) => { e.preventDefault(); m.el.querySelector('[data-ok]').click(); };
    m.el.querySelector('[data-ok]').onclick = async (e) => {
      const err = m.el.querySelector('[data-err]'); err.textContent = '';
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre del tutor.'; F.name.focus(); return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
      const data = { name: F.name.value, phone: F.phone.value, idDoc: F.idDoc.value, phone2: F.phone2.value, email: F.email.value, address: F.address.value, howFound: F.howFound.value, notes: F.notes.value, agreementId: F.agreementId?.value || '', agreementNumber: F.agreementNumber?.value || '' };
      try { saved = await saveClient(data, client?.id || null); m.close(); toast(client ? 'Tutor actualizado' : `Tutor registrado: ${saved.number}`); }
      catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

// ======================================================================
// FORMULARIO DE LA MASCOTA
// ======================================================================
export function petForm(pet = null, { owner = null, name = '' } = {}) {
  const x = { species: 'perro', ...(pet || {}), ...(pet ? {} : { name }) };
  return new Promise((resolve) => {
    let saved = null; let photo = x.photo || ''; let species = x.species || 'perro';
    let own = pet ? store.client(pet.ownerId) : owner;
    const al = new Set(x.allergies || []); const co = new Set(x.conditions || []);
    const m = openModal({
      title: pet ? `Editar a ${esc(pet.name)}` : 'Nueva mascota', sub: pet ? esc(pet.number) : 'Ficha del paciente. Lo esencial: nombre, especie y tutor.', size: 'lg',
      body: `<form data-f autocomplete="off">
        <div class="pet-form-top">
          <label class="pet-photo" title="Foto de la mascota"><input type="file" accept="image/*" data-ph hidden><span data-phv>${photo ? `<img src="${esc(photo)}" alt="">` : `${icon('camera')}<small>Foto</small>`}</span></label>
          <div class="grow stack" style="gap:10px">
            <div class="field"><label>Nombre *</label><input class="input input-lg" name="name" value="${esc(x.name || '')}" autofocus placeholder="Ej.: Max"></div>
            <div class="chips chips-wrap" data-sp>${Object.entries(SPECIES).map(([k, v]) => `<button type="button" class="chip ${k === species ? 'on' : ''}" data-v="${k}">${v.emoji} ${v.label}</button>`).join('')}</div>
          </div>
        </div>
        <div class="section-title mt">${icon('user')} Tutor</div>
        <div data-own></div>
        <div class="form-grid mt">
          <div class="field"><label>Raza</label><input class="input" name="breed" list="breeds-dl" value="${esc(x.breed || '')}" placeholder="Mestizo"><datalist id="breeds-dl"></datalist></div>
          <div class="field"><label>Sexo</label><div class="seg seg-block" data-sex>${Object.entries(PET_SEX).map(([k, v]) => `<button type="button" data-v="${k}" class="${x.sex === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
          <div class="field"><label>Fecha de nacimiento</label><input class="input" type="date" name="birthDate" value="${esc(x.birthDate || '')}"><span class="hint">¿No la sabe? <button type="button" class="linkish" data-age>Calcular por edad</button></span></div>
          <div class="field"><label>Peso (kg)</label><input class="input" name="weight" inputmode="decimal" value="${x.weight ? esc(num(x.weight, x.weight % 1 ? 1 : 0)) : ''}"></div>
          <div class="field"><label>Color / pelaje</label><input class="input" name="color" list="coats-dl" value="${esc(x.color || '')}"><datalist id="coats-dl">${COATS.map((c) => `<option value="${c}">`).join('')}</datalist></div>
          <div class="field"><label>Microchip</label><input class="input" name="chip" value="${esc(x.chip || '')}" inputmode="numeric"></div>
          <div class="field"><label>Temperamento</label><select class="select" name="temperament"><option value="">—</option>${Object.entries(TEMPERAMENTS).map(([k, v]) => `<option value="${k}" ${x.temperament === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Alimentación</label><input class="input" name="diet" value="${esc(x.diet || '')}" placeholder="Ej.: Royal Canin Mini Adult"></div>
          <label class="check full"><input type="checkbox" name="neutered" ${x.neutered ? 'checked' : ''}> <span>Esterilizado(a) / castrado(a)</span></label>
        </div>
        <div class="section-title mt-lg">${icon('alert')} Alergias</div>
        <div class="chips chips-wrap" data-al>${[...new Set([...PET_ALLERGIES, ...al])].map((c) => `<button type="button" class="chip ${al.has(c) ? 'on chip-danger' : ''}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="row mt-xs"><input class="input input-sm" data-al-new placeholder="Otra alergia…" style="max-width:260px"><button type="button" class="btn btn-secondary btn-sm" data-al-add>${icon('plus')}</button></div>
        <div class="section-title mt">${icon('heart')} Condiciones crónicas</div>
        <div class="chips chips-wrap" data-co>${[...new Set([...PET_CONDITIONS, ...co])].map((c) => `<button type="button" class="chip ${co.has(c) ? 'on' : ''}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="field mt"><label>Notas</label><input class="input" name="notes" value="${esc(x.notes || '')}" placeholder="Ej.: le dan miedo los secadores"></div>
        <div class="error-msg mt" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} ${pet ? 'Guardar' : 'Registrar mascota'}</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const F = q('[data-f]').elements;
    let sex = x.sex || '';
    const drawOwner = () => {
      q('[data-own]').innerHTML = own?.id ? `<div class="list-item box">${avatar(own)}<div class="grow" style="min-width:0"><b>${esc(own.name)}</b><div class="t-sub">${esc(own.number || '')}${own.phone ? ' · ' + esc(own.phone) : ''}</div></div><button type="button" class="btn btn-ghost btn-sm" data-chg>${icon('refresh')} Cambiar</button></div>`
        : `<div class="form-grid"><div class="field"><label>Nombre del tutor *</label><input class="input" data-on value="${esc(own?.name || '')}"></div><div class="field"><label>Teléfono / WhatsApp</label><input class="input" data-op inputmode="tel" value="${esc(own?.phone || '')}"></div></div><button type="button" class="btn btn-ghost btn-sm mt-xs" data-chg>${icon('search')} Elegir un tutor registrado</button>`;
      q('[data-chg]').onclick = async () => { const c = await pickClient({ title: 'Tutor de la mascota' }); if (c) { own = c; drawOwner(); } };
    };
    const drawBreeds = () => { q('#breeds-dl').innerHTML = (BREEDS[species] || []).map((b) => `<option value="${esc(b)}">`).join(''); };
    m.el.querySelectorAll('[data-sp] [data-v]').forEach((b) => b.onclick = () => { species = b.dataset.v; m.el.querySelectorAll('[data-sp] [data-v]').forEach((y) => y.classList.toggle('on', y === b)); drawBreeds(); });
    m.el.querySelectorAll('[data-sex] [data-v]').forEach((b) => b.onclick = () => { sex = b.dataset.v; m.el.querySelectorAll('[data-sex] [data-v]').forEach((y) => y.classList.toggle('on', y === b)); });
    const chipSet = (sel, set, cls = '') => m.el.querySelectorAll(`${sel} [data-v]`).forEach((b) => b.onclick = () => { const v = b.dataset.v; set.has(v) ? set.delete(v) : set.add(v); b.classList.toggle('on', set.has(v)); if (cls) b.classList.toggle(cls, set.has(v)); });
    chipSet('[data-al]', al, 'chip-danger'); chipSet('[data-co]', co);
    q('[data-al-add]').onclick = () => { const i = q('[data-al-new]'); const v = i.value.trim(); if (!v) return; al.add(v); i.value = ''; q('[data-al]').insertAdjacentHTML('beforeend', `<button type="button" class="chip on chip-danger" data-v="${esc(v)}">${esc(v)}</button>`); chipSet('[data-al]', al, 'chip-danger'); };
    q('[data-age]').onclick = async () => {
      const v = await promptDialog({ title: 'Edad aproximada', label: 'Años (ej.: 3 o 0,5 para seis meses)', value: '', confirmText: 'Calcular' });
      const n = parseNum(v); if (!(n > 0)) return;
      F.birthDate.value = dayKey(addDays(new Date(), -Math.round(n * 365.25)));
    };
    q('[data-ph]').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { photo = await compressImage(f, 320, 0.74); q('[data-phv]').innerHTML = `<img src="${photo}" alt="">`; } catch (_) { toast('No se pudo leer la imagen', 'warning'); }
    };
    drawOwner(); drawBreeds();
    q('[data-f]').onsubmit = (e) => { e.preventDefault(); q('[data-ok]').click(); };
    q('[data-ok]').onclick = async (e) => {
      const err = q('[data-err]'); err.textContent = '';
      if (!F.name.value.trim()) { err.textContent = 'Escribe el nombre de la mascota.'; F.name.focus(); return; }
      const ow = own?.id ? own : { name: q('[data-on]')?.value || '', phone: q('[data-op]')?.value || '' };
      if (!pet && !String(ow.name || '').trim()) { err.textContent = 'Escribe el nombre del tutor o elige uno registrado.'; q('[data-on]')?.focus(); return; }
      const btn = e.currentTarget; setBusy(btn, true, 'Guardando…');
      const data = { name: F.name.value, species, breed: F.breed.value, sex, birthDate: F.birthDate.value, weight: parseNum(F.weight.value), color: F.color.value, chip: F.chip.value, temperament: F.temperament.value, diet: F.diet.value, neutered: F.neutered.checked, allergies: [...al], conditions: [...co], notes: F.notes.value, photo };
      try {
        saved = await savePet(data, pet?.id || null, pet ? (own?.id && own.id !== pet.ownerId ? own : null) : ow);
        m.close(); toast(pet ? 'Mascota actualizada' : `${saved.pet.name} registrado(a): ${saved.pet.number}`);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
  });
}

// ======================================================================
// PRODUCTOS (para récipe, cargos y vacunas)
// ======================================================================
export function pickProduct({ title = 'Buscar producto', filter = null } = {}) {
  return new Promise((resolve) => {
    let picked = null;
    const m = openModal({ title, size: 'md', body: `<div class="stack"><label class="search search-big">${icon('search')}<input data-q placeholder="Nombre, componente o código…" autofocus autocomplete="off"></label><div class="pick-list" data-l></div></div>`, footer: '<button class="btn btn-secondary" data-close>Cancelar</button>', onClose: () => resolve(picked) });
    const draw = (q = '') => {
      const t = normalize(q);
      const exact = store.byBarcode(q);
      const list = (exact ? [exact] : store.products.filter((p) => p.active !== false && (!filter || filter(p)) && (!t || searchText(p).includes(t)))).slice(0, 40);
      m.el.querySelector('[data-l]').innerHTML = list.map((p) => `<button type="button" class="list-item" data-id="${p.id}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(p.trackStock === false ? 'stethoscope' : /vacun/i.test(p.category || '') ? 'syringe' : 'pill')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b><div class="t-sub ellipsis">${esc(productLine(p) || p.category || '')}</div></div>${rxBadge(p, true)}<b class="num">${usd(p.price)}</b></button>`).join('') || emptyState('box', 'Sin resultados');
      m.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { picked = store.product(b.dataset.id); m.close(); });
    };
    m.el.querySelector('[data-q]').oninput = debounce((e) => draw(e.target.value), 80);
    draw();
  });
}

// ======================================================================
// VACUNAS Y DESPARASITACIÓN
// ======================================================================
export function vaccineForm(pet, v0 = null) {
  return new Promise((resolve) => {
    let saved = null;
    const cat = store.vaccinesFor(pet.species);
    const vacProducts = store.products.filter((p) => p.active !== false && (p.vaccine || /vacun/i.test(p.category || '')) && (Number(p.stock) || 0) > 0);
    const m = openModal({
      title: v0 ? 'Editar vacuna' : 'Aplicar vacuna', sub: `${speciesOf(pet).emoji} ${esc(pet.name)} · queda en su carnet con la fecha del refuerzo`, size: 'md',
      body: `<div class="stack">
        ${v0 ? '' : `<div class="chips chips-wrap" data-cat>${cat.map((c) => `<button type="button" class="chip" data-id="${c.id}">${icon('syringe')} ${esc(c.name)}</button>`).join('')}</div>`}
        <div class="form-grid">
          <div class="field full"><label>Vacuna *</label><input class="input" data-n value="${esc(v0?.name || '')}" placeholder="Ej.: Séxtuple canina"></div>
          <div class="field"><label>Fecha de aplicación</label><input class="input" type="date" data-d value="${esc(v0?.date || todayKey())}"></div>
          <div class="field"><label>Próximo refuerzo</label><input class="input" type="date" data-nx value="${esc(v0?.next || '')}"><div class="chips mt-xs">${[[21, '21 d'], [30, '1 mes'], [180, '6 meses'], [365, '1 año']].map(([d, l]) => `<button type="button" class="chip chip-sm" data-dd="${d}">${l}</button>`).join('')}</div></div>
          ${v0 ? '' : `<div class="field full"><label>Del inventario (descuenta 1 dosis)</label><select class="select" data-p><option value="">No descontar</option>${vacProducts.map((p) => `<option value="${p.id}">${esc(p.name)} · ${esc(String(p.stock))} disp.</option>`).join('')}</select></div>`}
          <div class="field"><label>Lote</label><input class="input" data-l value="${esc(v0?.lot || '')}"></div>
          <div class="field"><label>Aplicada por</label><select class="select" data-v>${store.vets.map((s) => `<option value="${s.id}" ${v0?.vetId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="">Otro / externo</option></select></div>
          <div class="field full"><label>Nota</label><input class="input" data-no value="${esc(v0?.note || '')}" placeholder="Ej.: leve dolor en el sitio"></div>
        </div><div class="error-msg" data-err></div></div>`,
      footer: `${v0 ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Quitar</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const setNext = (days) => { const d = q('[data-d]').value || todayKey(); q('[data-nx]').value = dayKey(addDays(new Date(d + 'T12:00:00'), Number(days))); };
    m.el.querySelectorAll('[data-dd]').forEach((b) => b.onclick = () => setNext(b.dataset.dd));
    m.el.querySelectorAll('[data-cat] [data-id]').forEach((b) => b.onclick = () => {
      const c = cat.find((x) => x.id === b.dataset.id); q('[data-n]').value = c.name; setNext(c.everyDays || 365);
      m.el.querySelectorAll('[data-cat] [data-id]').forEach((y) => y.classList.toggle('on', y === b));
      const prod = vacProducts.find((p) => normalize(p.name).includes(normalize(c.name).split(' ')[0]));
      if (prod && q('[data-p]')) q('[data-p]').value = prod.id;
    });
    q('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try {
        saved = await addVaccine(store.pet(pet.id) || pet, { id: v0?.id, name: q('[data-n]').value, date: q('[data-d]').value, next: q('[data-nx]').value, lot: q('[data-l]').value, vetId: q('[data-v]').value || null, productId: q('[data-p]')?.value || v0?.productId || null, note: q('[data-no]').value });
        m.close(); toast(`Vacuna registrada en el carnet de ${pet.name}`);
      } catch (ex) { q('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    q('[data-del]')?.addEventListener('click', async () => { await removeVaccine(store.pet(pet.id) || pet, v0.id); saved = { removed: true }; m.close(); toast('Vacuna quitada', 'warning'); });
  });
}
export function dewormForm(pet, d0 = null, kind0 = 'interna') {
  return new Promise((resolve) => {
    let saved = null; let kind = d0?.kind || kind0;
    const m = openModal({
      title: d0 ? 'Editar desparasitación' : 'Desparasitar', sub: `${speciesOf(pet).emoji} ${esc(pet.name)}${pet.weight ? ` · ${num(pet.weight, 1)} kg` : ''}`, size: 'md',
      body: `<div class="stack"><div class="seg seg-block" data-k>${Object.entries(DEWORM).map(([k, v]) => `<button type="button" data-v="${k}" class="${kind === k ? 'on' : ''}">${icon(v.icon)} ${v.label}</button>`).join('')}</div>
        <div class="form-grid">
          <div class="field full"><label>Producto *</label><input class="input" data-p list="dw-dl" value="${esc(d0?.product || '')}" placeholder="Ej.: Drontal Plus / NexGard"><datalist id="dw-dl">${store.products.filter((p) => /antiparas/i.test(p.category || '')).map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist></div>
          <div class="field"><label>Dosis</label><input class="input" data-ds value="${esc(d0?.dose || '')}" placeholder="Ej.: 1 tableta"></div>
          <div class="field"><label>Peso (kg)</label><input class="input" data-w inputmode="decimal" value="${esc(String(d0?.weight || pet.weight || '').replace('.', ','))}"></div>
          <div class="field"><label>Fecha</label><input class="input" type="date" data-d value="${esc(d0?.date || todayKey())}"></div>
          <div class="field"><label>Próxima</label><input class="input" type="date" data-nx value="${esc(d0?.next || '')}"><div class="chips mt-xs">${[[30, '1 mes'], [60, '2 meses'], [90, '3 meses'], [180, '6 meses']].map(([d, l]) => `<button type="button" class="chip chip-sm" data-dd="${d}">${l}</button>`).join('')}</div></div>
        </div><div class="error-msg" data-err></div></div>`,
      footer: `${d0 ? `<button class="btn btn-ghost text-danger" data-del>${icon('trash')} Quitar</button>` : ''}<span class="grow"></span><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
      onClose: () => resolve(saved)
    });
    const q = (s) => m.el.querySelector(s);
    const setNext = (days) => { const d = q('[data-d]').value || todayKey(); q('[data-nx]').value = dayKey(addDays(new Date(d + 'T12:00:00'), Number(days))); };
    m.el.querySelectorAll('[data-k] [data-v]').forEach((b) => b.onclick = () => { kind = b.dataset.v; m.el.querySelectorAll('[data-k] [data-v]').forEach((y) => y.classList.toggle('on', y === b)); if (!d0) setNext(DEWORM[kind].everyDays); });
    m.el.querySelectorAll('[data-dd]').forEach((b) => b.onclick = () => setNext(b.dataset.dd));
    if (!d0) setNext(DEWORM[kind].everyDays);
    q('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try { saved = await addDeworm(store.pet(pet.id) || pet, { id: d0?.id, kind, product: q('[data-p]').value, dose: q('[data-ds]').value, weight: parseNum(q('[data-w]').value), date: q('[data-d]').value, next: q('[data-nx]').value }); m.close(); toast('Desparasitación registrada'); }
      catch (ex) { q('[data-err]').textContent = ex.message; setBusy(e.currentTarget, false); }
    };
    q('[data-del]')?.addEventListener('click', async () => { await removeDeworm(store.pet(pet.id) || pet, d0.id); saved = { removed: true }; m.close(); toast('Registro quitado', 'warning'); });
  });
}

// ======================================================================
// CONSULTA (historia clínica)
// ======================================================================
/** Abre la consulta de una mascota. appt: cita de la agenda (opcional). c0: consulta existente para editar. */
export function consultForm(pet0, { appt = null, c0 = null } = {}) {
  return new Promise((resolve) => {
    let saved = null;
    const pet = store.pet(pet0.id) || pet0;
    const sp = pet.species;
    const x = c0 || { type: appt?.service === 'vacuna' ? 'vacunacion' : appt?.service === 'control' ? 'control' : appt?.service === 'cirugia' ? 'cirugia' : 'consulta', vetId: appt?.staffId || store.vets[0]?.id || null, reason: appt?.note || '', vitals: { weight: pet.weight || '' }, rx: [], charges: [] };
    const rx = (x.rx || []).map((r) => ({ ...r }));
    const charges = (x.charges || []).map((l) => ({ ...l }));
    if (!c0) {
      const key = x.type === 'control' ? 'control' : x.type === 'vacunacion' ? 'aplicacion' : x.type === 'cirugia' ? 'cirugia' : 'consulta';
      const svc = store.products.find((p) => p.active !== false && p.trackStock === false && normalize(p.name).includes(key));
      if (svc) charges.push({ productId: svc.id, name: svc.name, qty: 1, price: Number(svc.price) || 0, pack: 'caja', factor: 1, cost: 0, kind: 'servicio', detail: '' });
      else if (Number(store.settings.consultFee) > 0) charges.push({ productId: null, name: 'Consulta veterinaria', qty: 1, price: Number(store.settings.consultFee), pack: 'caja', factor: 1, cost: 0, kind: 'servicio', detail: '' });
    }
    const V = x.vitals || {};
    const m = openModal({
      title: `${c0 ? 'Consulta ' + esc(c0.number) : 'Nueva consulta'} · ${speciesOf(pet).emoji} ${esc(pet.name)}`, sub: `${esc(petLine(pet))} · Tutor: ${esc(pet.ownerName || '')}`, size: 'xl',
      body: `<form data-f class="consult" autocomplete="off">
        ${alertsHTML(pet) ? `<div class="banner danger-banner">${alertsHTML(pet)}</div>` : ''}
        <div class="consult-grid">
          <div class="stack">
            <div class="row row-wrap" style="gap:8px">
              <div class="chips chips-wrap" data-type>${Object.entries(CONSULT_TYPES).map(([k, v]) => `<button type="button" class="chip ${x.type === k ? 'on' : ''}" data-v="${k}">${icon(v.icon)} ${v.label}</button>`).join('')}</div>
              <select class="select select-sm" name="vetId" style="width:auto">${store.vets.map((s) => `<option value="${s.id}" ${x.vetId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Motivo de consulta *</label><input class="input" name="reason" value="${esc(x.reason || '')}" placeholder="Ej.: vómitos desde ayer, no quiere comer" autofocus></div>
            <div class="field"><label>Anamnesis</label><textarea class="input" name="anamnesis" rows="2" placeholder="Lo que cuenta el tutor: desde cuándo, qué comió, si está vacunado…">${esc(x.anamnesis || '')}</textarea></div>
            <div class="section-title">${icon('pulse')} Signos vitales</div>
            <div class="vitals">${Object.entries(VITALS).map(([k, v]) => `<div class="vital"><label>${icon(v.icon)} ${v.label}</label><div class="input-group"><input class="input" data-vt="${k}" inputmode="decimal" value="${V[k] != null && V[k] !== '' ? esc(String(V[k]).replace('.', ',')) : ''}"><span class="suffix">${v.unit}</span></div><span class="vflag" data-vf="${k}"></span></div>`).join('')}</div>
            <div class="form-grid">
              <div class="field"><label>Mucosas</label><select class="select" name="mucosa"><option value="">—</option>${MUCOSA.map((v) => `<option ${V.mucosa === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
              <div class="field"><label>Hidratación</label><select class="select" name="hydration"><option value="">—</option>${HYDRATION.map((v) => `<option ${V.hydration === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
            </div>
            <div class="field"><label>Examen físico</label><textarea class="input" name="exam" rows="2" placeholder="Hallazgos: piel, oídos, boca, abdomen, ganglios…">${esc(x.exam || '')}</textarea></div>
          </div>
          <div class="stack">
            <div class="field"><label>Diagnóstico</label><input class="input" name="diagnosis" value="${esc(x.diagnosis || '')}" placeholder="Presuntivo o definitivo"><div class="chips chips-wrap mt-xs" data-dx>${DX_QUICK.slice(0, 10).map((d) => `<button type="button" class="chip chip-sm" data-v="${esc(d)}">${esc(d)}</button>`).join('')}</div></div>
            <div class="field"><label>Plan / indicaciones</label><textarea class="input" name="plan" rows="2" placeholder="Dieta blanda 3 días, reposo, volver si empeora…">${esc(x.plan || '')}</textarea></div>
            <div class="section-title between"><span>${icon('file')} Récipe</span><span class="row" style="gap:4px"><button type="button" class="btn btn-ghost btn-sm" data-rxp>${icon('search')} Del inventario</button><button type="button" class="btn btn-ghost btn-sm" data-rxa>${icon('plus')} Línea</button></span></div>
            <div data-rx></div>
            <div class="field"><label>Exámenes indicados</label><input class="input" name="labs" value="${esc(x.labs || '')}" placeholder="Ej.: hematología, química, coprológico, eco abdominal"></div>
            <div class="field"><label>Próximo control</label><input class="input" type="date" name="nextAt" value="${esc(x.nextAt || '')}"><div class="chips mt-xs">${[[3, '3 días'], [7, '1 semana'], [15, '15 días'], [30, '1 mes'], [90, '3 meses']].map(([d, l]) => `<button type="button" class="chip chip-sm" data-nx="${d}">${l}</button>`).join('')}</div></div>
            <div class="section-title between"><span>${icon('cart')} Por cobrar</span><button type="button" class="btn btn-ghost btn-sm" data-chg>${icon('plus')} Servicio o producto</button></div>
            <div data-charges></div>
          </div>
        </div>
        <div class="error-msg" data-err></div>
      </form>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><span class="grow"></span><button class="btn btn-secondary" data-ok="save">${icon('check')} Guardar</button>${c0?.charged ? '' : `<button class="btn btn-primary" data-ok="charge">${icon('cart')} Guardar y cobrar</button>`}`,
      onClose: () => resolve(saved)
    });
    m.el.querySelector('.modal')?.classList.add('consult-modal');
    const q = (s) => m.el.querySelector(s);
    const F = q('[data-f]').elements;
    let type = x.type;
    m.el.querySelectorAll('[data-type] [data-v]').forEach((b) => b.onclick = () => { type = b.dataset.v; m.el.querySelectorAll('[data-type] [data-v]').forEach((y) => y.classList.toggle('on', y === b)); });
    m.el.querySelectorAll('[data-dx] [data-v]').forEach((b) => b.onclick = () => { const cur = F.diagnosis.value.trim(); F.diagnosis.value = cur ? `${cur}; ${b.dataset.v}` : b.dataset.v; });
    m.el.querySelectorAll('[data-nx]').forEach((b) => b.onclick = () => { F.nextAt.value = inDays(Number(b.dataset.nx)); });
    const flag = (k) => { const [t, tone] = vitalFlag(k, parseNum(q(`[data-vt="${k}"]`).value), sp) || []; q(`[data-vf="${k}"]`).innerHTML = t ? `<span class="badge badge-${tone}">${t}</span>` : ''; };
    Object.keys(VITALS).forEach((k) => { q(`[data-vt="${k}"]`).oninput = () => flag(k); flag(k); });

    const drawRx = () => {
      q('[data-rx]').innerHTML = rx.length ? `<div class="rx-lines">${rx.map((r, i) => `<div class="rx-line">
        <input class="input input-sm rx-drug" data-rf="drug" data-i="${i}" value="${esc(r.drug || '')}" placeholder="Medicamento y concentración">
        <input class="input input-sm" data-rf="dose" data-i="${i}" value="${esc(r.dose || '')}" placeholder="Dosis">
        <select class="select select-sm" data-rf="route" data-i="${i}">${ROUTES_ADM.map((v) => `<option ${r.route === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select class="select select-sm" data-rf="freq" data-i="${i}">${FREQS.map((v) => `<option ${r.freq === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input class="input input-sm" data-rf="days" data-i="${i}" value="${esc(r.days || '')}" placeholder="Días" inputmode="numeric">
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-rxd="${i}" aria-label="Quitar">${icon('x')}</button></div>`).join('')}</div>`
        : '<div class="small muted">Sin medicamentos indicados.</div>';
      m.el.querySelectorAll('[data-rf]').forEach((inp) => { inp.oninput = inp.onchange = () => { rx[+inp.dataset.i][inp.dataset.rf] = inp.value; }; });
      m.el.querySelectorAll('[data-rxd]').forEach((b) => b.onclick = () => { rx.splice(+b.dataset.rxd, 1); drawRx(); });
    };
    const drawCharges = () => {
      const tot = charges.reduce((a, l) => a + l.price * l.qty, 0);
      q('[data-charges]').innerHTML = charges.length ? `<div class="list">${charges.map((l, i) => `<div class="list-item small"><div class="grow" style="min-width:0"><b class="ellipsis">${esc(l.name)}</b><div class="t-sub">${l.qty} × ${usd(l.price)}</div></div><b class="num">${usd(l.price * l.qty)}</b>${c0?.charged ? '' : `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-chd="${i}">${icon('x')}</button>`}</div>`).join('')}<div class="between small mt-xs"><span class="muted">Total</span><b>${usd(tot)}</b></div></div>`
        : '<div class="small muted">Nada por cobrar.</div>';
      m.el.querySelectorAll('[data-chd]').forEach((b) => b.onclick = () => { charges.splice(+b.dataset.chd, 1); drawCharges(); });
    };
    q('[data-rxa]').onclick = () => { rx.push({ drug: '', dose: '', route: ROUTES_ADM[0], freq: FREQS[1] || FREQS[0], days: '' }); drawRx(); m.el.querySelector(`[data-rf="drug"][data-i="${rx.length - 1}"]`)?.focus(); };
    q('[data-rxp]').onclick = async () => {
      const p = await pickProduct({ title: 'Medicamento del récipe', filter: (x0) => x0.trackStock !== false });
      if (!p) return;
      rx.push({ drug: [p.name, p.strength].filter(Boolean).join(' '), dose: '', route: /pipeta|spray|champ|crema|gotas/i.test(p.form || '') ? (ROUTES_ADM.find((r) => /t[oó]pica/i.test(r)) || ROUTES_ADM[0]) : ROUTES_ADM[0], freq: FREQS[1] || FREQS[0], days: '', productId: p.id });
      drawRx();
      if (c0?.charged) return;
      if (await confirmDialog({ title: 'Agregar al cobro', message: `¿Se lo lleva de la clínica? Se agrega <b>${esc(p.name)}</b> a lo que hay que cobrar.`, confirmText: 'Sí, agregar', cancelText: 'Solo récipe' })) {
        const pack = upb(p) > 1 && p.fraction !== false ? 'unidad' : 'caja'; const f = packFactor(p, pack);
        charges.push({ productId: p.id, name: p.name, qty: 1, price: packPrice(p, pack, Number(store.settings.fractionMarkup) || 0), pack, factor: f, cost: round2(unitCost(p) * f * 10000) / 10000, kind: 'producto', detail: '' });
        drawCharges();
      }
    };
    q('[data-chg]').onclick = async () => {
      if (c0?.charged) { toast('Esta consulta ya se cobró', 'warning'); return; }
      const p = await pickProduct({ title: 'Agregar al cobro' });
      if (!p) return;
      charges.push({ productId: p.id, name: p.name, qty: 1, price: Number(p.price) || 0, pack: 'caja', factor: p.trackStock === false ? 1 : upb(p), cost: Number(p.cost) || 0, kind: p.trackStock === false ? 'servicio' : 'producto', detail: '' });
      drawCharges();
    };
    drawRx(); drawCharges();

    const submit = async (mode, btn) => {
      const err = q('[data-err]'); err.textContent = '';
      if (!F.reason.value.trim() && !F.diagnosis.value.trim()) { err.textContent = 'Escribe al menos el motivo de la consulta.'; F.reason.focus(); return; }
      const vitals = { mucosa: F.mucosa.value, hydration: F.hydration.value };
      Object.keys(VITALS).forEach((k) => { vitals[k] = parseNum(q(`[data-vt="${k}"]`).value) || ''; });
      setBusy(btn, true, 'Guardando…');
      try {
        saved = await saveConsult({ petId: pet.id, type, vetId: F.vetId.value || null, reason: F.reason.value, anamnesis: F.anamnesis.value, vitals, exam: F.exam.value, diagnosis: F.diagnosis.value, plan: F.plan.value, rx: rx.filter((r) => String(r.drug || '').trim()), labs: F.labs.value, nextAt: F.nextAt.value, charges, apptId: appt?.id || c0?.apptId || null }, c0?.id || null);
        m.close();
        toast(c0 ? 'Consulta actualizada' : `Consulta ${saved.number} guardada en la historia de ${pet.name}`);
        if (mode === 'charge' && saved.charges?.length && !saved.charged) nav('vender', { clientId: pet.ownerId, petId: pet.id, consultId: saved.id });
        else if (!c0 && saved.rx?.length) offerRecipe(saved);
      } catch (ex) { err.textContent = ex.message; setBusy(btn, false); }
    };
    m.el.querySelectorAll('[data-ok]').forEach((b) => b.onclick = () => submit(b.dataset.ok, b));
    q('[data-f]').onsubmit = (e) => e.preventDefault();
  });
}
const rxText = (r) => `${r.drug}${r.dose ? ` — ${r.dose}` : ''}${r.route ? `, vía ${String(r.route).toLowerCase()}` : ''}${r.freq ? `, ${String(r.freq).toLowerCase()}` : ''}${r.days ? ` por ${r.days} días` : ''}`;
function offerRecipe(c) {
  const m = openModal({ title: 'Récipe listo', sub: `${esc(c.petName)} · ${c.rx.length} medicamento(s)`, size: 'sm', body: '<p class="small">Imprímelo o envíaselo al tutor por WhatsApp.</p>', footer: `<button class="btn btn-secondary" data-close>Ahora no</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')}</button><button class="btn btn-primary" data-pr>${icon('print')} Imprimir</button>` });
  m.el.querySelector('[data-pr]').onclick = () => { printRecipe(c); m.close(); };
  m.el.querySelector('[data-wa]').onclick = () => { sendRecipe(c); m.close(); };
}
export function sendRecipe(c) {
  waClient('libre', { client: store.client(c.ownerId), pet: store.pet(c.petId), extra: `📋 *Récipe de ${c.petName}*\n${(c.rx || []).map((r) => `• ${rxText(r)}`).join('\n')}${c.plan ? `\n\nIndicaciones: ${c.plan}` : ''}${c.nextAt ? `\n\n📅 Control: ${fmtDate(c.nextAt)}` : ''}` });
}

const docHead = (title) => {
  const s = store.settings;
  return `<div class="hd"><div><div class="biz">${esc(store.businessName)}</div><div class="sm">${[s.address, s.phone && 'Tel. ' + s.phone, s.rif && loc().tax + ' ' + s.rif].filter(Boolean).map(esc).join(' · ')}</div></div><div class="ttl">${esc(title)}</div></div>`;
};
const DOC_CSS = `@page { margin: 14mm; } body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12.5px; }
  .hd { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #ea580c; padding-bottom: 8px; margin-bottom: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .biz { font-size: 18px; font-weight: 800; } .ttl { font-size: 16px; font-weight: 800; color: #c2410c; text-transform: uppercase; letter-spacing: .04em; } .sm { font-size: 11px; color: #555; }
  .box { border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; margin: 8px 0; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 14px; }
  .k { color: #666; font-size: 10.5px; text-transform: uppercase; } table { width: 100%; border-collapse: collapse; } th { text-align: left; background: #fff1e6; padding: 6px; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  h3 { font-size: 13px; margin: 14px 0 4px; color: #c2410c; } .sign { margin-top: 56px; display: flex; justify-content: flex-end; } .sign div { width: 240px; border-top: 1px solid #333; padding-top: 4px; text-align: center; font-size: 11px; }`;
const petBox = (pet, c) => `<div class="box grid">
  <div><div class="k">Paciente</div><b>${esc(pet?.name || c?.petName || '')}</b> ${esc(pet?.number || '')}</div>
  <div><div class="k">Especie / raza</div>${esc([speciesOf(pet || { species: c?.species }).label, pet?.breed].filter(Boolean).join(' · '))}</div>
  <div><div class="k">Sexo / edad</div>${esc([pet?.sex ? PET_SEX[pet.sex] : '', petAge(pet?.birthDate)].filter(Boolean).join(' · ') || '—')}</div>
  <div><div class="k">Peso</div>${c?.vitals?.weight || pet?.weight ? num(c?.vitals?.weight || pet.weight, 1) + ' kg' : '—'}</div>
  <div><div class="k">Tutor</div>${esc(c?.ownerName || pet?.ownerName || '')}</div>
  <div><div class="k">Fecha</div>${fmtDate(c?.date || todayKey())}</div></div>`;
export function printRecipe(c) {
  const pet = store.pet(c.petId);
  const s = store.settings;
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Récipe ${esc(c.petName)}</title><style>${DOC_CSS}</style></head><body>
    ${docHead('Récipe veterinario')}${petBox(pet, c)}
    ${c.diagnosis ? `<p><b>Diagnóstico:</b> ${esc(c.diagnosis)}</p>` : ''}
    <table><thead><tr><th>Medicamento</th><th>Dosis</th><th>Vía</th><th>Frecuencia</th><th>Duración</th></tr></thead><tbody>${(c.rx || []).map((r) => `<tr><td><b>${esc(r.drug)}</b></td><td>${esc(r.dose || '')}</td><td>${esc(r.route || '')}</td><td>${esc(r.freq || '')}</td><td>${r.days ? esc(r.days) + ' días' : ''}</td></tr>`).join('')}</tbody></table>
    ${c.plan ? `<h3>Indicaciones</h3><p>${esc(c.plan)}</p>` : ''}${c.labs ? `<h3>Exámenes</h3><p>${esc(c.labs)}</p>` : ''}${c.nextAt ? `<p><b>Próximo control:</b> ${fmtDate(c.nextAt)}</p>` : ''}
    <div class="sign"><div>${esc(c.vetName || s.vetName || 'Médico veterinario')}${s.vetLicense ? `<br>${esc(s.vetLicense)}` : ''}</div></div>
    <p class="sm" style="margin-top:24px">Uso veterinario exclusivo · ${esc(c.number || '')} · SanoVet</p></body></html>`);
}
export function printConsult(c) {
  const pet = store.pet(c.petId);
  const V = c.vitals || {};
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Historia ${esc(c.number)}</title><style>${DOC_CSS}</style></head><body>
    ${docHead('Historia clínica · ' + (CONSULT_TYPES[c.type]?.label || 'Consulta'))}${petBox(pet, c)}
    <h3>Motivo</h3><p>${esc(c.reason || '—')}</p>${c.anamnesis ? `<h3>Anamnesis</h3><p>${esc(c.anamnesis)}</p>` : ''}
    <h3>Signos vitales</h3><p>${Object.entries(VITALS).filter(([k]) => V[k]).map(([k, v]) => `${v.label}: <b>${num(V[k], k === 'weight' || k === 'temp' ? 1 : 0)} ${v.unit}</b>`).join(' · ') || '—'}${V.mucosa ? ` · Mucosas: ${esc(V.mucosa)}` : ''}${V.hydration ? ` · Hidratación: ${esc(V.hydration)}` : ''}</p>
    ${c.exam ? `<h3>Examen físico</h3><p>${esc(c.exam)}</p>` : ''}<h3>Diagnóstico</h3><p><b>${esc(c.diagnosis || '—')}</b></p>${c.plan ? `<h3>Plan</h3><p>${esc(c.plan)}</p>` : ''}
    ${(c.rx || []).length ? `<h3>Récipe</h3><ul>${c.rx.map((r) => `<li>${esc(rxText(r))}</li>`).join('')}</ul>` : ''}
    ${c.labs ? `<h3>Exámenes</h3><p>${esc(c.labs)}</p>` : ''}${c.nextAt ? `<p><b>Próximo control:</b> ${fmtDate(c.nextAt)}</p>` : ''}
    <div class="sign"><div>${esc(c.vetName || store.settings.vetName || 'Médico veterinario')}</div></div></body></html>`);
}

// ======================================================================
// FICHA DE LA MASCOTA
// ======================================================================
const PTABS = { resumen: 'Resumen', historia: 'Historia clínica', vacunas: 'Vacunas', desparasitacion: 'Desparasitación', citas: 'Citas', compras: 'Compras' };
export async function openPet(id, { tab: tab0 = 'resumen' } = {}) {
  let pet = store.pet(id) || await store.getPet(id);
  if (!pet) { toast('Mascota no encontrada', 'warning'); return; }
  let tab = tab0;
  const cache = {};
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal')?.classList.add('member-modal');
  const root = m.el.querySelector('[data-root]');
  const load = async (k, fn) => (cache[k] ??= await fn().catch((e) => { console.error(e); return []; }));
  const off = store.on('pets', () => { const n = store.pet(id); if (n && n !== pet) { pet = n; header(); if (['resumen', 'vacunas', 'desparasitacion'].includes(tab)) draw(); } });
  const close0 = m.close; m.close = () => { off(); close0(); };
  root.innerHTML = `<div data-head></div><div class="tabs mt" data-tabs>${Object.entries(PTABS).map(([k, v]) => `<button data-t="${k}">${v}</button>`).join('')}</div><div data-body class="mt"></div>`;
  const $ = (q) => root.querySelector(q);
  const owner = () => store.client(pet.ownerId);

  function header() {
    const o = owner();
    const inClinic = store.stays.filter((s) => s.petId === pet.id);
    $('[data-head]').innerHTML = `<div class="mhead">
      ${petAvatar(pet, 'avatar-xl')}
      <div class="grow" style="min-width:0">
        <div class="row row-wrap"><h2 class="mhead-name">${esc(pet.name)}</h2>${pet.deceased ? '<span class="badge badge-neutral">🕊️ Fallecido(a)</span>' : pet.active === false ? '<span class="badge badge-neutral">De baja</span>' : dueBadge(pet)}${pet.neutered ? '<span class="badge badge-info">Esterilizado(a)</span>' : ''}${inClinic.map((s) => `<span class="badge badge-warning">${icon(s.kind === 'hospital' ? 'bed' : 'scissors')} ${s.kind === 'hospital' ? 'Hospitalizado' : 'En peluquería'}</span>`).join('')}</div>
        <div class="t-sub">${esc(pet.number || '')} · ${esc(petLine(pet))}${pet.chip ? ` · Chip ${esc(pet.chip)}` : ''}</div>
        <div class="small mt-xs">${icon('user')} <button class="linkish" data-own><b>${esc(o?.name || pet.ownerName || '—')}</b></button>${o?.phone ? ` · ${esc(o.phone)}` : ''}${(Number(o?.balance) || 0) > 0.009 ? ` <span class="badge badge-danger">debe ${usd(o.balance)}</span>` : ''}</div>
        ${alertsHTML(pet) ? `<div class="mt-xs">${alertsHTML(pet)}</div>` : ''}
      </div>
      <button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="mactions">
      <button class="btn btn-primary" data-a="consult">${icon('stethoscope')} Consulta</button>
      <button class="btn btn-secondary" data-a="vac">${icon('syringe')} Vacuna</button>
      <button class="btn btn-secondary" data-a="dew">${icon('shield')} Desparasitar</button>
      <button class="btn btn-secondary" data-a="appt">${icon('calendar')} Cita</button>
      <button class="btn btn-secondary" data-a="sell">${icon('cart')} Vender</button>
      <button class="btn btn-secondary" data-a="card">${icon('qr')} Carnet</button>
      <button class="btn btn-whatsapp" data-a="wa">${icon('whatsapp')} WhatsApp</button>
      <button class="btn btn-ghost" data-a="edit">${icon('edit')} Editar</button>
      <button class="btn btn-ghost btn-icon" data-a="more" title="Más opciones">${icon('menu')}</button>
    </div>`;
    $('[data-x]').onclick = () => m.close();
    $('[data-own]').onclick = () => { m.close(); openClient(pet.ownerId); };
    root.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => action(b.dataset.a));
  }

  async function action(a) {
    if (a === 'consult') { const r = await consultForm(pet); if (r) { cache.consults = null; tab = 'historia'; draw(); } }
    if (a === 'vac') { if (await vaccineForm(pet)) { tab = 'vacunas'; draw(); } }
    if (a === 'dew') { if (await dewormForm(pet)) { tab = 'desparasitacion'; draw(); } }
    if (a === 'appt') { const { apptForm } = await import('./views/agenda.js'); if (await apptForm(null, { pet })) { cache.appts = null; tab = 'citas'; draw(); } }
    if (a === 'sell') { m.close(); nav('vender', { clientId: pet.ownerId, petId: pet.id }); }
    if (a === 'card') cardModal(pet);
    if (a === 'edit') { const r = await petForm(pet); if (r) { pet = { ...pet, ...r.pet }; header(); draw(); } }
    if (a === 'wa') waMenu(pet);
    if (a === 'more') moreMenu();
  }

  function moreMenu() {
    const mm = openModal({
      title: 'Más opciones', sub: esc(pet.name), size: 'sm',
      body: `<div class="list">
        <button class="list-item" data-o="groom">${icon('scissors')}<div class="grow"><b>Recibir en peluquería</b><div class="t-sub">Baño, corte, uñas…</div></div></button>
        <button class="list-item" data-o="hosp">${icon('bed')}<div class="grow"><b>Hospitalizar</b><div class="t-sub">Internar y llevar su evolución</div></div></button>
        <button class="list-item" data-o="print">${icon('print')}<div class="grow"><b>Imprimir carnet de vacunas</b><div class="t-sub">Tamaño carta</div></div></button>
        <button class="list-item" data-o="code">${icon('refresh')}<div class="grow"><b>Nuevo código de carnet</b><div class="t-sub">Si se compartió el enlace por error</div></div></button>
        ${pet.deceased || pet.active === false ? `<button class="list-item" data-o="back">${icon('unlock')}<div class="grow"><b>Reactivar</b><div class="t-sub">Vuelve a la lista y a los recordatorios</div></div></button>` : `<button class="list-item" data-o="rip">${icon('heart')}<div class="grow"><b>Registrar fallecimiento</b><div class="t-sub">Deja de recibir recordatorios</div></div></button>
        <button class="list-item" data-o="baja">${icon('x')}<div class="grow"><b>Dar de baja</b><div class="t-sub">Se mudó o cambió de clínica; se conserva su historia</div></div></button>`}
      </div>`,
      footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
    });
    const o = (k, fn) => mm.el.querySelector(`[data-o="${k}"]`)?.addEventListener('click', async () => { mm.close(); await fn(); });
    o('groom', async () => { const { stayForm } = await import('./views/sala.js'); await stayForm('peluqueria', { pet }); header(); });
    o('hosp', async () => { const { stayForm } = await import('./views/sala.js'); await stayForm('hospital', { pet }); header(); });
    o('print', () => printCard(pet));
    o('code', async () => { if (!(await confirmDialog({ title: 'Nuevo código de carnet', message: 'El enlace anterior del carnet dejará de funcionar.', confirmText: 'Generar' }))) return; const code = await renewCardCode(pet); pet = { ...pet, cardCode: code }; toast('Código renovado'); cardModal(pet); });
    o('back', async () => { await setPetActive(pet, true); toast('Mascota reactivada'); });
    o('rip', async () => { if (!(await confirmDialog({ title: 'Registrar fallecimiento', message: `Lamentamos la pérdida de ${esc(pet.name)}. Su historia clínica se conserva y no se enviarán más recordatorios.`, confirmText: 'Registrar', danger: true }))) return; await setPetActive(pet, false, { deceased: true }); toast('Registrado'); });
    o('baja', async () => { if (!(await confirmDialog({ title: 'Dar de baja', message: `${esc(pet.name)} dejará de aparecer en la lista y en los recordatorios. Su historia se conserva.`, confirmText: 'Dar de baja', danger: true }))) return; await setPetActive(pet, false); toast('Mascota dada de baja', 'warning'); });
  }

  async function draw() {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const body = $('[data-body]');
    body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try { await TAB[tab](body); } catch (e) { console.error(e); body.innerHTML = emptyState('alert', 'No se pudo cargar', esc(e.message)); }
  }

  const dueList = () => {
    const list = dueItems(pet);
    return list.length ? `<div class="list">${list.map((it, i) => `<div class="list-item"><span class="kpi-icon tone-${dueTone(it.d) === 'neutral' ? 'brand' : dueTone(it.d)}" style="width:38px;height:38px">${icon(it.kind === 'vacuna' ? 'syringe' : DEWORM[it.kind]?.icon || 'pill')}</span><div class="grow" style="min-width:0"><b class="ellipsis">${esc(it.name)}</b><div class="t-sub">${kindLabel(it.kind)} · última ${fmtDate(it.date)} · próxima ${fmtDate(it.next)}</div></div><span class="badge badge-${dueTone(it.d)}">${dueText(it.d)}</span>${owner()?.phone && it.d <= 15 ? `<button class="btn btn-whatsapp btn-icon btn-sm" data-rem="${i}" title="Recordar al tutor">${icon('whatsapp')}</button>` : ''}</div>`).join('')}</div>`
      : emptyState('syringe', 'Sin plan sanitario', 'Registra sus vacunas y desparasitaciones: te avisamos cuándo le toca la próxima.');
  };
  const bindDue = (body) => body.querySelectorAll('[data-rem]').forEach((b) => b.onclick = () => {
    const it = dueItems(pet)[+b.dataset.rem]; if (!it) return;
    waClient(it.kind === 'vacuna' ? 'vacuna' : 'desparasitar', { client: owner(), pet, item: it }); markReminded(pet, `${it.kind}:${it.name}:${it.next}`);
  });
  const consultRow = (c) => `<div class="hc-item"><div class="hc-date"><b>${fmtDate(c.date).slice(0, 5)}</b><small>${fmtDate(c.date).slice(6)}</small></div><div class="grow" style="min-width:0">
      <div class="row row-wrap" style="gap:6px"><span class="badge badge-${CONSULT_TYPES[c.type]?.tone || 'neutral'}">${icon(CONSULT_TYPES[c.type]?.icon || 'stethoscope')} ${CONSULT_TYPES[c.type]?.label || 'Consulta'}</span><b>${esc(c.diagnosis || c.reason || '')}</b>${c.charges?.length && !c.charged ? '<span class="badge badge-warning">por cobrar</span>' : ''}</div>
      <div class="t-sub">${esc(c.number)} · ${esc(c.vetName || '')}${c.vitals?.weight ? ` · ${num(c.vitals.weight, 1)} kg` : ''}${c.vitals?.temp ? ` · ${num(c.vitals.temp, 1)} °C` : ''}</div>
      ${c.reason && c.diagnosis ? `<div class="small">Motivo: ${esc(c.reason)}</div>` : ''}${c.plan ? `<div class="small muted">${esc(c.plan)}</div>` : ''}${(c.rx || []).length ? `<div class="small">${icon('file')} ${c.rx.map((r) => esc(r.drug)).join(' · ')}</div>` : ''}</div>
      <div class="row hc-actions" style="gap:2px;align-self:flex-start">${(c.rx || []).length ? `<button class="btn btn-ghost btn-icon btn-sm" data-rp="${c.id}" title="Imprimir récipe">${icon('file')}</button>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-cp="${c.id}" title="Imprimir historia">${icon('print')}</button><button class="btn btn-ghost btn-icon btn-sm" data-ce="${c.id}" title="Editar">${icon('edit')}</button>${c.charges?.length && !c.charged ? `<button class="btn btn-primary btn-sm" data-cc="${c.id}">${icon('cart')} Cobrar</button>` : ''}</div></div>`;
  const bindConsults = (body, list) => {
    const f = (id0) => list.find((x) => x.id === id0);
    body.querySelectorAll('[data-rp]').forEach((b) => b.onclick = () => printRecipe(f(b.dataset.rp)));
    body.querySelectorAll('[data-cp]').forEach((b) => b.onclick = () => printConsult(f(b.dataset.cp)));
    body.querySelectorAll('[data-ce]').forEach((b) => b.onclick = async () => { if (await consultForm(pet, { c0: f(b.dataset.ce) })) { cache.consults = null; draw(); } });
    body.querySelectorAll('[data-cc]').forEach((b) => b.onclick = () => { m.close(); nav('vender', { clientId: pet.ownerId, petId: pet.id, consultId: b.dataset.cc }); });
  };

  const TAB = {
    async resumen(body) {
      const consults = await load('consults', () => store.petConsults(pet.id));
      const qr = pet.cardCode ? await qrDataURL(cardUrl(pet.cardCode), 3) : '';
      body.innerHTML = `<div class="grid-main">
        <div class="stack">
          <div class="kpis kpis-sm">
            <div class="card kpi"><div class="kpi-label">Visitas</div><div class="kpi-value">${pet.visits || consults.length || 0}</div><div class="kpi-sub">desde ${fmtDate(pet.createdAt)}</div></div>
            <div class="card kpi"><div class="kpi-label">Peso</div><div class="kpi-value">${pet.weight ? num(pet.weight, pet.weight % 1 ? 1 : 0) + ' <small>kg</small>' : '—'}</div><div class="kpi-sub">${(pet.weights || []).length > 1 ? `antes ${num(pet.weights[pet.weights.length - 2].kg, 1)} kg` : 'se registra en cada consulta'}</div></div>
            <div class="card kpi"><div class="kpi-label">Vacunas</div><div class="kpi-value">${latestBy(pet.vaccines || []).length}</div><div class="kpi-sub">${(pet.vaccines || []).length} aplicaciones</div></div>
            <div class="card kpi"><div class="kpi-label">Próximo control</div><div class="kpi-value" style="font-size:18px">${pet.nextControl ? fmtDate(pet.nextControl) : '—'}</div><div class="kpi-sub ellipsis">${esc(pet.lastDx || 'sin indicaciones')}</div></div>
          </div>
          <div class="card"><div class="card-head"><div class="card-title">${icon('syringe')} Plan sanitario</div><div class="row" style="gap:4px"><button class="btn btn-ghost btn-sm" data-av>${icon('plus')} Vacuna</button><button class="btn btn-ghost btn-sm" data-ad>${icon('plus')} Desparasitación</button></div></div>${dueList()}</div>
          <div class="card"><div class="card-head"><div class="card-title">${icon('stethoscope')} Últimas consultas</div><button class="btn btn-ghost btn-sm" data-allc>Ver historia</button></div>${consults.length ? `<div class="hc">${consults.slice(0, 3).map(consultRow).join('')}</div>` : emptyState('stethoscope', 'Sin consultas', 'Registra la primera con el botón “Consulta”.')}</div>
        </div>
        <div class="stack">
          ${(pet.weights || []).length > 1 ? `<div class="card"><div class="card-title">${icon('scale')} Peso</div><div class="mt">${weightChart(pet)}</div></div>` : ''}
          <div class="card"><div class="card-title">${icon('info')} Datos</div><div class="kv-grid mt">
            <div class="kv"><span>Nacimiento</span><b>${pet.birthDate ? fmtDate(pet.birthDate) : '—'}</b></div>
            <div class="kv"><span>Color</span><b>${esc(pet.color || '—')}</b></div>
            <div class="kv"><span>Temperamento</span><b>${esc(TEMPERAMENTS[pet.temperament] || '—')}</b></div>
            <div class="kv"><span>Alimentación</span><b>${esc(pet.diet || '—')}</b></div>
            <div class="kv kv-1"><span>Condiciones</span><b>${esc((pet.conditions || []).join(', ') || '—')}</b></div>
            ${pet.notes ? `<div class="kv kv-1"><span>Notas</span><b>${esc(pet.notes)}</b></div>` : ''}
          </div></div>
          <div class="card center">${qr ? `<img src="${qr}" class="qr-img" alt="QR">` : ''}<div class="mono small mt-xs">${esc(pet.cardCode || '')}</div><div class="small muted">Carnet digital de vacunas</div><button class="btn btn-secondary btn-sm mt" data-card>${icon('whatsapp')} Enviar carnet</button></div>
        </div></div>`;
      bindDue(body); bindConsults(body, consults);
      body.querySelector('[data-av]').onclick = () => action('vac');
      body.querySelector('[data-ad]').onclick = () => action('dew');
      body.querySelector('[data-allc]').onclick = () => { tab = 'historia'; draw(); };
      body.querySelector('[data-card]').onclick = () => waClient('tarjeta', { client: owner(), pet });
    },
    async historia(body) {
      const list = await load('consults', () => store.petConsults(pet.id));
      body.innerHTML = `<div class="between"><div class="small muted">${list.length} consulta(s)</div><button class="btn btn-primary btn-sm" data-new>${icon('plus')} Nueva consulta</button></div>
        ${list.length ? `<div class="hc mt">${list.map(consultRow).join('')}</div>` : emptyState('stethoscope', 'Historia clínica vacía', 'Cada consulta guarda motivo, signos vitales, diagnóstico, récipe y próximo control.')}`;
      body.querySelector('[data-new]').onclick = () => action('consult');
      bindConsults(body, list);
    },
    async vacunas(body) {
      const list = (pet.vaccines || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const last = latestBy(pet.vaccines || []);
      body.innerHTML = `<div class="between"><div class="small muted">${list.length} aplicación(es)</div><div class="row" style="gap:6px"><button class="btn btn-secondary btn-sm" data-pr>${icon('print')} Carnet</button><button class="btn btn-primary btn-sm" data-new>${icon('syringe')} Aplicar vacuna</button></div></div>
        ${list.length ? `<div class="table-wrap mt"><table class="table"><thead><tr><th>Vacuna</th><th>Aplicada</th><th>Refuerzo</th><th class="hide-sm">Lote</th><th class="hide-sm">Por</th><th></th></tr></thead><tbody>${list.map((v) => { const d = v.next ? Math.round((new Date(v.next + 'T12:00:00') - new Date(todayKey() + 'T12:00:00')) / 864e5) : null; const isLast = last.some((x) => x.id === v.id); return `<tr><td><b>${esc(v.name)}</b></td><td>${fmtDate(v.date)}</td><td>${v.next ? `${fmtDate(v.next)} ${isLast ? `<span class="badge badge-${dueTone(d)}">${dueText(d)}</span>` : ''}` : '—'}</td><td class="hide-sm mono small">${esc(v.lot || '')}</td><td class="hide-sm small">${esc(v.vetName || '')}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-ev="${v.id}">${icon('edit')}</button></td></tr>`; }).join('')}</tbody></table></div>` : emptyState('syringe', 'Sin vacunas registradas', 'Registra también las que trae de otra clínica para que el carnet quede completo.')}`;
      body.querySelector('[data-new]').onclick = () => action('vac');
      body.querySelector('[data-pr]').onclick = () => printCard(pet);
      body.querySelectorAll('[data-ev]').forEach((b) => b.onclick = async () => { if (await vaccineForm(pet, (pet.vaccines || []).find((x) => x.id === b.dataset.ev))) draw(); });
    },
    async desparasitacion(body) {
      const list = (pet.deworm || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      body.innerHTML = `<div class="between"><div class="small muted">${list.length} registro(s)</div><div class="row" style="gap:6px"><button class="btn btn-secondary btn-sm" data-new="externa">${icon('shield')} Antipulgas</button><button class="btn btn-primary btn-sm" data-new="interna">${icon('pill')} Desparasitar</button></div></div>
        ${list.length ? `<div class="table-wrap mt"><table class="table"><thead><tr><th>Tipo</th><th>Producto</th><th>Fecha</th><th>Próxima</th><th class="hide-sm">Peso</th><th></th></tr></thead><tbody>${list.map((d) => `<tr><td><span class="badge badge-${d.kind === 'externa' ? 'violet' : 'info'}">${esc(DEWORM[d.kind]?.short || d.kind)}</span></td><td><b>${esc(d.product)}</b>${d.dose ? `<div class="t-sub">${esc(d.dose)}</div>` : ''}</td><td>${fmtDate(d.date)}</td><td>${d.next ? fmtDate(d.next) : '—'}</td><td class="hide-sm">${d.weight ? num(d.weight, 1) + ' kg' : ''}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-ed="${d.id}">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('shield', 'Sin desparasitaciones', 'Interna cada 3 meses y antipulgas cada mes, según el producto.')}`;
      body.querySelectorAll('[data-new]').forEach((b) => b.onclick = async () => { if (await dewormForm(pet, null, b.dataset.new)) draw(); });
      body.querySelectorAll('[data-ed]').forEach((b) => b.onclick = async () => { if (await dewormForm(pet, (pet.deworm || []).find((x) => x.id === b.dataset.ed))) draw(); });
    },
    async citas(body) {
      const list = await load('appts', () => store.petAppts(pet.id));
      body.innerHTML = `<div class="between"><div class="small muted">${list.length} cita(s)</div><button class="btn btn-primary btn-sm" data-new>${icon('calendar')} Agendar cita</button></div>
        ${list.length ? `<div class="list mt">${list.map((a) => `<div class="list-item"><span class="kpi-icon" style="width:38px;height:38px;background:${SERVICES[a.service]?.color || '#ea580c'}22;color:${SERVICES[a.service]?.color || '#ea580c'}">${icon(SERVICES[a.service]?.icon || 'calendar')}</span><div class="grow"><b>${fmtDate(a.date)} · ${esc(a.time || '')}</b><div class="t-sub">${esc(SERVICES[a.service]?.label || a.service || '')}${a.staffName ? ' · ' + esc(a.staffName) : ''}${a.note ? ' · ' + esc(a.note) : ''}</div></div>${apptBadge(a.status)}</div>`).join('')}</div>` : emptyState('calendar', 'Sin citas')}`;
      body.querySelector('[data-new]').onclick = () => action('appt');
    },
    async compras(body) {
      const sales = await load('sales', () => store.petSales(pet.id));
      body.innerHTML = sales.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Fecha</th><th>Detalle</th><th class="r">Total</th><th></th></tr></thead><tbody>${sales.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}"><td><b>${esc(s.number)}</b>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}</td><td class="small">${fmtDateTime(s.date)}</td><td class="small">${(s.items || []).map((i) => esc(i.name)).join(', ')}</td><td class="r num"><b>${usd(s.total)}</b></td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-pr="${s.id}">${icon('print')}</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('receipt', 'Sin compras asociadas', 'Las ventas y servicios cobrados a esta mascota aparecen aquí.');
      body.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipt(sales.find((s) => s.id === b.dataset.pr)));
    }
  };
  root.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  header(); draw();
}

export function waMenu(pet) {
  const o = store.client(pet.ownerId);
  const due = dueItems(pet).filter((x) => x.d <= 30);
  const opts = [
    ...due.map((it, i) => [`due:${i}`, `${it.kind === 'vacuna' ? 'Vacuna' : 'Desparasitación'}: ${it.name}`, dueText(it.d)]),
    ...(pet.nextControl ? [['control', 'Recordar su control', fmtDate(pet.nextControl)]] : []),
    ['tarjeta', 'Enviar su carnet de vacunas', 'Enlace con QR'],
    ...(store.settings.shop?.enabled !== false && store.settings.shop?.slug ? [['catalogo', 'Enlace para pedir en línea', 'Alimento y accesorios']] : []),
    ...((Number(o?.balance) || 0) > 0.009 ? [['deuda', 'Recordar saldo pendiente', usd(o.balance)]] : []),
    ['cumple', `Feliz cumpleaños a ${pet.name}`, 'Con un detalle'],
    ['libre', 'Mensaje libre', 'Escribe lo que quieras']
  ];
  const m = openModal({
    title: 'WhatsApp', sub: `${esc(o?.name || pet.ownerName || '')} · ${esc(pet.name)}`, size: 'sm',
    body: `<div class="list">${opts.map(([k, t, s]) => `<button class="list-item" data-k="${esc(k)}">${icon('whatsapp')}<div class="grow"><b>${esc(t)}</b><div class="t-sub">${esc(s)}</div></div></button>`).join('')}</div>`,
    footer: '<button class="btn btn-secondary" data-close>Cerrar</button>'
  });
  m.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = async () => {
    const k = b.dataset.k; m.close();
    if (k.startsWith('due:')) { const it = due[+k.slice(4)]; waClient(it.kind === 'vacuna' ? 'vacuna' : 'desparasitar', { client: o, pet, item: it }); markReminded(pet, `${it.kind}:${it.name}:${it.next}`); return; }
    if (k === 'libre') { const t = await promptDialog({ title: 'Mensaje', label: 'Texto', value: '', confirmText: 'Abrir WhatsApp' }); if (t) waClient('libre', { client: o, pet, extra: t }); return; }
    waClient(k, { client: o, pet });
  });
}

// ======================================================================
// FICHA DEL TUTOR
// ======================================================================
const TTABS = { mascotas: 'Mascotas', compras: 'Compras', datos: 'Datos' };
export async function openClient(id, { tab: tab0 = 'mascotas' } = {}) {
  let cl = store.client(id) || await store.getClient(id);
  if (!cl) { toast('Tutor no encontrado', 'warning'); return; }
  let tab = tab0;
  const cache = {};
  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal')?.classList.add('member-modal');
  const root = m.el.querySelector('[data-root]');
  const refresh = () => { const n = store.client(id); if (n) { cl = n; header(); if (tab !== 'compras') draw(); } };
  const offs = [store.on('clients', refresh), store.on('pets', refresh)];
  const close0 = m.close; m.close = () => { offs.forEach((f) => f()); close0(); };
  root.innerHTML = `<div data-head></div><div class="tabs mt" data-tabs>${Object.entries(TTABS).map(([k, v]) => `<button data-t="${k}">${v}</button>`).join('')}</div><div data-body class="mt"></div>`;
  const $ = (q) => root.querySelector(q);

  function header() {
    const bal = Number(cl.balance) || 0;
    const ag = cl.agreementId ? store.agreement(cl.agreementId) : null;
    $('[data-head]').innerHTML = `<div class="mhead">${avatar(cl, 'avatar-xl')}
      <div class="grow" style="min-width:0">
        <div class="row row-wrap"><h2 class="mhead-name">${esc(cl.name)}</h2>${clientBadge(store.clientStatus(cl))}${bal > 0.009 ? `<span class="badge badge-danger">Debe ${usd(bal)}</span>` : ''}${pointsHTML(cl)}${ag ? `<span class="badge badge-info">${icon('handshake')} ${esc(ag.name)}</span>` : ''}</div>
        <div class="t-sub">${esc(cl.number)}${cl.idDoc ? ` · ${esc(loc().id)} ${esc(cl.idDoc)}` : ''}${cl.phone ? ` · ${esc(cl.phone)}` : ''}${cl.address ? ` · ${esc(cl.address)}` : ''}</div>
        <div class="small mt-xs">${clientLine(cl)}</div>
      </div><button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button></div>
    <div class="mactions">
      <button class="btn btn-primary" data-a="pet">${icon('plus')} Mascota</button>
      <button class="btn btn-secondary" data-a="sell">${icon('cart')} Vender</button>
      ${bal > 0.009 ? `<button class="btn btn-secondary" data-a="debt">${icon('dollar')} Cobrar saldo</button>` : ''}
      ${cl.phone ? `<button class="btn btn-whatsapp" data-a="wa">${icon('whatsapp')} WhatsApp</button>` : ''}
      <button class="btn btn-ghost" data-a="edit">${icon('edit')} Editar</button>
      <button class="btn btn-ghost btn-icon" data-a="more" title="Más opciones">${icon('menu')}</button>
    </div>`;
    $('[data-x]').onclick = () => m.close();
    root.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => action(b.dataset.a));
  }
  async function action(a) {
    if (a === 'pet') { const r = await petForm(null, { owner: cl }); if (r) { tab = 'mascotas'; draw(); } }
    if (a === 'sell') { m.close(); nav('vender', { clientId: cl.id }); }
    if (a === 'debt') { await payDebtModal(cl); cache.sales = null; draw(); }
    if (a === 'wa') { const t = await promptDialog({ title: 'WhatsApp', label: `Mensaje para ${cl.name.split(' ')[0]}`, value: '', confirmText: 'Abrir WhatsApp' }); if (t != null) waClient('libre', { client: cl, extra: t }); }
    if (a === 'edit') { const r = await clientForm(cl); if (r) { cl = { ...cl, ...r }; header(); draw(); } }
    if (a === 'more') {
      const mm = openModal({ title: 'Más opciones', sub: esc(cl.name), size: 'sm', body: `<div class="list">
        ${store.loyalty?.enabled ? `<button class="list-item" data-o="pts">${icon('star')}<div class="grow"><b>Ajustar puntos</b><div class="t-sub">Cortesía o corrección (PIN)</div></div></button>` : ''}
        <button class="list-item" data-o="baja">${icon(cl.active === false ? 'unlock' : 'x')}<div class="grow"><b>${cl.active === false ? 'Reactivar tutor' : 'Dar de baja'}</b><div class="t-sub">Se conserva su historial</div></div></button></div>`, footer: '<button class="btn btn-secondary" data-close>Cerrar</button>' });
      mm.el.querySelector('[data-o="pts"]')?.addEventListener('click', async () => {
        mm.close(); if (!(await requirePin('Ajustar puntos'))) return;
        const f = openModal({ title: 'Puntos', sub: esc(cl.name), size: 'sm', body: `<div class="form-grid"><div class="field"><label>Puntos</label><input class="input" type="number" min="0" data-p value="${Math.floor(Number(cl.points) || 0)}"></div><div class="field full"><label>Motivo</label><input class="input" data-why placeholder="Ej.: cortesía"></div></div>`, footer: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>' });
        f.el.querySelector('[data-ok]').onclick = async () => { await adjustPoints(cl, f.el.querySelector('[data-p]').value, f.el.querySelector('[data-why]').value); f.close(); toast('Puntos actualizados'); };
      });
      mm.el.querySelector('[data-o="baja"]').onclick = async () => {
        mm.close();
        if (cl.active === false) { await setClientActive(cl, true); toast('Tutor reactivado'); return; }
        if (await confirmDialog({ title: 'Dar de baja', message: `${esc(cl.name)} dejará de aparecer en la lista. Su historial se conserva.`, confirmText: 'Dar de baja', danger: true })) { await setClientActive(cl, false); toast('Tutor dado de baja', 'warning'); }
      };
    }
  }
  async function draw() {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const body = $('[data-body]');
    if (tab === 'mascotas') {
      const pets = store.pets.filter((p) => p.ownerId === cl.id);
      body.innerHTML = pets.length ? `<div class="pet-cards">${pets.map((p) => `<button class="pet-card ${p.active === false || p.deceased ? 'is-off' : ''}" data-p="${p.id}">${petAvatar(p, 'avatar-lg')}<div class="grow" style="min-width:0"><b class="ellipsis">${esc(p.name)}</b>${p.deceased ? ' 🕊️' : ''}<div class="t-sub ellipsis">${esc(petLine(p))}</div><div class="mt-xs">${p.active === false || p.deceased ? '' : dueBadge(p)}</div></div>${icon('chevronRight')}</button>`).join('')}</div>`
        : emptyState('paw', 'Sin mascotas', 'Registra su primera mascota con el botón “Mascota”.');
      body.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { m.close(); openPet(b.dataset.p); });
    }
    if (tab === 'compras') {
      body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
      const sales = (cache.sales ??= await store.clientSales(cl.id).catch(() => []));
      body.innerHTML = sales.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Fecha</th><th>Detalle</th><th class="r">Total</th><th></th></tr></thead><tbody>${sales.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}"><td><b>${esc(s.number)}</b>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}${s.petName ? `<div class="t-sub">${esc(s.petName)}</div>` : ''}</td><td class="small">${fmtDateTime(s.date)}</td><td class="small">${(s.items || []).map((i) => esc(i.name)).join(', ')}</td><td class="r num"><b>${usd(s.total)}</b>${s.credit ? `<div class="t-sub text-danger">pendiente ${usd(s.credit)}</div>` : ''}</td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-pr="${s.id}">${icon('print')}</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('receipt', 'Sin compras registradas');
      body.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipt(sales.find((s) => s.id === b.dataset.pr)));
    }
    if (tab === 'datos') {
      body.innerHTML = `<div class="card"><div class="kv-grid">
        <div class="kv"><span>Teléfono</span><b>${esc(cl.phone || '—')}</b></div><div class="kv"><span>Otro teléfono</span><b>${esc(cl.phone2 || '—')}</b></div>
        <div class="kv"><span>${esc(loc().id)}</span><b>${esc(cl.idDoc || '—')}</b></div><div class="kv"><span>Correo</span><b>${esc(cl.email || '—')}</b></div>
        <div class="kv"><span>Visitas</span><b>${cl.visits || 0}</b></div><div class="kv"><span>Gasto total</span><b>${usd(cl.totalSpent || 0)}</b></div>
        <div class="kv"><span>Cliente desde</span><b>${fmtDate(cl.createdAt)}</b></div><div class="kv"><span>Nos conoció por</span><b>${esc(cl.howFound || '—')}</b></div>
        <div class="kv kv-1"><span>Dirección</span><b>${esc(cl.address || '—')}</b></div>${cl.notes ? `<div class="kv kv-1"><span>Notas</span><b>${esc(cl.notes)}</b></div>` : ''}</div></div>`;
    }
  }
  root.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
  header(); draw();
}

// ======================================================================
// SALDO Y CARNET
// ======================================================================
export async function payDebtModal(cl) {
  const { openPay, showPaid } = await import('./pay.js');
  const bal = Number(cl.balance) || 0;
  const out = await openPay({ title: 'Cobrar saldo pendiente', sub: esc(cl.name), amount: bal, editable: true, max: bal, onConfirm: async (r) => { const res = await payBalance(cl, { amount: r.amount, payments: r.payments }); if (r.print) printReceipt(res.sale); return res; } });
  if (out) showPaid(out.sale, { title: 'Abono registrado', onPrint: () => printReceipt(out.sale) });
}
export async function cardModal(pet) {
  const qr = await qrDataURL(cardUrl(pet.cardCode), 5);
  const m = openModal({
    title: 'Carnet digital', sub: `${speciesOf(pet).emoji} ${esc(pet.name)}`, size: 'sm',
    body: `<div class="center stack" style="align-items:center"><img src="${qr}" class="qr-img lg" alt="QR"><div class="mono small">${esc(pet.cardCode)}</div>
      <div class="small muted">El tutor abre el enlace en su teléfono y ve las vacunas y desparasitaciones de ${esc(pet.name)} con la fecha de la próxima. En recepción, escanea el QR para abrir su ficha al instante.</div></div>`,
    footer: `<button class="btn btn-secondary" data-copy>${icon('copy')} Copiar</button><button class="btn btn-secondary" data-pr>${icon('print')} Imprimir</button><button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Enviar</button>`
  });
  m.el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(cardUrl(pet.cardCode)); toast('Enlace copiado'); } catch (_) { toast(cardUrl(pet.cardCode), 'info', 6000); } };
  m.el.querySelector('[data-pr]').onclick = () => printCard(pet);
  m.el.querySelector('[data-wa]').onclick = () => waClient('tarjeta', { client: store.client(pet.ownerId), pet });
}
/** Carnet de vacunación impreso (carta) con QR al carnet digital */
export async function printCard(pet0) {
  const pet = store.pet(pet0.id) || pet0;
  const qr = await qrDataURL(cardUrl(pet.cardCode), 5);
  const vac = (pet.vaccines || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const dew = (pet.deworm || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  printHTML(`<!DOCTYPE html><html><head>${PRINT_HEAD}<title>Carnet ${esc(pet.name)}</title><style>${DOC_CSS}
    .top { display: flex; gap: 16px; align-items: center; } .top img.qr { width: 110px; height: 110px; } .ph { width: 90px; height: 90px; border-radius: 14px; object-fit: cover; border: 2px solid #fdba74; }
    .emo { width: 90px; height: 90px; border-radius: 14px; display: grid; place-items: center; font-size: 52px; background: #fff1e6; }</style></head><body>
    ${docHead('Carnet de vacunación')}
    <div class="top">${pet.photo ? `<img class="ph" src="${pet.photo}">` : `<div class="emo">${speciesOf(pet).emoji}</div>`}<div style="flex:1">${petBox(pet, { ownerName: pet.ownerName, date: todayKey() })}</div><img class="qr" src="${qr}"></div>
    <h3>Vacunas</h3><table><thead><tr><th>Fecha</th><th>Vacuna</th><th>Lote</th><th>Próximo refuerzo</th><th>Médico veterinario</th></tr></thead><tbody>${vac.map((v) => `<tr><td>${fmtDate(v.date)}</td><td><b>${esc(v.name)}</b></td><td>${esc(v.lot || '')}</td><td>${v.next ? fmtDate(v.next) : ''}</td><td>${esc(v.vetName || '')}</td></tr>`).join('') || '<tr><td colspan="5">Sin vacunas registradas</td></tr>'}${'<tr><td style="height:26px"></td><td></td><td></td><td></td><td></td></tr>'.repeat(4)}</tbody></table>
    <h3>Desparasitación</h3><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Peso</th><th>Próxima</th></tr></thead><tbody>${dew.map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${esc(DEWORM[d.kind]?.short || '')}</td><td>${esc(d.product)}</td><td>${d.weight ? num(d.weight, 1) + ' kg' : ''}</td><td>${d.next ? fmtDate(d.next) : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin registros</td></tr>'}</tbody></table>
    <p class="sm" style="margin-top:14px">Escanea el código QR para ver el carnet digital siempre actualizado · ${esc(pet.cardCode || '')} · SanoVet</p></body></html>`);
}
