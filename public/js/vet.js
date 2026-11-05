// SanoVet — Conocimiento veterinario: especies, razas, vacunas, desparasitación, signos vitales, agenda, peluquería y hospitalización,
// más presentaciones, fraccionado, lotes (FEFO) y equivalentes del inventario
import { round2, normalize, todayKey, dayKey, addDays, fromKey, qtyFmt } from './utils.js';

// ======================================================================
// PACIENTES (MASCOTAS)
// ======================================================================
export const SPECIES = {
  perro: { label: 'Perro', emoji: '🐶', color: '#ea580c' },
  gato: { label: 'Gato', emoji: '🐱', color: '#7c3aed' },
  ave: { label: 'Ave', emoji: '🦜', color: '#16a34a' },
  conejo: { label: 'Conejo', emoji: '🐰', color: '#db2777' },
  roedor: { label: 'Roedor', emoji: '🐹', color: '#ca8a04' },
  reptil: { label: 'Reptil', emoji: '🦎', color: '#0d9488' },
  otro: { label: 'Otro', emoji: '🐾', color: '#2563eb' }
};
export const speciesOf = (p) => SPECIES[p?.species] || SPECIES.otro;
export const BREEDS = {
  perro: ['Mestizo', 'Poodle', 'Shih Tzu', 'Yorkshire Terrier', 'Chihuahua', 'Labrador Retriever', 'Golden Retriever', 'Pastor Alemán', 'Schnauzer', 'Pinscher', 'Beagle', 'Bulldog Francés', 'Bulldog Inglés', 'Pitbull', 'Rottweiler', 'Husky Siberiano', 'Dachshund', 'Maltés', 'Pug', 'Cocker Spaniel', 'Boxer', 'Border Collie', 'Pomerania', 'Doberman'],
  gato: ['Mestizo (común europeo)', 'Siamés', 'Persa', 'Angora', 'Maine Coon', 'Bengalí', 'Ragdoll', 'Británico de pelo corto', 'Esfinge'],
  ave: ['Periquito', 'Cotorra', 'Loro', 'Canario', 'Cacatúa', 'Agaporni', 'Gallina'],
  conejo: ['Mestizo', 'Cabeza de león', 'Belier', 'Mini Rex'],
  roedor: ['Hámster', 'Cobayo', 'Chinchilla', 'Rata', 'Ratón'],
  reptil: ['Tortuga', 'Iguana', 'Morrocoy', 'Gecko', 'Serpiente'],
  otro: []
};
export const PET_SEX = { M: 'Macho', H: 'Hembra' };
export const COATS = ['Negro', 'Blanco', 'Marrón', 'Dorado', 'Gris', 'Atigrado', 'Tricolor', 'Bicolor', 'Manchado', 'Crema', 'Carey'];

/** Edad legible: "3 años", "8 meses", "3 semanas" */
export function petAge(birth) {
  if (!birth) return '';
  const b = fromKey(birth.slice(0, 10)); const n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months--;
  if (months >= 24) return `${Math.floor(months / 12)} años`;
  if (months >= 12) return `1 año${months % 12 ? ` y ${months % 12} m` : ''}`;
  if (months >= 1) return `${months} mes${months === 1 ? '' : 'es'}`;
  const w = Math.max(0, Math.floor((n - b) / (7 * 864e5)));
  return `${w} semana${w === 1 ? '' : 's'}`;
}
export const ageYears = (birth) => (birth ? (Date.now() - fromKey(birth.slice(0, 10)).getTime()) / (365.25 * 864e5) : null);

export const PET_ALLERGIES = ['Penicilina', 'Sulfas', 'AINES (meloxicam, carprofeno)', 'Ivermectina (sensible MDR1)', 'Vacunas (reacción previa)', 'Pollo', 'Res', 'Granos / cereales', 'Pulgas (DAPP)', 'Látex'];
export const PET_CONDITIONS = ['Dermatitis', 'Otitis recurrente', 'Displasia de cadera', 'Insuficiencia renal', 'Cardiopatía', 'Diabetes', 'Epilepsia', 'Obesidad', 'Hipotiroidismo', 'Erliquia (tratada)', 'Leishmania', 'Moquillo (secuelas)', 'Artrosis', 'Leucemia felina (FeLV)', 'Inmunodeficiencia felina (FIV)', 'Braquicefálico'];
export const TEMPERAMENTS = { tranquilo: 'Tranquilo', nervioso: 'Nervioso', agresivo: 'Puede morder (usar bozal)' };

// ======================================================================
// PLAN SANITARIO: VACUNAS Y DESPARASITACIÓN
// ======================================================================
/** Catálogo inicial de vacunas: nombre, especie y cada cuántos días se repite */
export const VACCINES_DEFAULT = [
  { id: 'v_puppy', name: 'Puppy (parvovirus + moquillo)', species: 'perro', everyDays: 21, note: 'Cachorros desde las 6 semanas' },
  { id: 'v_sextuple', name: 'Séxtuple / Múltiple canina', species: 'perro', everyDays: 365, note: 'Moquillo, parvovirus, hepatitis, leptospira, parainfluenza, coronavirus' },
  { id: 'v_rabia', name: 'Antirrábica', species: 'todas', everyDays: 365, note: 'Obligatoria en la mayoría de los países' },
  { id: 'v_tos', name: 'Tos de las perreras (Bordetella)', species: 'perro', everyDays: 365, note: 'Para perros que van a guardería, peluquería o pensión' },
  { id: 'v_lepto', name: 'Leptospirosis (refuerzo)', species: 'perro', everyDays: 180, note: '' },
  { id: 'v_triple', name: 'Triple felina', species: 'gato', everyDays: 365, note: 'Panleucopenia, rinotraqueitis y calicivirus' },
  { id: 'v_felv', name: 'Leucemia felina (FeLV)', species: 'gato', everyDays: 365, note: 'Con prueba negativa previa' }
];
export const DEWORM = {
  interna: { label: 'Desparasitación interna', short: 'Interna', icon: 'pill', everyDays: 90 },
  externa: { label: 'Antipulgas y garrapatas', short: 'Externa', icon: 'shield', everyDays: 30 }
};
/** Lo más reciente de cada vacuna/desparasitante (las anteriores quedan como historial) */
export function latestBy(list = [], key = (x) => x.name) {
  const m = new Map();
  for (const x of [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''))) m.set(normalize(key(x)), x);
  return [...m.values()];
}
const daysTo = (k) => Math.round((fromKey(k) - fromKey(todayKey())) / 864e5);
/** Pendientes del plan sanitario de una mascota: [{ kind: 'vacuna'|'interna'|'externa', name, next, d }] */
export function dueItems(pet) {
  if (!pet || pet.active === false || pet.deceased) return [];
  const out = [];
  for (const v of latestBy(pet.vaccines || [])) if (v.next) out.push({ kind: 'vacuna', id: v.id, name: v.name, next: v.next, date: v.date, d: daysTo(v.next) });
  for (const k of Object.keys(DEWORM)) {
    const last = latestBy((pet.deworm || []).filter((x) => x.kind === k), () => k)[0];
    if (last?.next) out.push({ kind: k, id: last.id, name: last.product || DEWORM[k].label, next: last.next, date: last.date, d: daysTo(last.next) });
  }
  return out.sort((a, b) => a.d - b.d);
}
export const dueTone = (d) => (d == null ? 'neutral' : d < 0 ? 'danger' : d <= 7 ? 'warning' : d <= 30 ? 'info' : 'success');
export const dueText = (d) => (d == null ? '' : d < 0 ? `vencida hace ${-d} d` : d === 0 ? 'toca hoy' : d === 1 ? 'toca mañana' : `en ${d} d`);
export const kindLabel = (k) => (k === 'vacuna' ? 'Vacuna' : DEWORM[k]?.label || k);

// ======================================================================
// CONSULTA: SIGNOS VITALES (rangos orientativos por especie)
// ======================================================================
export const VITALS = {
  weight: { label: 'Peso', unit: 'kg', icon: 'scale' },
  temp: { label: 'Temperatura', unit: '°C', icon: 'thermometer', ranges: { perro: [37.5, 39.2], gato: [38, 39.2], conejo: [38.5, 40], ave: [40, 42] } },
  hr: { label: 'Frec. cardíaca', unit: 'lpm', icon: 'heart', ranges: { perro: [60, 160], gato: [140, 220], conejo: [180, 300] } },
  rr: { label: 'Frec. respiratoria', unit: 'rpm', icon: 'pulse', ranges: { perro: [10, 35], gato: [20, 40], conejo: [30, 60] } },
  tllc: { label: 'TLLC', unit: 's', icon: 'clock', ranges: { perro: [0, 2], gato: [0, 2] } },
  bcs: { label: 'Condición corporal', unit: '/9', icon: 'target', ranges: { perro: [4, 5], gato: [4, 5] } }
};
export const MUCOSA = ['Rosadas', 'Pálidas', 'Congestivas', 'Ictéricas', 'Cianóticas'];
export const HYDRATION = ['Normal', 'Deshidratación leve (5%)', 'Moderada (7%)', 'Severa (+10%)'];
/** [texto, tono] del valor según la especie */
export function vitalFlag(key, v, species) {
  const n = Number(v);
  const r = VITALS[key]?.ranges?.[species];
  if (!n || !r) return ['', 'neutral'];
  if (n > r[1]) return [key === 'bcs' ? 'Sobrepeso' : 'Alta', key === 'bcs' && n <= 6 ? 'warning' : 'danger'];
  if (n < r[0]) return [key === 'bcs' ? 'Delgado' : 'Baja', 'warning'];
  return ['Normal', 'success'];
}
export const CONSULT_TYPES = {
  consulta: { label: 'Consulta', icon: 'stethoscope', tone: 'brand' },
  control: { label: 'Control', icon: 'refresh', tone: 'info' },
  vacunacion: { label: 'Vacunación', icon: 'syringe', tone: 'success' },
  emergencia: { label: 'Emergencia', icon: 'alert', tone: 'danger' },
  cirugia: { label: 'Cirugía', icon: 'scissors', tone: 'violet' },
  domicilio: { label: 'Visita a domicilio', icon: 'home', tone: 'warning' }
};
export const ROUTES_ADM = ['Oral', 'Subcutánea (SC)', 'Intramuscular (IM)', 'Intravenosa (IV)', 'Tópica', 'Ótica', 'Oftálmica'];
export const FREQS = ['Cada 8 horas', 'Cada 12 horas', 'Cada 24 horas', 'Dosis única', 'Cada 7 días', 'Según necesidad'];
/** Diagnósticos frecuentes para elegir con un toque (el veterinario los ajusta) */
export const DX_QUICK = ['Gastroenteritis', 'Otitis externa', 'Dermatitis alérgica', 'Dermatitis por pulgas (DAPP)', 'Parasitosis intestinal', 'Erliquiosis', 'Traqueobronquitis (tos de las perreras)', 'Conjuntivitis', 'Infección urinaria', 'Enfermedad periodontal', 'Obesidad', 'Herida / laceración', 'Control sano', 'Moquillo', 'Parvovirosis'];

// ======================================================================
// EQUIPO Y AGENDA
// ======================================================================
export const STAFF_ROLES = { vet: 'Médico veterinario', groomer: 'Peluquero(a) canino', asistente: 'Asistente veterinario', caja: 'Recepción y caja' };
export const SERVICES = {
  consulta: { label: 'Consulta', icon: 'stethoscope', minutes: 30, role: 'vet', color: '#ea580c' },
  vacuna: { label: 'Vacunación', icon: 'syringe', minutes: 15, role: 'vet', color: '#16a34a' },
  control: { label: 'Control / revisión', icon: 'refresh', minutes: 20, role: 'vet', color: '#2563eb' },
  peluqueria: { label: 'Baño y peluquería', icon: 'scissors', minutes: 90, role: 'groomer', color: '#db2777' },
  cirugia: { label: 'Cirugía / esterilización', icon: 'bed', minutes: 120, role: 'vet', color: '#7c3aed' },
  laboratorio: { label: 'Laboratorio / ecografía', icon: 'flask', minutes: 30, role: 'vet', color: '#0891b2' },
  domicilio: { label: 'Visita a domicilio', icon: 'home', minutes: 60, role: 'vet', color: '#ca8a04' }
};
export const APPT_STATUS = {
  pendiente: { label: 'Por confirmar', tone: 'neutral', icon: 'clock' },
  confirmada: { label: 'Confirmada', tone: 'info', icon: 'check' },
  llego: { label: 'En sala de espera', tone: 'warning', icon: 'door' },
  atendida: { label: 'Atendida', tone: 'success', icon: 'checkCircle' },
  no_vino: { label: 'No vino', tone: 'danger', icon: 'x' },
  cancelada: { label: 'Cancelada', tone: 'neutral', icon: 'x' }
};
export const OPEN_APPT = ['pendiente', 'confirmada', 'llego'];
export const apptBadge = (s) => { const st = APPT_STATUS[s] || { label: s, tone: 'neutral' }; return `<span class="badge badge-${st.tone}"><i class="dotc"></i>${st.label}</span>`; };

// ======================================================================
// PELUQUERÍA Y HOSPITALIZACIÓN (mascotas dentro de la clínica)
// ======================================================================
export const GROOM_STATUS = {
  recibido: { label: 'Recibido', tone: 'neutral', icon: 'door' },
  banando: { label: 'En baño', tone: 'info', icon: 'droplet' },
  secando: { label: 'Secado y corte', tone: 'violet', icon: 'scissors' },
  listo: { label: 'Listo para retirar', tone: 'success', icon: 'bell' },
  entregado: { label: 'Entregado', tone: 'neutral', icon: 'check' }
};
export const GROOM_FLOW = ['recibido', 'banando', 'secando', 'listo', 'entregado'];
export const HOSP_STATUS = {
  internado: { label: 'Internado', tone: 'warning', icon: 'bed' },
  observacion: { label: 'En observación', tone: 'info', icon: 'eye' },
  critico: { label: 'Estado crítico', tone: 'danger', icon: 'alert' },
  alta: { label: 'De alta', tone: 'success', icon: 'checkCircle' }
};
export const GROOM_SERVICES = ['Baño medicado', 'Baño y corte', 'Corte de uñas', 'Limpieza de oídos', 'Deslanado', 'Corte higiénico', 'Baño antipulgas', 'Vaciado de glándulas'];

// ======================================================================
// INVENTARIO
// ======================================================================
export const FORMS = ['Tableta', 'Tableta masticable', 'Cápsula', 'Pipeta', 'Collar', 'Spray', 'Shampoo', 'Jarabe', 'Suspensión', 'Gotas', 'Inyectable', 'Vacuna', 'Crema', 'Ungüento', 'Saco de alimento', 'Lata / sobre', 'Snack', 'Juguete', 'Accesorio', 'Arena', 'Otro'];
export const CATEGORIES = ['Alimento para perros', 'Alimento para gatos', 'Alimento medicado', 'Snacks y premios', 'Vacunas', 'Antiparasitarios', 'Antibióticos', 'Antiinflamatorios y analgésicos', 'Dermatológicos y óticos', 'Vitaminas y suplementos', 'Higiene y shampoo', 'Arena y bandejas', 'Accesorios y juguetes', 'Collares y correas', 'Material médico', 'Servicios veterinarios', 'Servicios de peluquería', 'Otros'];

/** Condición de venta */
export const RX = {
  libre: { label: 'Venta libre', short: 'Libre', tone: 'success', icon: 'checkCircle', needs: false },
  receta: { label: 'Con récipe veterinario', short: 'Rx', tone: 'info', icon: 'file', needs: true },
  antibiotico: { label: 'Antibiótico (con récipe)', short: 'ATB', tone: 'warning', icon: 'shield', needs: true, retain: true },
  controlado: { label: 'Controlado (uso clínico)', short: 'Control.', tone: 'danger', icon: 'lock', needs: true, retain: true, book: true }
};
export const rxOf = (p) => RX[p?.rx] || RX.libre;
export const needsRx = (p) => !!rxOf(p).needs;
export const rxBadge = (p, short = false) => (p?.rx && p.rx !== 'libre' ? `<span class="badge badge-${rxOf(p).tone}">${short ? rxOf(p).short : rxOf(p).label}</span>` : '');

export const LOYALTY_DEFAULT = { enabled: true, per: 1, pointValue: 0.05, minRedeem: 100 };

// ======================================================================
// FRACCIONADO: el stock se guarda en UNIDADES (tabletas, pipetas, kilos de alimento a granel…)
// ======================================================================
export const PACKS = { caja: 'Completo', blister: 'Blíster / tira', unidad: 'Suelto' };
/** Unidades por caja */
export const upb = (p) => Math.max(1, Math.round(Number(p?.unitsPerBox) || 1));
export const fractionable = (p) => upb(p) > 1 && p?.fraction !== false;
export const hasBlister = (p) => fractionable(p) && Number(p?.blister) > 1 && Number(p.blister) < upb(p);
/** Cuántas unidades trae cada presentación */
export function packFactor(p, pack) {
  if (pack === 'unidad') return 1;
  if (pack === 'blister') return hasBlister(p) ? Math.round(Number(p.blister)) : upb(p);
  return upb(p);
}
/** Presentaciones que se pueden vender de este producto */
export function packsOf(p) {
  const out = ['caja'];
  if (hasBlister(p)) out.push('blister');
  if (fractionable(p)) out.push('unidad');
  return out;
}
/** Precio de venta de una presentación (la caja es el precio base; fraccionar tiene un recargo opcional) */
export function packPrice(p, pack, markup = 0) {
  const box = Number(p?.price) || 0;
  if (pack === 'caja' || !fractionable(p)) return round2(box);
  if (pack === 'unidad' && Number(p.unitPrice) > 0) return round2(p.unitPrice);
  if (pack === 'blister' && Number(p.blisterPrice) > 0) return round2(p.blisterPrice);
  const k = 1 + (Number(markup) || 0) / 100;
  return round2((box / upb(p)) * packFactor(p, pack) * k);
}
export const unitCost = (p) => (Number(p?.cost) || 0) / upb(p);
/** Nombre de la unidad suelta (tableta, kg, pipeta…) y del empaque completo (caja, saco…) */
export const unitName = (p) => String(p?.unitName || '').trim() || 'und';
export const boxName = (p) => String(p?.boxName || '').trim() || 'Caja';
export const packLabel = (p, pack) => {
  if (!fractionable(p) || pack === 'caja') return upb(p) > 1 ? `${boxName(p)} x${upb(p)} ${unitName(p)}` : 'Unidad';
  if (pack === 'blister') return `Blíster x${packFactor(p, 'blister')}`;
  return `Por ${unitName(p)}`;
};
/** "3 cajas + 5 und" */
export function stockText(p, units = p?.stock) {
  const u = Math.max(0, Math.round(Number(units) || 0));
  const k = upb(p);
  if (k <= 1) return `${qtyFmt(u)}`;
  const b = Math.floor(u / k); const r = u % k; const un = unitName(p); const bx = boxName(p).toLowerCase();
  if (!b) return `${r} ${un}`;
  return `${b} ${bx}${b === 1 ? '' : 's'}${r ? ` + ${r} ${un}` : ''}`;
}
export const boxesOf = (p, units = p?.stock) => (Number(units) || 0) / upb(p);

// ======================================================================
// LOTES Y VENCIMIENTOS (FEFO: lo que vence primero, sale primero)
// ======================================================================
export const lotsOf = (p) => (p?.lots || []).filter((l) => (Number(l.qty) || 0) > 0).sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
export const nextExpiry = (p) => lotsOf(p).find((l) => l.exp)?.exp || '';
/** Saca `units` de los lotes empezando por el que vence primero. Devuelve los lotes nuevos y lo que salió de cada uno. */
export function consumeLots(lots, units) {
  const list = (lots || []).map((l) => ({ ...l })).sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
  let left = Math.max(0, Number(units) || 0);
  const used = [];
  for (const l of list) {
    if (left <= 0) break;
    const q = Math.min(Number(l.qty) || 0, left);
    if (q <= 0) continue;
    l.qty = (Number(l.qty) || 0) - q; left -= q;
    used.push({ lot: l.lot || '', exp: l.exp || '', qty: q });
  }
  return { lots: list.filter((l) => l.qty > 0), used, missing: left };
}
/** Devuelve unidades a sus lotes (anulación o devolución) */
export function restoreLots(lots, used) {
  const list = (lots || []).map((l) => ({ ...l }));
  for (const u of used || []) {
    const hit = list.find((l) => (l.lot || '') === (u.lot || '') && (l.exp || '') === (u.exp || ''));
    if (hit) hit.qty = (Number(hit.qty) || 0) + u.qty; else list.push({ lot: u.lot || '', exp: u.exp || '', qty: u.qty });
  }
  return list.sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
}
/** Agrega una entrada a un lote (si ya existe el mismo lote y fecha, suma) */
export function addLot(lots, { lot = '', exp = '', qty = 0, cost = 0 }) {
  const list = (lots || []).map((l) => ({ ...l }));
  const hit = list.find((l) => (l.lot || '') === lot && (l.exp || '') === exp);
  if (hit) hit.qty = (Number(hit.qty) || 0) + qty; else list.push({ lot, exp, qty, cost: round2(cost), in: todayKey() });
  return list.filter((l) => l.qty > 0).sort((a, b) => (a.exp || '9999').localeCompare(b.exp || '9999'));
}
/** Días que faltan para vencer (negativo = vencido) */
export const daysToExpiry = (exp) => (exp ? Math.round((fromKey(exp) - fromKey(todayKey())) / 864e5) : null);
export function expiryTone(exp) {
  const d = daysToExpiry(exp);
  if (d == null) return ['', 'neutral'];
  if (d < 0) return ['Vencido', 'danger'];
  if (d <= 30) return [`Vence en ${d} d`, 'danger'];
  if (d <= 60) return [`Vence en ${d} d`, 'warning'];
  if (d <= 90) return [`Vence en ${d} d`, 'info'];
  return [`Vence ${exp.slice(5, 7)}/${exp.slice(2, 4)}`, 'neutral'];
}
export const expBadge = (exp) => { if (!exp) return ''; const [t, tone] = expiryTone(exp); return `<span class="badge badge-${tone}">${t}</span>`; };
export const limitDay = (days) => dayKey(addDays(new Date(), days));

// ======================================================================
// EQUIVALENTES (mismo principio activo y concentración)
// ======================================================================
const key = (s) => normalize(s).replace(/[^a-z0-9]+/g, ' ').trim();
export const molecule = (p) => key(p?.active || '');
export const strengthKey = (p) => key(p?.strength || '').replace(/\s+/g, '');
export function equivalents(p, products) {
  const m = molecule(p);
  if (!m) return [];
  const s = strengthKey(p);
  return products.filter((x) => x.id !== p.id && x.active !== false && x.sellable !== false && molecule(x) === m && (!s || !strengthKey(x) || strengthKey(x) === s))
    .sort((a, b) => (Number(a.price) / upb(a)) - (Number(b.price) / upb(b)));
}
/** Texto de búsqueda de un producto */
export const searchText = (p) => normalize(`${p.name} ${p.active || ''} ${p.strength || ''} ${p.form || ''} ${p.lab || ''} ${p.barcode || ''} ${p.sku || ''} ${p.category || ''} ${p.location || ''}`);
export const productLine = (p) => [p.active && p.active !== p.name ? p.active : '', p.strength, p.form, upb(p) > 1 ? `x${upb(p)}` : '', p.lab].filter(Boolean).join(' · ');
