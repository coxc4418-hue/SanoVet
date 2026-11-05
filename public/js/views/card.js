// SanoVet — Carnet digital público de la mascota: /carnet/CODIGO (sin sesión)
import { getCard } from '../store.js';
import { esc, fmtDate, todayKey, fromKey, waLink, applyLocale } from '../utils.js';
import { icon } from '../icons.js';
import { qrDataURL } from '../shared.js';
import { SPECIES, PET_SEX, petAge, DEWORM, latestBy } from '../vet.js';

const days = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);
const tone = (d) => (d == null ? '' : d < 0 ? 'late' : d <= 15 ? 'due' : 'ok');
const txt = (d) => (d == null ? '' : d < 0 ? `Vencida hace ${-d} d` : d === 0 ? 'Toca hoy' : d === 1 ? 'Toca mañana' : `En ${d} días`);

export async function mount(root) {
  document.title = 'Carnet de vacunas · SanoVet';
  const code = (/\/carnet\/([A-Z0-9]+)/i.exec(location.pathname)?.[1] || '').toUpperCase();
  root.innerHTML = '<div class="pcard-page"><div class="empty"><div class="spinner"></div></div></div>';
  let c = null;
  try { c = code ? await getCard(code) : null; } catch (e) { console.error(e); }
  if (!c) {
    root.innerHTML = `<div class="pcard-page"><div class="mcard mcard-err"><img src="/assets/logo.svg" alt="" width="64"><h1>Carnet no encontrado</h1><p>El código <b>${esc(code || '—')}</b> no existe o fue renovado. Pide el carnet actualizado en tu veterinaria.</p><a class="btn btn-primary" href="/">Ir a SanoVet</a></div></div>`;
    return;
  }
  try { applyLocale(c.country || 'VE'); } catch (_) {}
  const qr = await qrDataURL(location.origin + '/carnet/' + code, 6);
  const t = todayKey();
  const sp = SPECIES[c.species] || SPECIES.otro;
  const vacLast = latestBy(c.vaccines || []).map((v) => ({ ...v, d: v.next ? days(t, v.next) : null })).sort((a, b) => (a.d ?? 999) - (b.d ?? 999));
  const dewLast = Object.keys(DEWORM).map((k) => (c.deworm || []).filter((x) => x.kind === k).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]).filter(Boolean).map((x) => ({ ...x, d: x.next ? days(t, x.next) : null }));
  const shop = c.shopSlug ? `/pedido/${encodeURIComponent(c.shopSlug)}` : '';
  const nextUp = [...vacLast, ...dewLast].filter((x) => x.d != null && x.d <= 30).map((x) => x.name || x.product);
  const wa = c.shopPhone ? waLink(c.shopPhone, `Hola, soy ${c.owner || 'el tutor'} de ${c.name} (${c.number}). Quiero agendar${nextUp.length ? `: ${nextUp.slice(0, 3).join(', ')}` : ' una cita'}.`) : '';

  root.innerHTML = `<div class="pcard-page">
    <div class="mcard vcard">
      <div class="mcard-top"><img src="/assets/logo.svg" alt=""><div class="grow"><b>${esc(c.shop || 'Mi veterinaria')}</b><small>Carnet de vacunación</small></div>${c.active ? '' : '<span class="mcard-badge tone-neutral">Inactivo</span>'}</div>
      <div class="vcard-pet">${c.photo ? `<img class="vcard-photo" src="${esc(c.photo)}" alt="">` : `<div class="vcard-photo vcard-emoji" style="background:${sp.color}22">${sp.emoji}</div>`}
        <div class="grow" style="min-width:0"><div class="mcard-name">${esc(c.name)}</div><div class="mcard-num">${esc([sp.label, c.breed, c.sex ? PET_SEX[c.sex] : '', petAge(c.birthDate)].filter(Boolean).join(' · '))}</div><div class="mcard-num">${esc(c.number)}${c.chip ? ` · Chip ${esc(c.chip)}` : ''}${c.weight ? ` · ${c.weight} kg` : ''}</div></div></div>
      ${(c.allergies || []).length ? `<div class="vcard-alert">${icon('alert')} Alergias: <b>${c.allergies.map(esc).join(', ')}</b></div>` : ''}
      <div class="mcard-meds"><b>${icon('syringe')} Vacunas</b>${vacLast.length ? vacLast.map((v) => `<div class="mcard-med ${tone(v.d)}"><div class="grow"><b>${esc(v.name)}</b><small>Aplicada ${fmtDate(v.date)}${v.lot ? ` · lote ${esc(v.lot)}` : ''}</small></div><span>${v.next ? `${txt(v.d)}<small>${fmtDate(v.next)}</small>` : '—'}</span></div>`).join('') : '<p>Aún no hay vacunas registradas.</p>'}</div>
      <div class="mcard-meds"><b>${icon('shield')} Desparasitación</b>${dewLast.length ? dewLast.map((x) => `<div class="mcard-med ${tone(x.d)}"><div class="grow"><b>${esc(DEWORM[x.kind]?.label || '')}</b><small>${esc(x.product)} · ${fmtDate(x.date)}</small></div><span>${x.next ? `${txt(x.d)}<small>${fmtDate(x.next)}</small>` : '—'}</span></div>`).join('') : '<p>Sin registros.</p>'}</div>
      ${c.nextControl && c.nextControl >= t ? `<div class="vcard-next">${icon('calendar')} Próximo control: <b>${fmtDate(c.nextControl)}</b></div>` : ''}
      ${(c.vaccines || []).length > vacLast.length ? `<details class="vcard-hist"><summary>Historial completo de vacunas (${c.vaccines.length})</summary>${c.vaccines.map((v) => `<div class="between small"><span>${esc(v.name)}</span><span>${fmtDate(v.date)}</span></div>`).join('')}</details>` : ''}
      <div class="mcard-qr"><img src="${qr}" alt="QR del carnet"></div>
      <p class="mcard-hint">Muestra este código en recepción para abrir la ficha de ${esc(c.name)}.</p>
      <div class="mcard-foot">${wa ? `<a class="btn btn-whatsapp btn-sm" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Agendar cita</a>` : ''}${shop ? `<a class="btn btn-primary btn-sm" href="${shop}">${icon('bag')} Pedir alimento y productos</a>` : ''}${c.instagram ? `<a class="btn btn-secondary btn-sm" href="https://instagram.com/${esc(c.instagram.replace('@', ''))}" target="_blank" rel="noopener">${esc(c.instagram)}</a>` : ''}${c.shopAddress ? `<small>${icon('pin')} ${esc(c.shopAddress)}</small>` : ''}${c.vetName ? `<small>${icon('stethoscope')} M.V. ${esc(c.vetName)}${c.vetLicense ? ' · ' + esc(c.vetLicense) : ''}</small>` : ''}</div>
    </div>
    <p class="pcard-by">Hecho con <b>SanoVet</b> · Agrega esta página a tu pantalla de inicio para tener el carnet siempre a mano.</p>
  </div>`;
}
