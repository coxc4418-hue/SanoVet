// SanoVet — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a SanoVet! 🐾', text: 'En un minuto te mostramos cómo manejar tu clínica aquí: agenda, historia clínica de cada mascota, vacunas con carnet digital, peluquería y hospitalización, recordatorios por WhatsApp, tienda con inventario y caja. Usa “Siguiente” para avanzar o “Salir” cuando quieras. Puedes repetirlo desde el menú › Ayuda.' },
      { route: 'inicio', sel: ['.sb-nav', '.bottom-nav'], title: 'Menú principal', text: 'Agenda, mascotas, tutores, peluquería y hospital, recordatorios, vender, pedidos en línea, inventario, compras, facturas, caja, reportes y ajustes. Los números de colores son avisos: mascotas en sala de espera, vacunas por tocar, pedidos nuevos o productos por agotarse.' },
      { route: 'inicio', sel: ['#sb-search', '#tb-search'], title: 'Búsqueda rápida', text: 'Busca una mascota por su nombre, el de su tutor, el teléfono o el microchip; un producto por nombre o código de barras; o una factura. En la computadora: Ctrl + K.' },
      { route: 'inicio', sel: ['[data-tour="quick"]'], title: 'Accesos rápidos', text: 'Nueva consulta, agendar cita, vender y registrar una mascota. Atajos: F1 vender, F3 mascotas, F5 agenda.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Tu clínica hoy', text: 'Citas del día, ventas, vacunas por tocar, mascotas en la clínica, productos bajo el mínimo y total de pacientes.' },
      { route: 'inicio', sel: ['[data-tour="today"]'], title: 'Citas de hoy', text: 'Marca “Llegó” cuando el tutor entra y la mascota pasa a la sala de espera. Con “Atender” abres la consulta con sus datos listos.' },
      { route: 'inicio', sel: ['[data-tour="due"]'], title: 'Vacunas y controles', text: 'Las mascotas a las que les toca (o ya se les pasó) una vacuna, desparasitación o control. Escríbele al tutor por WhatsApp con el mensaje listo.' },
      { route: 'agenda', sel: ['[data-tour="week"]'], title: 'Agenda', text: 'Cambia de día en la semana y filtra por veterinario o peluquero. Ves cada cita con su estado y los espacios libres para agendar con un toque.' },
      { route: 'mascotas', sel: ['[data-tour="pet-filters"]'], title: 'Mascotas', text: 'Cada mascota tiene su ficha con foto, especie, raza, edad, peso, alergias y condiciones, historia clínica, vacunas, desparasitación, citas y compras. Filtra por especie o por vacunas pendientes.' },
      { route: 'mascotas', title: 'Historia clínica y récipe', text: 'En la consulta registras signos vitales (te avisa si algo está fuera de rango), diagnóstico, tratamiento y récipe. Lo imprimes o se lo mandas al tutor por WhatsApp y con “Guardar y cobrar” pasa directo a la caja.' },
      { route: 'sala', sel: ['[data-tour="groom"]'], title: 'Peluquería y hospital', text: 'La peluquería en columnas: recibido, bañando, secando y listo. Al terminar le avisas al tutor por WhatsApp. Los hospitalizados con su bitácora de evolución.' },
      { route: 'recordatorios', sel: ['[data-tour="rem-tabs"]'], title: 'Recordatorios', text: 'Vacunas, controles, cumpleaños, saldos pendientes, planes y puntos. Cada uno con su botón de WhatsApp y el mensaje listo para que el tutor vuelva.' },
      { route: 'vender', sel: ['[data-tour="pos-client"]'], title: 'Vender y cobrar', text: 'Elige la mascota y cobra la consulta, los servicios y los productos juntos: alimento por saco o por kilo, antiparasitarios, accesorios. Varias formas de pago, crédito, plan o seguro.' },
      { route: 'inicio', title: '¡A atender! 🎉', text: 'Prueba ahora: en Inicio marca que llegó una cita y atiéndela, o en Mascotas abre a Max y mira su carnet de vacunas con QR. Más recorridos en el menú › Ayuda.', final: true }
    ]
  },
  clinica: {
    name: 'Consultas y vacunas', desc: 'Historia clínica, récipe, vacunas y carnet digital', icon: 'stethoscope',
    steps: [
      { route: 'mascotas', sel: ['[data-tour="pet-new"]'], title: 'Nueva mascota', text: 'Registra la mascota y su tutor en un solo paso. Si el tutor ya existe, solo lo eliges; un tutor puede tener varias mascotas.' },
      { route: 'mascotas', sel: ['[data-tour="pet-filters"]'], title: 'La ficha', text: 'Abre una mascota para ver su resumen: alergias, condiciones, peso con su gráfica, próxima vacuna y último diagnóstico. Desde ahí registras consulta, vacuna, desparasitación o cita.' },
      { route: 'mascotas', title: 'Vacunas y desparasitación', text: 'Cada vacuna calcula sola su próxima dosis según el catálogo (lo ajustas en Ajustes › Vacunas y agenda). Las vencidas se ven en rojo y entran a Recordatorios.' },
      { route: 'mascotas', title: 'Carnet digital con QR', text: 'Cada mascota tiene su carnet en línea: el tutor lo abre en su teléfono y ve sus vacunas, desparasitaciones y próximo control. Imprímelo o mándalo por WhatsApp.', final: true }
    ]
  },
  agenda: {
    name: 'Agenda, peluquería y hospital', desc: 'Citas, sala de espera, baños e internados', icon: 'calendar',
    steps: [
      { route: 'agenda', sel: ['[data-tour="appt-new"]'], title: 'Nueva cita', text: 'Elige la mascota, el servicio, quién la atiende, el día y la hora. Si esa persona ya tiene una cita a esa hora, te avisa.' },
      { route: 'agenda', sel: ['[data-tour="agenda-list"]'], title: 'El día', text: 'Las citas con su estado: pendiente, confirmada, llegó, atendida o no vino. Confirma por WhatsApp con un toque.' },
      { route: 'sala', sel: ['[data-tour="groom"]'], title: 'Peluquería', text: 'Recibe la mascota, avanza cada etapa y cuando esté lista avisa al tutor. Al entregar, cobras los servicios en caja.' },
      { route: 'sala', sel: ['[data-tour="hosp"]'], title: 'Hospitalización', text: 'Cada internado con su estado (internado, en observación, crítico, alta) y su bitácora de evolución. Al dar de alta, cobras los días y el tratamiento.', final: true }
    ]
  },
  compras: {
    name: 'Tienda, compras, caja y reportes', desc: 'Inventario, proveedores, cuentas por pagar y reportes', icon: 'truck',
    steps: [
      { route: 'inventario', sel: ['[data-tour="inv-tabs"]', '#i-tabs'], title: 'Inventario por lotes', text: 'Alimentos, vacunas, antiparasitarios, medicamentos y accesorios con sus lotes y vencimientos. Vende el alimento por saco o por kilo y los medicamentos por caja o por unidad.' },
      { route: 'compras', sel: ['#p-tabs'], title: 'Compras', text: 'El sugerido te arma el pedido con lo que está bajo el mínimo. Envía la orden al proveedor por WhatsApp y al recibirla registra lote, vencimiento y costo.' },
      { route: 'pedidos', sel: ['#o-tabs', '#view'], title: 'Pedidos en línea', text: 'Los tutores piden alimento y accesorios desde tu catálogo en línea, con delivery o para retirar. Los aceptas, los preparas y los cobras con un toque.' },
      { route: 'caja', sel: ['#view'], title: 'Caja', text: 'Abre la caja con el fondo inicial; cada cobro suma por forma de pago. Registra gastos e ingresos, y al cerrar compara lo contado con lo esperado.' },
      { route: 'caja', sel: ['.sb-nav [data-nav="reportes"]', '#view'], title: 'Reportes', text: 'Ventas y servicios por día, ganancia, productos más vendidos, horas pico, ventas por veterinario y valor del inventario. Protegidos con el PIN (en la demo: 1234).', final: true }
    ]
  }
};
let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('sg_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final && videoOk ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-vet-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar SanoVet, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

let videoOk = null;
async function hasVideo() {
  if (videoOk != null) return videoOk;
  try { const r = await fetch(VIDEO_URL, { method: 'HEAD' }); videoOk = r.ok && /video/.test(r.headers.get('content-type') || ''); } catch (_) { videoOk = false; }
  return videoOk;
}

export async function openHelp() {
  const video = await hasVideo();
  const m = openModal({
    title: 'Ayuda', sub: video ? 'Elige un recorrido guiado o mira el video tutorial' : 'Elige un recorrido guiado', size: 'md',
    body: `<div class="stack">
      ${video ? `<button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>` : ''}
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  const vb = m.el.querySelector('[data-video]'); if (vb) vb.onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
