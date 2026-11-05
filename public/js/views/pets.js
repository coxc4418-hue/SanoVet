// SanoVet — Mascotas: pacientes con filtros por especie y plan sanitario, búsqueda, importar y exportar
import { store } from '../store.js';
import { savePet } from '../ops.js';
import { esc, normalize, debounce, emptyState, toast, download, toCSV, parseCSV, openModal, setBusy, todayKey, fmtDate, parseNum } from '../utils.js';
import { icon } from '../icons.js';
import { SPECIES, speciesOf, dueItems, dueTone, dueText, petAge, PET_SEX } from '../vet.js';
import { petAvatar, openPet, petForm, petLine, alertsHTML, dueBadge } from '../client.js';

const FILTERS = {
  all: ['Todas', () => true],
  due: ['Vacuna o desparasitación por tocar', (p) => dueItems(p).some((x) => x.d <= (Number(store.settings.reminderDays) || 7))],
  late: ['Plan vencido', (p) => dueItems(p).some((x) => x.d < 0)],
  noplan: ['Sin plan sanitario', (p) => !dueItems(p).length],
  control: ['Con control pendiente', (p) => !!p.nextControl && p.nextControl >= todayKey()],
  alergias: ['Con alergias', (p) => (p.allergies || []).length > 0],
  cronicos: ['Con condición crónica', (p) => (p.conditions || []).length > 0],
  cachorros: ['Cachorros (< 1 año)', (p) => p.birthDate && (Date.now() - new Date(p.birthDate)) < 365 * 864e5],
  senior: ['Senior (8+ años)', (p) => p.birthDate && (Date.now() - new Date(p.birthDate)) > 8 * 365.25 * 864e5],
  baja: ['De baja / fallecidas', (p) => p.active === false || p.deceased]
};

export function mount(el, { params = {} }) {
  let filter = params.filter || 'all'; let q = ''; let sort = 'name'; let sp = '';
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Mascotas</h1><p class="view-sub" id="p-sub"></p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="p-imp">${icon('upload')} Importar</button><button class="btn btn-secondary" id="p-exp">${icon('download')} Exportar</button><button class="btn btn-primary" id="p-new" data-tour="pet-new">${icon('plus')} Nueva mascota</button></div></div>
    <div class="card card-flush">
      <div class="toolbar"><label class="search">${icon('search')}<input id="p-q" placeholder="Mascota, tutor, raza, teléfono o microchip…"></label>
        <div class="row" style="gap:6px"><select class="select select-sm" id="p-sp" style="width:auto"><option value="">Todas las especies</option>${Object.entries(SPECIES).map(([k, v]) => `<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}</select>
        <select class="select select-sm" id="p-sort" style="width:auto"><option value="name">A–Z</option><option value="due">Próxima vacuna</option><option value="recent">Última visita</option><option value="new">Recién registradas</option></select></div></div>
      <div class="chips" id="p-chips" data-tour="pet-filters" style="padding:0 14px 12px"></div>
      <div id="p-list"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const firstDue = (p) => dueItems(p)[0]?.d ?? 9999;
  const rows = () => {
    const t = normalize(q); const d = q.replace(/\D/g, '');
    const f = FILTERS[filter][1];
    const list = store.pets.filter((p) => (filter === 'baja' ? f(p) : p.active !== false && !p.deceased && f(p)) && (!sp || p.species === sp)
      && (!t || normalize(`${p.name} ${p.number || ''} ${p.ownerName || ''} ${p.breed || ''} ${p.chip || ''} ${p.cardCode || ''}`).includes(t) || (d.length >= 4 && String(p.ownerPhone || '').replace(/\D/g, '').includes(d))));
    const S = {
      name: (a, b) => a.name.localeCompare(b.name, 'es'),
      due: (a, b) => firstDue(a) - firstDue(b),
      recent: (a, b) => (b.lastVisitAt || '').localeCompare(a.lastVisitAt || ''),
      new: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
    };
    return list.sort(S[sort]);
  };
  function draw() {
    const live = store.livePets;
    const bySp = Object.keys(SPECIES).map((k) => [k, live.filter((p) => p.species === k).length]).filter(([, n]) => n);
    $('#p-sub').textContent = `${live.length} mascota(s) · ${bySp.map(([k, n]) => `${n} ${SPECIES[k].label.toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ')}`;
    $('#p-chips').innerHTML = Object.entries(FILTERS).map(([k, [l, fn]]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l} <span class="count">${k === 'baja' ? store.pets.filter(fn).length : live.filter(fn).length}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
    const list = rows();
    $('#p-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table table-hover table-cards"><thead><tr><th>Mascota</th><th class="hide-sm">Tutor</th><th>Plan sanitario</th><th class="hide-sm">Última visita</th></tr></thead><tbody>
      ${list.slice(0, 300).map((p) => `<tr data-id="${p.id}" style="cursor:pointer">
        <td><div class="row">${petAvatar(p)}<div style="min-width:0"><div class="t-name ellipsis">${esc(p.name)}${p.deceased ? ' 🕊️' : ''}</div><div class="t-sub ellipsis">${esc(petLine(p))}</div>${alertsHTML(p, true)}</div></div></td>
        <td class="hide-sm small"><b>${esc(p.ownerName || '')}</b><div class="t-sub">${esc(p.ownerPhone || '')}</div></td>
        <td>${p.active === false || p.deceased ? '<span class="badge badge-neutral">De baja</span>' : dueBadge(p)}</td>
        <td class="hide-sm small">${p.lastVisitAt ? fmtDate(p.lastVisitAt) : '<span class="faint">—</span>'}${p.lastDx ? `<div class="t-sub ellipsis" style="max-width:220px">${esc(p.lastDx)}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>${list.length > 300 ? `<div class="small muted center" style="padding:10px">Mostrando 300 de ${list.length}. Usa la búsqueda.</div>` : ''}`
      : `<div style="padding:8px 16px 20px">${store.pets.length ? emptyState('paw', 'Ninguna mascota en este filtro', q ? 'Prueba con otra búsqueda.' : '') : emptyState('paw', 'Aún no hay mascotas', 'Registra la primera con “Nueva mascota” o impórtalas desde Excel (CSV).')}</div>`;
    el.querySelectorAll('[data-id]').forEach((r) => r.onclick = () => openPet(r.dataset.id));
  }
  $('#p-q').oninput = debounce((e) => { q = e.target.value; draw(); }, 100);
  $('#p-q').onkeydown = (e) => { if (e.key === 'Enter') { const p = store.findPet(e.target.value); if (p) openPet(p.id); } };
  $('#p-sort').onchange = (e) => { sort = e.target.value; draw(); };
  $('#p-sp').onchange = (e) => { sp = e.target.value; draw(); };
  $('#p-new').onclick = async () => { const r = await petForm(); if (r) openPet(r.pet.id); };
  $('#p-exp').onclick = () => exportCSV(rows());
  $('#p-imp').onclick = () => importCSV();
  draw();
  const off = store.on('*', (evt) => { if (evt === 'pets' || evt === 'clients' || evt === 'settings') draw(); });
  return () => off();
}

function exportCSV(list) {
  const head = ['N°', 'Nombre', 'Especie', 'Raza', 'Sexo', 'Nacimiento', 'Edad', 'Peso (kg)', 'Color', 'Microchip', 'Esterilizado', 'Alergias', 'Condiciones', 'Tutor', 'Teléfono', 'Próxima vacuna/desparasitación', 'Fecha', 'Próximo control', 'Visitas', 'Última visita', 'Carnet'];
  const data = list.map((p) => { const d = dueItems(p)[0]; return [p.number, p.name, speciesOf(p).label, p.breed || '', PET_SEX[p.sex] || '', p.birthDate || '', petAge(p.birthDate), p.weight || '', p.color || '', p.chip || '', p.neutered ? 'Sí' : 'No', (p.allergies || []).join('; '), (p.conditions || []).join('; '), p.ownerName || '', p.ownerPhone || '', d?.name || '', d?.next || '', p.nextControl || '', p.visits || 0, (p.lastVisitAt || '').slice(0, 10), p.cardCode || '']; });
  download(`mascotas-${todayKey()}.csv`, toCSV([head, ...data]), 'text/csv;charset=utf-8');
  toast(`${data.length} mascota(s) exportadas`);
}

const SP_ALIAS = { perro: 'perro', perra: 'perro', canino: 'perro', canina: 'perro', gato: 'gato', gata: 'gato', felino: 'gato', felina: 'gato', ave: 'ave', loro: 'ave', perico: 'ave', conejo: 'conejo', hamster: 'roedor', roedor: 'roedor', cobayo: 'roedor', reptil: 'reptil', tortuga: 'reptil', iguana: 'reptil' };
function importCSV() {
  const m = openModal({
    title: 'Importar mascotas', sub: 'Con su tutor, desde Excel guardado como CSV', size: 'md',
    body: `<div class="stack"><p class="small" style="margin:0">La primera fila debe tener los títulos. Se reconocen: <b>Mascota</b> (obligatorio), <b>Especie</b>, <b>Raza</b>, <b>Sexo</b>, <b>Nacimiento</b>, <b>Peso</b>, <b>Color</b>, <b>Microchip</b>, <b>Tutor</b> (obligatorio), <b>Teléfono</b>. Si el teléfono ya existe, la mascota se agrega a ese tutor.</p>
      <input type="file" accept=".csv,text/csv" class="input" data-file><div data-prev></div><div class="error-msg" data-err></div></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok disabled>${icon('upload')} Importar</button>`
  });
  let parsed = [];
  const pick = (h, ...keys) => h.findIndex((x) => keys.some((k) => normalize(x).includes(k)));
  const toDate = (v) => { const s = String(v || '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); if (!d) return ''; const y = d[3].length === 2 ? (Number(d[3]) > 40 ? '19' : '20') + d[3] : d[3]; return `${y}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; };
  m.el.querySelector('[data-file]').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rowsIn = parseCSV(await f.text()).filter((r) => r.some((x) => String(x).trim()));
    const h = rowsIn.shift() || [];
    const ix = { name: pick(h, 'mascota', 'paciente', 'nombre mascota'), species: pick(h, 'especie'), breed: pick(h, 'raza'), sex: pick(h, 'sexo'), birthDate: pick(h, 'nacimiento', 'fecha nac'), weight: pick(h, 'peso'), color: pick(h, 'color', 'pelaje'), chip: pick(h, 'chip'), owner: pick(h, 'tutor', 'dueno', 'propietario', 'cliente'), phone: pick(h, 'telefono', 'celular', 'whatsapp') };
    if (ix.name < 0 || ix.owner < 0) { m.el.querySelector('[data-err]').textContent = 'Necesito al menos las columnas “Mascota” y “Tutor”.'; return; }
    parsed = rowsIn.map((r) => {
      const g = (k) => (ix[k] >= 0 ? String(r[ix[k]] ?? '').trim() : '');
      const sx = normalize(g('sex'));
      return { name: g('name'), species: SP_ALIAS[normalize(g('species')).split(' ')[0]] || (g('species') ? 'otro' : 'perro'), breed: g('breed'), sex: sx.startsWith('h') || sx.startsWith('f') ? 'hembra' : sx.startsWith('m') ? 'macho' : '', birthDate: toDate(g('birthDate')), weight: parseNum(g('weight')), color: g('color'), chip: g('chip'), owner: { name: g('owner'), phone: g('phone') } };
    }).filter((x) => x.name && x.owner.name);
    m.el.querySelector('[data-prev]').innerHTML = `<div class="box small"><b>${parsed.length}</b> mascota(s) listas para importar.<div class="t-sub mt-xs">${parsed.slice(0, 4).map((x) => `${esc(x.name)} (${esc(x.owner.name)})`).join(' · ')}${parsed.length > 4 ? '…' : ''}</div></div>`;
    m.el.querySelector('[data-ok]').disabled = !parsed.length;
  };
  m.el.querySelector('[data-ok]').onclick = async (e) => {
    const btn = e.currentTarget; setBusy(btn, true, 'Importando…');
    const owners = new Map(); let ok = 0;
    for (const x of parsed) {
      const k = x.owner.phone.replace(/\D/g, '').slice(-8) || normalize(x.owner.name);
      try { const { owner, ...data } = x; const r = await savePet(data, null, owners.get(k) || owner); owners.set(k, r.owner); ok++; btn.textContent = `Importando ${ok}/${parsed.length}…`; } catch (err) { console.warn(err.message); }
    }
    m.close(); toast(`${ok} mascota(s) importadas`);
  };
}
