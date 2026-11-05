// SanoVet — Modo demo (sesión anónima de 30 minutos) con una clínica veterinaria de ejemplo llena de vida
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, query, where, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS } from './store.js';
import { fmtSeq, genCode, cardData, clientFields, openShift, chargeSale, cashMovement, receivePurchase, createPurchaseOrder, setOrderStatus, cartTotals, agreementCalc, slugify, saveConsult } from './ops.js';
import { round2, nowISO, todayKey, dayKey, addDays, sha256, scaleUSD, PAY_METHODS } from './utils.js';
import { addLot, nextExpiry, packFactor, packPrice, unitCost, LOYALTY_DEFAULT, VACCINES_DEFAULT } from './vet.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';
export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['clients', 'pets', 'consults', 'appointments', 'stays', 'products', 'sales', 'prescriptions', 'purchases', 'suppliers', 'cash_shifts', 'cash_movements', 'inventory_logs', 'config'];
const BIZ = 'Clínica Veterinaria Patitas (demo)';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const AGREEMENTS = [
  { id: 'a_cachorro', name: 'Plan Cachorro Feliz', discount: 10, coverage: 0, scope: 'todo', contact: 'Vacunas y consultas del primer año', active: true },
  { id: 'a_seguro', name: 'Seguro PetCare', discount: 0, coverage: 70, scope: 'todo', contact: 'Reembolsos: 0212-5551100', active: true },
  { id: 'a_fundacion', name: 'Fundación Huellitas (rescatados)', discount: 20, coverage: 0, scope: 'todo', contact: 'Coordinadora: Mariana Paz', active: true }
];
const STAFF = [
  { id: 's1', name: 'Dra. Valentina Rojas', role: 'vet', active: true },
  { id: 's2', name: 'Dr. Andrés Molina', role: 'vet', active: true },
  { id: 's3', name: 'Yuleisy Campos', role: 'groomer', active: true },
  { id: 's4', name: 'Daniela Rivas', role: 'caja', active: true }
];

export async function createDemoTenant(uid) {
  const expiresAt = Timestamp.fromMillis(Date.now() + DEMO_MINUTES * 60 * 1000);
  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();
  const ref = (name, id) => doc(db, 'tenants', uid, name, id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, rif: 'J-50000000-0', phone: '0212-5550000', whatsapp: '0414-5550000', email: 'demo@sanovet.app',
    address: 'Av. Principal de Los Samanes, local 4', instagram: '@clinicapatitas', schedule: 'Lun a sáb 8:00 a 19:00 · Emergencias 24 h',
    vetName: 'Dra. Valentina Rojas', vetLicense: 'CMV 4.512', sanitaryLicense: 'Permiso sanitario 2026-0911', consultFee: scaleUSD(15),
    agreements: AGREEMENTS, sellers: STAFF, loyalty: { ...LOYALTY_DEFAULT }, vaccines: VACCINES_DEFAULT, fractionMarkup: 10,
    shop: { ...DEFAULT_SETTINGS.shop, enabled: true, slug: `${slugify('Clinica Patitas')}-${uid.slice(0, 4).toLowerCase()}`, note: 'Delivery de alimento en 1 hora · Pago al recibir' },
    receiptFooter: '¡Gracias por confiarnos a tu mascota! 🐾'
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  await b.commit();
}

async function waitFor(cond, ms = 6000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}
const at = (daysAgo, h, m = 0) => { const d = addDays(new Date(), -daysAgo); d.setHours(h, m, 0, 0); return d; };
const inDays = (n) => dayKey(addDays(new Date(), n));
/** Fecha de nacimiento: años (y meses) atrás; birthdayIn → cumple en N días */
const born = (years, months = 0, birthdayIn = null) => {
  if (birthdayIn != null) { const t = addDays(new Date(), birthdayIn); return `${new Date().getFullYear() - years}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  return dayKey(addDays(new Date(), -Math.round(years * 365.25 + months * 30.4 + 11)));
};
function rng(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/** k, nombre, principio activo / línea, presentación, marca, categoría, condición, unidades por empaque, precio, costo, empaques, mínimo, ubicación, unidad suelta, nombre del empaque, [lotes [lote, vence en días, empaques]], vacuna */
const PRODUCTS = [
  ['dogchow', 'Dog Chow Adulto Raza Mediana 15 kg', 'Alimento seco', 'Saco de alimento', 'Purina', 'Alimento para perros', 'libre', 15, 38, 26, 6, 2, 'Depósito', 'kg', 'Saco', null],
  ['royalmini', 'Royal Canin Mini Adult 3 kg', 'Alimento seco premium', 'Saco de alimento', 'Royal Canin', 'Alimento para perros', 'libre', 1, 32, 22, 8, 3, 'E1', '', '', null],
  ['proplan', 'Pro Plan Cachorro Raza Pequeña 3 kg', 'Alimento seco cachorro', 'Saco de alimento', 'Purina', 'Alimento para perros', 'libre', 1, 29, 20, 5, 3, 'E1', '', '', null],
  ['whiskas', 'Whiskas Adulto Pescado 10 kg', 'Alimento seco', 'Saco de alimento', 'Whiskas', 'Alimento para gatos', 'libre', 10, 31, 21, 4, 2, 'Depósito', 'kg', 'Saco', null],
  ['catchow', 'Cat Chow Gatitos 1,5 kg', 'Alimento seco gatito', 'Saco de alimento', 'Purina', 'Alimento para gatos', 'libre', 1, 11, 7, 9, 4, 'E2', '', '', null],
  ['hills', 'Hill’s i/d Gastrointestinal lata 370 g', 'Dieta veterinaria', 'Lata / sobre', 'Hill’s', 'Alimento medicado', 'libre', 1, 4.5, 2.9, 14, 6, 'E3', '', '', [['ID2511', 20, 3], ['ID2610', 400, 11]]],
  ['sobre', 'Sobre Whiskas Carne 85 g', 'Alimento húmedo', 'Lata / sobre', 'Whiskas', 'Alimento para gatos', 'libre', 1, 1.1, 0.6, 40, 12, 'E2', '', '', null],
  ['dentastix', 'Dentastix Raza Mediana x7', 'Snack dental', 'Snack', 'Pedigree', 'Snacks y premios', 'libre', 1, 5.5, 3.4, 12, 4, 'F1', '', '', null],
  ['vac_puppy', 'Vacuna Nobivac Puppy DP', 'Parvovirus + moquillo', 'Vacuna', 'MSD', 'Vacunas', 'receta', 1, 12, 6, 10, 4, 'Nevera', '', '', [['NP2601', 150, 10]], true],
  ['vac_sext', 'Vacuna Séxtuple Vanguard Plus 5/L', 'Múltiple canina', 'Vacuna', 'Zoetis', 'Vacunas', 'receta', 1, 15, 7.5, 14, 5, 'Nevera', '', '', [['VG2603', 210, 14]], true],
  ['vac_rabia', 'Vacuna Antirrábica Rabisin', 'Rabia', 'Vacuna', 'Boehringer', 'Vacunas', 'receta', 1, 10, 4.5, 3, 5, 'Nevera', '', '', [['RB2512', 40, 3]], true],
  ['vac_triple', 'Vacuna Triple Felina Felocell', 'Panleucopenia, rinotraqueitis, calicivirus', 'Vacuna', 'Zoetis', 'Vacunas', 'receta', 1, 14, 7, 8, 3, 'Nevera', '', '', [['FC2602', 190, 8]], true],
  ['nexgard', 'NexGard 10,1-25 kg (caja x3)', 'Afoxolaner', 'Tableta masticable', 'Boehringer', 'Antiparasitarios', 'libre', 3, 36, 22, 9, 3, 'C1', 'tableta', 'Caja', null],
  ['bravecto', 'Bravecto 10-20 kg', 'Fluralaner', 'Tableta masticable', 'MSD', 'Antiparasitarios', 'libre', 1, 42, 28, 6, 2, 'C1', '', '', null],
  ['frontline', 'Frontline Plus perro 10-20 kg (x3)', 'Fipronil + metopreno', 'Pipeta', 'Boehringer', 'Antiparasitarios', 'libre', 3, 27, 16, 7, 3, 'C2', 'pipeta', 'Caja', null],
  ['revolution', 'Revolution gato 2,6-7,5 kg (x3)', 'Selamectina', 'Pipeta', 'Zoetis', 'Antiparasitarios', 'libre', 3, 30, 18, 2, 3, 'C2', 'pipeta', 'Caja', null],
  ['drontal', 'Drontal Plus perro 10 kg (x2)', 'Praziquantel + pirantel + febantel', 'Tableta', 'Elanco', 'Antiparasitarios', 'libre', 2, 9, 5, 15, 5, 'C3', 'tableta', 'Caja', null],
  ['milbemax', 'Milbemax gato (x2)', 'Milbemicina + praziquantel', 'Tableta', 'Elanco', 'Antiparasitarios', 'libre', 2, 10, 6, 8, 4, 'C3', 'tableta', 'Caja', null],
  ['seresto', 'Collar Seresto perro grande', 'Imidacloprid + flumetrina', 'Collar', 'Elanco', 'Antiparasitarios', 'libre', 1, 45, 30, 4, 2, 'Vitrina', '', '', null],
  ['synulox', 'Synulox 250 mg (x10)', 'Amoxicilina + ác. clavulánico', 'Tableta', 'Zoetis', 'Antibióticos', 'antibiotico', 10, 19, 11, 6, 2, 'B1', 'tableta', 'Caja', null],
  ['doxi', 'Doxiciclina 100 mg (x20)', 'Doxiciclina', 'Tableta', 'Ronaxan', 'Antibióticos', 'antibiotico', 20, 16, 8.5, 5, 2, 'B1', 'tableta', 'Caja', null],
  ['baytril', 'Baytril 50 mg (x10)', 'Enrofloxacina', 'Tableta', 'Elanco', 'Antibióticos', 'antibiotico', 10, 14, 7.5, 1, 2, 'B2', 'tableta', 'Caja', null],
  ['metacam', 'Metacam 1,5 mg/ml suspensión 10 ml', 'Meloxicam', 'Suspensión', 'Boehringer', 'Antiinflamatorios y analgésicos', 'receta', 1, 13, 7, 6, 2, 'B3', '', '', [['MC2512', 28, 2], ['MC2611', 420, 4]]],
  ['rimadyl', 'Rimadyl 100 mg (x14)', 'Carprofeno', 'Tableta masticable', 'Zoetis', 'Antiinflamatorios y analgésicos', 'receta', 14, 24, 14, 4, 2, 'B3', 'tableta', 'Caja', null],
  ['otomax', 'Otomax gotas óticas 15 ml', 'Gentamicina + betametasona + clotrimazol', 'Gotas', 'MSD', 'Dermatológicos y óticos', 'receta', 1, 15, 8, 5, 2, 'B4', '', '', null],
  ['shampoo', 'Shampoo Clorhexidina 4% 250 ml', 'Clorhexidina', 'Shampoo', 'Dermocanis', 'Higiene y shampoo', 'libre', 1, 11, 6, 9, 3, 'F2', '', '', null],
  ['omega', 'Omega 3 Nutri-Vet (60 cápsulas)', 'Ácidos grasos', 'Cápsula', 'Nutri-Vet', 'Vitaminas y suplementos', 'libre', 60, 18, 10, 5, 2, 'F3', 'cápsula', 'Frasco', null],
  ['arena', 'Arena aglomerante Cat’s Best 10 L', 'Arena vegetal', 'Arena', 'Cat’s Best', 'Arena y bandejas', 'libre', 1, 16, 10, 8, 3, 'Depósito', '', '', null],
  ['kong', 'Juguete Kong Classic M', '', 'Juguete', 'Kong', 'Accesorios y juguetes', 'libre', 1, 14, 8, 6, 2, 'Vitrina', '', '', null],
  ['correa', 'Correa retráctil 5 m', '', 'Accesorio', 'Flexi', 'Collares y correas', 'libre', 1, 19, 11, 5, 2, 'Vitrina', '', '', null],
  ['cono', 'Collar isabelino talla M', '', 'Accesorio', 'Kruuse', 'Material médico', 'libre', 1, 6, 3, 10, 4, 'G1', '', '', null],
  ['ringer', 'Solución Ringer lactato 500 ml', 'Ringer lactato', 'Inyectable', 'Baxter', 'Material médico', 'receta', 1, 4, 2, 20, 8, 'G2', '', '', null],
  ['jeringa', 'Jeringa 3 ml', '', 'Otro', 'BD', 'Material médico', 'libre', 1, 0.35, 0.12, 120, 40, 'G2', '', '', null]
];
/** Servicios: k, nombre, categoría, precio */
const SERVICES_LIST = [
  ['svc_consulta', 'Consulta general', 'Servicios veterinarios', 15],
  ['svc_control', 'Consulta de control', 'Servicios veterinarios', 8],
  ['svc_vacuna', 'Aplicación de vacuna', 'Servicios veterinarios', 5],
  ['svc_emerg', 'Consulta de emergencia', 'Servicios veterinarios', 30],
  ['svc_esteril', 'Esterilización canina (hasta 10 kg)', 'Servicios veterinarios', 90],
  ['svc_hosp', 'Hospitalización (por día)', 'Servicios veterinarios', 25],
  ['svc_hemato', 'Hematología completa', 'Servicios veterinarios', 18],
  ['svc_eco', 'Ecografía abdominal', 'Servicios veterinarios', 30],
  ['svc_banocorte', 'Baño y corte (raza pequeña)', 'Servicios de peluquería', 18],
  ['svc_banomed', 'Baño medicado', 'Servicios de peluquería', 15],
  ['svc_unas', 'Corte de uñas', 'Servicios de peluquería', 4],
  ['svc_oidos', 'Limpieza de oídos', 'Servicios de peluquería', 5],
  ['svc_deslanado', 'Deslanado', 'Servicios de peluquería', 20]
];
const COLORS = ['#ea580c', '#0ea5e9', '#16a34a', '#7c3aed', '#dc2626', '#ca8a04', '#db2777', '#2563eb'];
const SUPPLIERS = [
  ['sup1', 'Distribuidora Veterinaria Nacional', 'J-30123456-7', 'Ana Morales', '0212-5553300', 15],
  ['sup2', 'Alimentos Mascotas del Centro', 'J-40987654-3', 'Rubén Sosa', '0241-5554411', 30],
  ['sup3', 'Biológicos y Vacunas C.A.', 'J-29876543-1', 'Lorena Paz', '0212-5559900', 7]
];
/** k, nombre, teléfono, cédula, plan, saldo, visitas viejas (días desde la última visita si no hay consultas) */
const OWNERS = [
  ['maria', 'María Elena Gómez', '0414-1112233', 'V-6123456', 'a_seguro', 0],
  ['jose', 'José Luis Martínez', '0424-2223344', 'V-7234567', null, 18],
  ['carmen', 'Carmen Rodríguez', '0412-3334455', 'V-4345678', null, 0],
  ['luis', 'Luis Alberto Pérez', '0416-4445566', 'V-12456789', 'a_cachorro', 0],
  ['ana', 'Ana Karina Silva', '0414-5556677', 'V-20567890', null, 0],
  ['pedro', 'Pedro Castillo', '0424-6667788', 'V-5678901', 'a_seguro', 35],
  ['rosa', 'Rosa Elena Díaz', '0412-7778899', 'V-8789012', null, 0],
  ['miguel', 'Miguel Ángel Rojas', '0416-8889900', 'V-24890123', 'a_cachorro', 0],
  ['yolanda', 'Yolanda Herrera', '0414-9990011', 'V-10901234', 'a_fundacion', 0],
  ['jorge', 'Jorge Medina', '0424-1013141', 'V-17012345', null, 0],
  ['gabriela', 'Gabriela Paredes', '0414-1819202', 'V-26234098', null, 0],
  ['andres', 'Andrés Villalobos', '0424-2021222', 'V-11345109', null, 0],
  ['lucia', 'Lucía Fernández', '0412-2223242', 'V-14456210', null, 0]
];
/**
 * k, tutor, nombre, especie, raza, sexo, edad [años, meses, cumple en días], peso, color, esterilizado, alergias, condiciones, temperamento, dieta,
 * vacunas [[id del catálogo, aplicada hace (días)]], desparasitación [[tipo, producto, hace (días), cada (días)]], próximo control en días (o null)
 */
const PETS = [
  ['max', 'maria', 'Max', 'perro', 'Golden Retriever', 'macho', [6, 0, null], 31.5, 'Dorado', true, [], ['Artrosis'], 'tranquilo', 'Royal Canin Mobility', [['v_sextuple', 358], ['v_rabia', 360]], [['interna', 'Drontal Plus', 85, 90], ['externa', 'NexGard', 26, 30]], 4],
  ['luna', 'maria', 'Luna', 'gato', 'Siamés', 'hembra', [3, 0, null], 4.2, 'Crema y marrón', true, [], [], 'nervioso', 'Whiskas Adulto', [['v_triple', 340], ['v_rabia', 340]], [['interna', 'Milbemax gato', 100, 90]], null],
  ['rocky', 'jose', 'Rocky', 'perro', 'Pitbull', 'macho', [4, 2, null], 27, 'Atigrado', false, ['Pollo'], ['Dermatitis atópica'], 'agresivo', 'Dieta hipoalergénica (cordero)', [['v_sextuple', 372], ['v_rabia', 371]], [['externa', 'Bravecto', 100, 90]], null],
  ['nala', 'carmen', 'Nala', 'perro', 'Shih Tzu', 'hembra', [8, 5, 0], 6.1, 'Blanco y dorado', true, [], ['Enfermedad periodontal', 'Cardiopatía'], 'tranquilo', 'Royal Canin Mini Adult', [['v_sextuple', 300], ['v_rabia', 302]], [['interna', 'Drontal Plus', 60, 90], ['externa', 'Frontline Plus', 33, 30]], -1],
  ['toby', 'luis', 'Toby', 'perro', 'Poodle', 'macho', [0, 3, null], 2.4, 'Blanco', false, [], [], 'tranquilo', 'Pro Plan Cachorro', [['v_puppy', 19]], [['interna', 'Drontal Puppy', 19, 15]], 2],
  ['simba', 'ana', 'Simba', 'gato', 'Mestizo (común europeo)', 'macho', [1, 6, null], 4.8, 'Naranja atigrado', true, [], [], 'tranquilo', 'Cat Chow', [['v_triple', 360], ['v_rabia', 355], ['v_felv', 365]], [['interna', 'Milbemax gato', 88, 90]], null],
  ['kira', 'ana', 'Kira', 'perro', 'Labrador Retriever', 'hembra', [2, 0, 3], 26.4, 'Chocolate', true, [], [], 'tranquilo', 'Dog Chow Adulto', [['v_sextuple', 200], ['v_rabia', 200], ['v_tos', 200]], [['externa', 'Seresto', 120, 240]], null],
  ['coco', 'pedro', 'Coco', 'ave', 'Loro amazónico', 'macho', [12, 0, null], 0.45, 'Verde', false, [], [], 'nervioso', 'Semillas y frutas', [], [], null],
  ['bruno', 'rosa', 'Bruno', 'perro', 'Schnauzer', 'macho', [7, 3, null], 9.8, 'Sal y pimienta', true, ['Penicilina'], ['Diabetes'], 'tranquilo', 'Hill’s w/d', [['v_sextuple', 362], ['v_rabia', 380]], [['interna', 'Drontal Plus', 92, 90]], 7],
  ['mia', 'rosa', 'Mía', 'gato', 'Persa', 'hembra', [5, 0, null], 3.9, 'Blanco', true, [], ['Insuficiencia renal'], 'tranquilo', 'Royal Canin Renal', [['v_triple', 350]], [], 12],
  ['thor', 'miguel', 'Thor', 'perro', 'Husky Siberiano', 'macho', [0, 5, null], 14.2, 'Gris y blanco', false, [], [], 'tranquilo', 'Pro Plan Cachorro', [['v_puppy', 45], ['v_sextuple', 24]], [['interna', 'Drontal Puppy', 40, 30]], 1],
  ['lola', 'yolanda', 'Lola', 'perro', 'Mestizo', 'hembra', [3, 0, null], 12.6, 'Negro con blanco', true, [], [], 'nervioso', 'Dog Chow Adulto', [['v_sextuple', 380], ['v_rabia', 380]], [['interna', 'Drontal Plus', 130, 90]], null],
  ['pelusa', 'yolanda', 'Pelusa', 'conejo', 'Cabeza de león', 'hembra', [2, 0, null], 1.6, 'Gris', false, [], [], 'nervioso', 'Heno y pellets', [], [], null],
  ['zeus', 'jorge', 'Zeus', 'perro', 'Pastor Alemán', 'macho', [5, 0, 5], 36, 'Negro y fuego', false, [], ['Displasia de cadera'], 'agresivo', 'Royal Canin German Shepherd', [['v_sextuple', 330], ['v_rabia', 330]], [['externa', 'Bravecto', 80, 90]], null],
  ['canela', 'gabriela', 'Canela', 'perro', 'Dachshund', 'hembra', [1, 2, null], 7.2, 'Rojizo', false, [], [], 'tranquilo', 'Royal Canin Mini Adult', [['v_sextuple', 150], ['v_rabia', 150]], [['interna', 'Drontal Plus', 70, 90], ['externa', 'NexGard', 29, 30]], null],
  ['oliver', 'andres', 'Oliver', 'gato', 'Maine Coon', 'macho', [4, 0, null], 7.9, 'Atigrado marrón', true, [], ['Obesidad'], 'tranquilo', 'Hill’s Metabolic', [['v_triple', 240], ['v_rabia', 240]], [['interna', 'Milbemax gato', 75, 90]], null],
  ['princesa', 'lucia', 'Princesa', 'perro', 'Chihuahua', 'hembra', [10, 0, null], 2.3, 'Beige', true, [], ['Colapso traqueal'], 'nervioso', 'Royal Canin Chihuahua', [['v_sextuple', 364], ['v_rabia', 364]], [['interna', 'Drontal Plus', 95, 90]], 20]
];
/** Consultas pasadas: mascota, hace (días), tipo, veterinario, motivo, diagnóstico, plan, récipe [[medicamento, dosis, vía, frecuencia, días]], signos {temp, hr, rr}, cargos [producto o servicio] */
const CONSULTS = [
  ['max', 45, 'consulta', 's1', 'Cojea de la pata trasera derecha al levantarse', 'Artrosis de cadera', 'Control de peso, paseos cortos, antiinflamatorio 10 días', [['Rimadyl 100 mg', '1 tableta', 'Oral', 'Cada 24 horas', '10']], { temp: 38.6, hr: 92, rr: 22 }, ['svc_consulta', 'rimadyl']],
  ['max', 12, 'control', 's1', 'Control de artrosis', 'Mejoría parcial', 'Continuar con suplemento de omega 3', [['Omega 3 Nutri-Vet', '1 cápsula', 'Oral', 'Cada 24 horas', '60']], { temp: 38.4, hr: 88, rr: 20 }, ['svc_control', 'omega']],
  ['rocky', 30, 'consulta', 's2', 'Se rasca mucho, enrojecimiento en axilas', 'Dermatitis alérgica', 'Baño medicado semanal, dieta sin pollo', [['Shampoo Clorhexidina 4%', 'Baño', 'Tópica', 'Cada 7 días', '30']], { temp: 38.9, hr: 100, rr: 24 }, ['svc_consulta', 'shampoo']],
  ['nala', 60, 'consulta', 's1', 'Mal aliento y no quiere comer croquetas', 'Enfermedad periodontal', 'Profilaxis dental programada, alimento húmedo temporal', [['Synulox 250 mg', '1/2 tableta', 'Oral', 'Cada 12 horas', '7']], { temp: 38.7, hr: 120, rr: 28 }, ['svc_consulta', 'synulox']],
  ['nala', 31, 'control', 's1', 'Control cardíaco', 'Soplo grado II/VI estable', 'Control en un mes; evitar esfuerzo', [], { temp: 38.5, hr: 128, rr: 30 }, ['svc_control']],
  ['toby', 19, 'vacunacion', 's2', 'Primera vacuna', 'Control sano', 'Refuerzo en 21 días; no bañar por 3 días', [], { temp: 38.8, hr: 140, rr: 30 }, ['svc_vacuna', 'vac_puppy']],
  ['simba', 8, 'emergencia', 's2', 'Vómitos desde anoche, no come', 'Gastroenteritis', 'Ayuno 12 h, luego dieta blanda 3 días', [['Hill’s i/d lata', '1/3 de lata', 'Oral', 'Cada 8 horas', '3']], { temp: 39.4, hr: 200, rr: 36 }, ['svc_emerg', 'hills', 'ringer']],
  ['bruno', 22, 'control', 's1', 'Control de glucosa', 'Diabetes controlada', 'Mantener dosis de insulina; control en 1 mes', [], { temp: 38.5, hr: 104, rr: 22 }, ['svc_control', 'svc_hemato']],
  ['mia', 18, 'consulta', 's1', 'Toma mucha agua y orina más', 'Insuficiencia renal crónica', 'Dieta renal, fluidoterapia subcutánea semanal', [['Ringer lactato', '100 ml', 'Subcutánea (SC)', 'Cada 7 días', '30']], { temp: 38.3, hr: 180, rr: 30 }, ['svc_consulta', 'svc_hemato', 'svc_eco']],
  ['thor', 24, 'vacunacion', 's2', 'Segunda vacuna', 'Control sano', 'Refuerzo de séxtuple en 21 días y luego antirrábica', [], { temp: 38.7, hr: 120, rr: 26 }, ['svc_vacuna', 'vac_sext']],
  ['zeus', 50, 'consulta', 's2', 'Dificultad para subir escaleras', 'Displasia de cadera', 'Antiinflamatorio, control de peso, radiografía', [['Metacam 1,5 mg/ml', '0,1 ml/kg', 'Oral', 'Cada 24 horas', '14']], { temp: 38.6, hr: 84, rr: 20 }, ['svc_consulta', 'metacam']],
  ['oliver', 35, 'consulta', 's1', 'Revisión general, subió de peso', 'Obesidad', 'Dieta metabólica, 3 tomas medidas al día', [], { temp: 38.4, hr: 170, rr: 28 }, ['svc_consulta']],
  ['princesa', 10, 'consulta', 's1', 'Tos como graznido al emocionarse', 'Colapso traqueal', 'Arnés en vez de collar, evitar calor', [['Doxiciclina 100 mg', '1/4 tableta', 'Oral', 'Cada 24 horas', '10']], { temp: 38.9, hr: 150, rr: 34 }, ['svc_consulta', 'doxi']],
  ['canela', 70, 'cirugia', 's2', 'Esterilización programada', 'Ovariohisterectomía sin complicaciones', 'Collar isabelino 10 días, retirar puntos en 10 días', [['Metacam 1,5 mg/ml', '0,1 ml/kg', 'Oral', 'Cada 24 horas', '3']], { temp: 38.2, hr: 110, rr: 24 }, ['svc_esteril', 'cono', 'metacam']],
  ['lola', 5, 'consulta', 's1', 'Rescatada: chequeo general', 'Parasitosis intestinal', 'Desparasitar y repetir en 15 días', [['Drontal Plus', '1 tableta', 'Oral', 'Dosis única', '1']], { temp: 38.8, hr: 110, rr: 24 }, ['svc_consulta', 'drontal']]
];
const WALKIN = ['Patricia Morales', 'Ricardo Fuentes', 'Elena Suárez', 'Fernando Ruiz', 'Marisol Peña', 'Alexis Romero'];

/** Clínica de ejemplo: mascotas con su historia clínica, vacunas y desparasitaciones, agenda, peluquería, hospitalización, tienda con lotes, compras, pedidos en línea y caja del día. */
export async function seedDemoActivity() {
  const money = (v) => scaleUSD(v);
  const R = rng(11);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const methods = Object.keys(PAY_METHODS).filter((k) => k !== 'credito').slice(0, 6);
  const mk = () => Number(store.settings.fractionMarkup) || 0;
  const vacCat = Object.fromEntries(VACCINES_DEFAULT.map((v) => [v.id, v]));

  // 1) Proveedores
  let b = store.batch();
  SUPPLIERS.forEach(([id, name, rif, contact, phone, days]) => b.set(store.ref('suppliers', 'demo_' + id), { name, rif, contact, phone, email: '', days, notes: '', active: true, createdAt: nowISO(), updatedAt: nowISO() }));

  // 2) Productos con lotes y vencimientos + servicios
  const P = {};
  PRODUCTS.forEach(([k, name, active, form, lab, category, rx, units, price, cost, boxes, minBoxes, location, unitName, boxName, lotSpec, vaccine], i) => {
    const spec = lotSpec || [[`${k.slice(0, 2).toUpperCase()}${2400 + i * 7}`, 240 + (i * 37) % 420, boxes]];
    let lots = [];
    for (const [lot, exp, bx] of spec) lots = addLot(lots, { lot, exp: inDays(exp), qty: bx * units, cost: money(cost) });
    P[k] = {
      id: 'demo_' + k, name, active, strength: '', form, lab, category, rx, location, unitsPerBox: units, blister: 0, fraction: units > 1, price: money(price), blisterPrice: 0, unitPrice: 0, cost: money(cost), lastCost: money(cost),
      minStock: minBoxes * units, maxStock: minBoxes * units * 3, trackStock: true, sellable: true, online: !['Vacunas', 'Antibióticos', 'Material médico'].includes(category), supplierId: 'demo_' + SUPPLIERS[/Alimento|Snack|Arena|Accesor|Collares/.test(category) ? 1 : /Vacuna/.test(category) ? 2 : 0][0],
      taxed: false, color: COLORS[i % COLORS.length], unitName: unitName || '', boxName: boxName || '', species: /gato/i.test(name + category) ? 'gato' : /perro/i.test(name + category) ? 'perro' : '', vaccine: !!vaccine,
      barcode: `759${String(1000000000 + i * 7919331).slice(0, 10)}`, sku: `${category.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`, notes: '',
      stock: lots.reduce((a, l) => a + l.qty, 0), lots, expiresAt: nextExpiry({ lots }) || '', sold: 0, createdAt: at(90, 9).toISOString(), updatedAt: nowISO(), by: 'demo'
    };
  });
  SERVICES_LIST.forEach(([k, name, category, price]) => {
    P[k] = { id: 'demo_' + k, name, active: '', strength: '', form: 'Otro', lab: '', category, rx: 'libre', location: '', unitsPerBox: 1, blister: 0, fraction: false, price: money(price), cost: 0, minStock: 0, maxStock: 0, trackStock: false, sellable: true, online: false, supplierId: null, taxed: false, color: '#ea580c', unitName: '', boxName: '', species: '', vaccine: false, barcode: '', sku: k.toUpperCase(), notes: '', stock: 0, lots: [], expiresAt: '', sold: 0, createdAt: at(90, 9).toISOString(), updatedAt: nowISO(), by: 'demo' };
  });

  // 3) Tutores
  const O = {};
  OWNERS.forEach(([k, name, phone, idDoc, agreementId, debt], idx) => {
    O[k] = { id: 'demo_' + k, name, phone, phone2: '', email: '', idDoc, address: idx % 3 === 0 ? `Urb. Los Samanes, calle ${idx + 2}` : '', notes: '', agreementId: agreementId || '', agreementNumber: agreementId ? `AF-${10200 + idx * 13}` : '', howFound: ['Recomendación', 'Instagram', 'Google Maps', 'Pasó por el frente'][idx % 4], tags: [], active: true, visits: 0, totalSpent: 0, balance: debt ? money(debt) : 0, points: 0, lastVisitAt: null, createdAt: at(200 - idx * 7, 10).toISOString(), updatedAt: nowISO(), by: 'demo' };
  });
  Object.values(O).sort((a, c) => a.createdAt.localeCompare(c.createdAt)).forEach((c) => { const seq = store.nextSeq(b, 'cli'); c.number = fmtSeq('T', seq, 4); c.seq = seq; });

  // 4) Mascotas con su plan sanitario
  const M = {};
  PETS.forEach(([k, ok, name, species, breed, sex, [y, mo, bd], weight, color, neutered, allergies, conditions, temperament, diet, vac, dew, ctrl], idx) => {
    const o = O[ok];
    const vaccines = vac.map(([vid, ago], j) => { const v = vacCat[vid]; const date = inDays(-ago); return { id: `v${idx}${j}`, name: v.name, date, next: dayKey(addDays(new Date(date + 'T12:00:00'), v.everyDays)), lot: `L${2400 + idx * 3 + j}`, brand: '', vetId: j % 2 ? 's2' : 's1', vetName: j % 2 ? STAFF[1].name : STAFF[0].name, productId: null, note: '', at: at(ago, 10).toISOString() }; });
    const deworm = dew.map(([kind, product, ago, every], j) => { const date = inDays(-ago); return { id: `d${idx}${j}`, kind, product, dose: kind === 'externa' ? '1 pipeta / tableta' : '1 tableta', date, next: dayKey(addDays(new Date(date + 'T12:00:00'), every)), weight, note: '', at: at(ago, 10).toISOString() }; });
    const weights = [{ date: inDays(-120), kg: round2(weight * (y < 1 ? 0.55 : 0.96)) }, { date: inDays(-60), kg: round2(weight * (y < 1 ? 0.8 : 0.98)) }, { date: inDays(-10), kg: weight }];
    M[k] = {
      id: 'demo_p_' + k, name, species, breed, sex, birthDate: born(y, mo, bd), color, chip: idx % 3 === 0 ? `9410000${String(12345670 + idx * 1371)}` : '', neutered, allergies, conditions, temperament, diet, notes: '', photo: '',
      ownerId: o.id, ownerName: o.name, ownerPhone: o.phone, cardCode: genCode(8), active: true, deceased: false, weight, weights, vaccines, deworm,
      visits: 0, lastVisitAt: null, nextControl: ctrl != null ? inDays(ctrl) : '', lastDx: '', reminded: {}, createdAt: o.createdAt, updatedAt: nowISO(), by: 'demo'
    };
  });
  Object.values(M).sort((a, c) => a.createdAt.localeCompare(c.createdAt) || a.name.localeCompare(c.name)).forEach((p) => { const seq = store.nextSeq(b, 'pet'); p.number = fmtSeq('M', seq, 4); p.seq = seq; });

  const line = (p, pack, qty) => {
    const f = packFactor(p, pack);
    return { productId: p.id, name: p.name, pack, factor: f, qty, price: packPrice(p, pack, mk()), listPrice: packPrice(p, pack, mk()), cost: round2(unitCost(p) * f * 10000) / 10000, kind: p.trackStock === false ? 'servicio' : 'producto', rx: p.rx || 'libre', detail: '' };
  };
  const docs = [];
  const hist = [];

  // 5) Historias clínicas (consultas pasadas, cobradas)
  CONSULTS.forEach(([pk, ago, type, vetId, reason, diagnosis, plan, rx, vit, charges], i) => {
    const pet = M[pk]; const o = Object.values(O).find((x) => x.id === pet.ownerId);
    const date = at(ago, 9 + (i % 8), (i * 15) % 60);
    const seq = store.nextSeq(b, 'cons');
    const lines = charges.map((ck) => line(P[ck], 'caja', 1));
    const cid = 'demo_c' + seq;
    const c = {
      petId: pet.id, petName: pet.name, species: pet.species, ownerId: o.id, ownerName: o.name, ownerPhone: o.phone, type, vetId, vetName: STAFF.find((s) => s.id === vetId).name,
      reason, anamnesis: '', vitals: { weight: pet.weight, ...vit, mucosa: 'Rosadas', hydration: 'Normal', tllc: 2 }, exam: '', diagnosis, plan,
      rx: rx.map(([drug, dose, route, freq, days]) => ({ drug, dose, route, freq, days, note: '', productId: null })), labs: charges.includes('svc_hemato') ? 'Hematología y química sanguínea' : '', nextAt: '',
      charges: lines.map(({ rx: _r, listPrice: _l, ...l }) => l), apptId: null, updatedAt: date.toISOString(), number: fmtSeq('HC', seq, 5), seq, date: date.toISOString(), dayKey: dayKey(date), status: 'cerrada', charged: true, by: 'demo'
    };
    docs.push(['consults', cid, c]);
    pet.visits++; pet.lastVisitAt = pet.lastVisitAt && pet.lastVisitAt > c.date ? pet.lastVisitAt : c.date; if (!pet.lastDx || ago < (pet._lastAgo ?? 999)) { pet.lastDx = diagnosis; pet._lastAgo = ago; }
    hist.push({ date: new Date(date.getTime() + 25 * 60000), lines, client: o, pet, consultId: cid, seller: vetId });
  });

  // 6) Ventas de la tienda (alimento, antiparasitarios, accesorios) y peluquería de los últimos 45 días
  const shopItems = ['dogchow', 'royalmini', 'proplan', 'whiskas', 'catchow', 'sobre', 'dentastix', 'nexgard', 'frontline', 'drontal', 'milbemax', 'arena', 'kong', 'shampoo'];
  const ownersArr = Object.values(O);
  for (let d = 45; d >= 1; d--) {
    const n = 4 + Math.floor(R() * 5) + (d % 7 === 6 ? 3 : 0);
    for (let j = 0; j < n; j++) {
      const lines = [];
      const items = 1 + Math.floor(R() * 2);
      for (let q = 0; q < items; q++) {
        const p = P[pick(shopItems)];
        if (lines.some((l) => l.productId === p.id)) continue;
        const loose = p.unitsPerBox > 1 && R() < 0.45;
        lines.push(line(p, loose ? 'unidad' : 'caja', loose ? 2 + Math.floor(R() * 4) : 1));
      }
      const reg = R() < 0.45 ? pick(ownersArr) : null;
      const pet = reg ? Object.values(M).find((x) => x.ownerId === reg.id) : null;
      if (pet && R() < 0.3) { lines.unshift(line(P[pick(['svc_banocorte', 'svc_banomed', 'svc_unas'])], 'caja', 1)); }
      hist.push({ date: at(d, 8 + Math.floor(R() * 10), Math.floor(R() * 60)), lines, client: reg, pet, seller: pick(['s3', 's4', 's4']) });
    }
  }
  hist.sort((a, c) => a.date - c.date);
  for (const h of hist) {
    const c = h.client;
    const ag = c?.agreementId ? AGREEMENTS.find((a) => a.id === c.agreementId) : null;
    const t = cartTotals(h.lines, 0);
    const agc = agreementCalc(ag, h.lines);
    const total = round2(t.subtotal - agc.discount);
    const covered = round2(Math.min(total, agc.covered));
    const paid = round2(total - covered);
    const method = pick(methods);
    const seq = store.nextSeq(b, 'inv');
    const number = fmtSeq(store.settings.invoicePrefix || 'F', seq, 6);
    const saleId = 'demo_s' + seq;
    const items = h.lines.map(({ rx: _r, ...l }) => ({ ...l, total: round2(l.price * l.qty) }));
    const daysAgo = Math.round((Date.now() - h.date.getTime()) / 864e5);
    const seller = STAFF.find((s) => s.id === h.seller) || STAFF[3];
    const sale = {
      number, seq, kind: 'venta', date: h.date.toISOString(), dayKey: dayKey(h.date), items, subtotal: t.subtotal, discount: agc.discount, total,
      cost: round2(items.reduce((a, i) => a + i.cost * i.qty, 0)), rate: 1,
      payments: paid > 0 ? [{ method, currency: 'USD', amount: paid, usd: paid }] : [], paidUSD: paid, changeUSD: 0, changeCurrency: 'USD', method: paid > 0 ? method : 'convenio', received: paid, shiftId: null, cashFlow: null,
      ...clientFields(c ? { ...c } : null), status: 'completed', by: 'demo', note: '', credit: 0,
      agreementId: ag?.id || null, agreementName: ag?.name || '', agreementDue: covered, agreementPaid: covered > 0 ? daysAgo > 20 : null, agreementDiscount: agc.discount,
      pointsUsed: 0, pointsDiscount: 0, manualDiscount: 0, sellerId: seller.id, sellerName: seller.name, orderId: null, pointsEarned: c ? Math.floor(paid) : 0,
      petId: h.pet?.id || null, petName: h.pet?.name || '', consultId: h.consultId || null, stayId: null
    };
    docs.push(['sales', saleId, sale]);
    if (h.consultId) { const cd = docs.find((x) => x[1] === h.consultId); if (cd) Object.assign(cd[2], { saleId, saleNumber: number }); }
    for (const l of items) { const p = Object.values(P).find((x) => x.id === l.productId); if (p && p.trackStock !== false) p.sold += l.qty * l.factor; }
    if (c) { c.visits++; c.totalSpent = round2(c.totalSpent + paid); c.points += Math.floor(paid); c.lastVisitAt = sale.date; }
  }

  // 7) Mermas
  docs.push(['inventory_logs', 'demo_l1', { productId: P.hills.id, name: P.hills.name, date: at(9, 18).toISOString(), dayKey: dayKey(at(9, 18)), type: 'vencido', qty: -4, cost: unitCost(P.hills), lots: [{ lot: 'ID2409', exp: inDays(-10), qty: 4 }], reason: 'Latas vencidas retiradas del anaquel', by: 'demo' }]);
  docs.push(['inventory_logs', 'demo_l2', { productId: P.dogchow.id, name: P.dogchow.name, date: at(4, 12).toISOString(), dayKey: dayKey(at(4, 12)), type: 'merma', qty: -3, cost: unitCost(P.dogchow), lots: [], reason: 'Saco roto al descargar (3 kg)', by: 'demo' }]);

  // Guardar todo
  for (const p of Object.values(P)) { const { id, ...data } = p; docs.push(['products', id, data]); }
  for (const c of Object.values(O)) { const { id, ...data } = c; docs.push(['clients', id, data]); }
  for (const p of Object.values(M)) { const { id, _lastAgo, ...data } = p; docs.push(['pets', id, data]); }
  await store.commit(b);
  for (let i = 0; i < docs.length; i += 80) {
    const bb = store.batch();
    docs.slice(i, i + 80).forEach(([col, id, data]) => bb.set(store.ref(col, id), data));
    await store.commit(bb);
  }
  await waitFor(() => store.products.length >= PRODUCTS.length && store.clients.length >= OWNERS.length && store.pets.length >= PETS.length && store.suppliers.length >= SUPPLIERS.length);
  b = store.batch();
  for (const p of Object.values(M)) { const fresh = store.pet(p.id) || { ...p }; b.set(store.cardRef(p.cardCode), cardData(fresh)); }
  await store.commit(b);

  // 8) Agenda: hoy, mañana y pasado
  try {
    const now = new Date(); const hh = now.getHours();
    const t = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const base = Math.min(Math.max(hh, 9), 16);
    const pp = (k) => M[k];
    const APPTS = [
      [0, t(Math.max(8, base - 1)), 'control', 's1', 'max', 'Control de artrosis', 'atendida'],
      [0, t(base, 0), 'consulta', 's1', 'nala', 'Control cardíaco y tos', 'llego'],
      [0, t(base, 30), 'vacuna', 's2', 'thor', 'Refuerzo de séxtuple', 'llego'],
      [0, t(Math.min(base + 1, 17), 0), 'consulta', 's2', 'princesa', 'Revisión de tos', 'confirmada'],
      [0, t(Math.min(base + 1, 17), 30), 'peluqueria', 's3', 'canela', 'Baño y corte de verano', 'confirmada'],
      [0, t(Math.min(base + 2, 17), 30), 'vacuna', 's1', 'toby', 'Segunda dosis Puppy', 'pendiente'],
      [1, t(9, 0), 'control', 's1', 'bruno', 'Control de glucosa', 'confirmada'],
      [1, t(10, 30), 'peluqueria', 's3', 'kira', 'Baño medicado', 'pendiente'],
      [1, t(15, 0), 'cirugia', 's2', 'zeus', 'Esterilización (en ayunas)', 'confirmada'],
      [2, t(11, 0), 'consulta', 's2', 'oliver', 'Control de peso', 'pendiente']
    ];
    const ab = store.batch();
    APPTS.forEach(([d, time, service, staffId, pk, note, status], i) => {
      const p = pp(pk); const o = Object.values(O).find((x) => x.id === p.ownerId);
      ab.set(store.ref('appointments', 'demo_a' + i), { date: inDays(d), time, minutes: service === 'peluqueria' ? 90 : service === 'cirugia' ? 120 : 30, service, staffId, staffName: STAFF.find((s) => s.id === staffId).name, petId: p.id, petName: p.name, species: p.species, ownerId: o.id, ownerName: o.name, phone: o.phone, note, status, createdAt: at(3, 10).toISOString(), updatedAt: nowISO(), by: 'demo', ...(status === 'llego' ? { arrivedAt: new Date(Date.now() - (i * 7 + 5) * 60000).toISOString() } : {}) });
    });
    // 9) En la clínica: peluquería y hospitalización
    const stay = (id, kind, pk, status, services, reason, price, minsAgo, staffId, log) => {
      const p = pp(pk); const o = Object.values(O).find((x) => x.id === p.ownerId); const inAt = new Date(Date.now() - minsAgo * 60000).toISOString();
      ab.set(store.ref('stays', id), { kind, open: true, status, petId: p.id, petName: p.name, species: p.species, breed: p.breed, ownerId: o.id, ownerName: o.name, phone: o.phone, services, reason, notes: '', staffId, staffName: STAFF.find((s) => s.id === staffId).name, price: money(price), apptId: null, inAt, dayKey: todayKey(), log: log.map(([m, text]) => ({ at: new Date(Date.now() - m * 60000).toISOString(), text, by: 'demo' })), by: 'demo', ...(status === 'listo' ? { readyAt: new Date().toISOString() } : {}) });
    };
    stay('demo_st1', 'peluqueria', 'lola', 'banando', ['Baño y corte', 'Corte de uñas'], '', 22, 50, 's3', [[50, 'Recibido en peluquería'], [20, 'En baño']]);
    stay('demo_st2', 'peluqueria', 'kira', 'listo', ['Baño medicado', 'Limpieza de oídos'], '', 20, 120, 's3', [[120, 'Recibido en peluquería'], [90, 'En baño'], [45, 'Secado y corte'], [5, 'Listo para retirar']]);
    stay('demo_st3', 'hospital', 'simba', 'observacion', [], 'Gastroenteritis: fluidoterapia', 50, 60 * 26, 's2', [[60 * 26, 'Ingreso a hospitalización'], [60 * 20, 'Fluidoterapia Ringer 200 ml. Sin vómitos.'], [60 * 6, 'Comió 1/3 de lata i/d. Temperatura 38,7 °C.'], [40, 'Estado: En observación']]);
    await store.commit(ab);
  } catch (e) { console.warn('[demo] agenda', e); }

  // 10) Caja abierta y movimientos de hoy
  try {
    if (!store.openShift) { await openShift({ openingUSD: money(50), note: 'Apertura demo' }); await waitFor(() => store.openShift); }
    await waitFor(() => store.pet('demo_p_max') && store.client('demo_maria'));
    const pr = (k) => store.product('demo_' + k);
    const L = (k, pack = 'caja', qty = 1) => line(pr(k), pack, qty);
    const due = (lines, agId = null) => { const ag = agId ? store.agreement(agId) : null; const t = cartTotals(lines, 0); const a = agreementCalc(ag, lines); const total = round2(t.subtotal - a.discount); return round2(total - Math.min(total, a.covered)); };
    const sell = async (lines, opts = {}, method = 'efectivo') => { const amount = due(lines, opts.agreementId); return chargeSale({ lines, payments: amount > 0 ? [{ method, amount }] : [], sellerId: 's4', ...opts }); };
    // Consulta de Max de esta mañana (cobrada con el seguro)
    const max = store.pet('demo_p_max'); const maria = store.client('demo_maria');
    const c1 = await saveConsult({ petId: max.id, type: 'control', vetId: 's1', reason: 'Control de artrosis', anamnesis: 'Camina mejor desde que toma omega 3', vitals: { weight: 31.2, temp: 38.5, hr: 90, rr: 20, mucosa: 'Rosadas', hydration: 'Normal' }, exam: 'Leve dolor a la extensión de cadera derecha', diagnosis: 'Artrosis de cadera estable', plan: 'Continuar omega 3 y paseos cortos', rx: [{ drug: 'Omega 3 Nutri-Vet', dose: '1 cápsula', route: 'Oral', freq: 'Cada 24 horas', days: '60' }], labs: '', nextAt: inDays(60), charges: [L('svc_control'), L('omega')], apptId: 'demo_a0' });
    await sell([L('svc_control'), L('omega')], { client: maria, pet: max, consultId: c1.id, agreementId: 'a_seguro', sellerId: 's1' }, 'debito');
    // Tienda: alimento por kilo y antipulgas
    await sell([L('dogchow', 'unidad', 3), L('sobre', 'caja', 4)], {}, 'efectivo');
    const ana = store.client('demo_ana'); const kira = store.pet('demo_p_kira');
    await sell([L('nexgard'), L('dentastix')], { client: ana, pet: kira }, 'transferencia');
    await sell([L('whiskas', 'unidad', 2), L('arena')], {}, methods[3] || 'efectivo');
    // Consulta de Lola por cobrar (aparece en su historia)
    const lola = store.pet('demo_p_lola');
    if (lola) await saveConsult({ petId: lola.id, type: 'control', vetId: 's1', reason: 'Control de parásitos', vitals: { weight: 12.8, temp: 38.6 }, diagnosis: 'Parasitosis resuelta', plan: 'Vacunar la próxima semana', nextAt: inDays(7), charges: [L('svc_control')] });
    await cashMovement({ direction: 'out', currency: 'USD', amount: money(6), concept: 'Bolsas y gasas', category: 'Insumos (bolsas, papel, etiquetas)' });
  } catch (e) { console.warn('[demo] ventas de hoy', e); }

  // 11) Compras: facturas por pagar y una orden pendiente
  try {
    const pr = (k) => store.product('demo_' + k);
    await receivePurchase({ supplierId: 'demo_sup2', invoiceNo: 'FAC-88231', items: [{ productId: pr('dogchow').id, boxes: 6, cost: pr('dogchow').cost, lot: 'DC2611', exp: inDays(300) }, { productId: pr('whiskas').id, boxes: 4, cost: pr('whiskas').cost, lot: 'WK2610', exp: inDays(280) }], paid: 0, dueDate: inDays(5), note: 'Crédito a 15 días' });
    await receivePurchase({ supplierId: 'demo_sup3', invoiceNo: 'B-004512', items: [{ productId: pr('vac_sext').id, boxes: 10, cost: pr('vac_sext').cost, lot: 'VG2609', exp: inDays(240) }, { productId: pr('vac_rabia').id, boxes: 10, cost: pr('vac_rabia').cost, lot: 'RB2609', exp: inDays(260) }], paid: money(40), dueDate: inDays(-2) });
    await createPurchaseOrder({ supplierId: 'demo_sup1', items: [{ productId: pr('baytril').id, boxes: 6, cost: pr('baytril').cost }, { productId: pr('revolution').id, boxes: 6, cost: pr('revolution').cost }], note: 'Pedido por WhatsApp' });
  } catch (e) { console.warn('[demo] compras', e); }

  // 12) Pedidos en línea (catálogo público)
  try {
    const slug = store.settings.shop?.slug || '';
    await store.saveSettings({ shop: { ...store.settings.shop, deliveryFee: money(2) } });
    const it = (k, q) => { const p = store.product('demo_' + k); return { id: p.id, n: p.name, q, p: p.price, rx: p.rx !== 'libre' }; };
    const mkOrder = (name, phone, mode, items, note, minsAgo) => {
      const fee = mode === 'delivery' ? money(2) : 0;
      return { tenantId: store.tenantId, slug, number: 'W-' + genCode(5), name, phone, address: mode === 'delivery' ? 'Res. Los Samanes, torre B, apto 4-2' : '', mode, deliveryFee: fee, note, payMethod: mode === 'delivery' ? 'Efectivo al recibir' : 'Pago móvil', hasRx: items.some((x) => x.rx), items, total: round2(items.reduce((a, x) => a + x.p * x.q, 0) + fee), status: 'nueva', createdAt: new Date(Date.now() - minsAgo * 60000).toISOString() };
    };
    const ob = store.batch();
    const r1 = doc(collection(db, 'orders')); const r2 = doc(collection(db, 'orders')); const r3 = doc(collection(db, 'orders'));
    ob.set(r1, mkOrder(WALKIN[0], '0414-7654321', 'delivery', [it('royalmini', 1), it('dentastix', 2)], 'Es para un Yorkie de 4 kg', 8));
    ob.set(r2, mkOrder(WALKIN[1], '0412-9876543', 'retiro', [it('bravecto', 1)], 'Paso en la tarde', 35));
    ob.set(r3, mkOrder(WALKIN[2], '0424-1237890', 'retiro', [it('catchow', 2), it('arena', 1)], '', 70));
    await store.commit(ob);
    await waitFor(() => store.orders.length >= 3, 4000);
    await setOrderStatus({ id: r2.id }, 'preparando');
    await setOrderStatus({ id: r3.id }, 'lista');
  } catch (e) { console.warn('[demo] pedidos', e); }
}

/** Borra todos los datos de una sede (los carnets públicos, su catálogo en línea y sus pedidos). */
export async function purgeTenant(tenantId, onlyDemo = true, slug = '') {
  try {
    const snap = await getDocs(collection(db, 'tenants', tenantId, 'pets'));
    const codes = snap.docs.map((d) => d.data().cardCode).filter(Boolean);
    for (let i = 0; i < codes.length; i += 80) {
      const b = writeBatch(db);
      codes.slice(i, i + 80).forEach((c) => b.delete(doc(db, 'cards', c)));
      await b.commit().catch((e) => console.warn('[purge] carnets', e?.code || e));
    }
  } catch (e) { console.warn('[purge] carnets', e?.code || e); }
  try {
    let s = slug;
    if (!s) { const st = await getDoc(doc(db, 'tenants', tenantId, 'config', 'settings')); s = st.exists() ? st.data().shop?.slug || '' : ''; }
    if (s) { const sh = await getDoc(doc(db, 'shops', s)); if (sh.exists() && sh.data().tenantId === tenantId) { const b = writeBatch(db); b.delete(sh.ref); await b.commit(); } }
  } catch (e) { console.warn('[purge] catálogo', e?.code || e); }
  try {
    const rq = await getDocs(query(collection(db, 'orders'), where('tenantId', '==', tenantId)));
    for (let i = 0; i < rq.docs.length; i += 80) { const b = writeBatch(db); rq.docs.slice(i, i + 80).forEach((d) => b.delete(d.ref)); await b.commit(); }
  } catch (e) { console.warn('[purge] pedidos', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 80) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 80).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] sede', e?.code || e); }
  }
}

/** Borra la demo actual y la cuenta anónima. */
export async function cleanupDemo(tenantId, slug = '') {
  await purgeTenant(tenantId, true, slug);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
