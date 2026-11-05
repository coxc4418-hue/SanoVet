// SanoVet — Prueba de punta a punta contra los emuladores (datos creados por test-emu.sh)
// Uso: node e2e.mjs [url=http://127.0.0.1:5131] [carpeta de capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.argv[2] || 'http://127.0.0.1:5131';
const BASE = ORIGIN + '/?emu=1';
const OUT = path.resolve(here, process.argv[3] || 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; let passed = 0;
const ok = (name, cond, extra = '') => { console.log(cond ? '  ✔' : '  ✘', name, extra); if (cond) passed++; else fails++; };
const errs = [];
const logs = [];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
async function newPage(w = 1366, h = 860) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.dismiss());
  p.on('console', (m) => { if (['error', 'warn', 'warning'].includes(m.type())) logs.push(m.text()); });
  return { ctx, p };
}
// Ejecuta una función con acceso a los módulos de la app
const run = (p, fn, arg = null) => p.evaluate(async (src, a) => {
  const M = { store: (await import('/js/store.js')).store, ops: await import('/js/ops.js'), utils: await import('/js/utils.js'), vet: await import('/js/vet.js') };
  M.wait = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { const v = f(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } return f(); };
  return (0, eval)(src)(M, a);
}, fn.toString(), arg);
const go = async (p, route) => { await p.evaluate((r) => { location.hash = '#/' + r; }, route); await sleep(1100); };
const text = (p) => p.evaluate(() => document.body.innerText);
const pin = async (p, value = null) => {
  await p.waitForSelector('.modal [data-pin]', { timeout: 8000 });
  await p.type('.modal [data-pin]', value || acc.sede01.pin);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await sleep(900);
};
const pickCountry = async (p, code) => {
  await p.waitForSelector(`.country-grid [data-c="${code}"]`, { timeout: 60000 });
  await p.click(`.country-grid [data-c="${code}"]`); await sleep(250);
  await p.evaluate(() => [...document.querySelectorAll('.modal [data-ok]')].pop().click());
  await sleep(1500);
};

try {
  // ==================================================================
  console.log('1) Inicio de sesión y país');
  let { ctx, p } = await newPage();
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.screenshot({ path: path.join(OUT, '01-login.png') });
  await p.type('#lg-user', 'sede01'); await p.type('#lg-pass', acc.sede01.password); await p.click('#lg-btn');
  await pickCountry(p, 'VE');
  await p.waitForSelector('.sb-nav', { timeout: 30000 });
  ok('sede01 entra y elige país (Venezuela)', (await run(p, ({ store }) => store.settings.country)) === 'VE');
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());

  // ==================================================================
  console.log('2) Ajustes, equipo, productos con lotes y caja');
  const r1 = await run(p, async ({ store, ops, utils, wait }) => {
    const inD = (n) => utils.dayKey(utils.addDays(new Date(), n));
    await store.saveSettings({
      businessName: 'Veterinaria Prueba', whatsapp: '04141234567', fractionMarkup: 10, consultFee: 15, vetName: 'Dra. Prueba', vetLicense: 'CMV 1',
      agreements: [{ id: 'seg', name: 'Seguro Mascota', discount: 0, coverage: 80, scope: 'todo', contact: '', active: true }],
      sellers: [{ id: 'v1', name: 'Dra. Prueba', role: 'vet', active: true }, { id: 'g1', name: 'Peluquero Uno', role: 'groomer', active: true }, { id: 'c1', name: 'Caja Uno', role: 'caja', active: true }],
      loyalty: { enabled: true, per: 1, pointValue: 0.05, minRedeem: 100 }
    });
    await ops.openShift({ openingUSD: 50 });
    const sup = await ops.saveSupplier({ name: 'Distribuidora Prueba', days: 15 });
    const melox = await ops.saveProduct({ name: 'Meloxicam 2 mg tabletas', active: 'Meloxicam', form: 'Tableta', category: 'Antiinflamatorios y analgésicos', rx: 'libre', unitsPerBox: 20, blister: 10, price: 2, cost: 1, minStock: 30, barcode: '7590000000017', supplierId: sup.id }, null, { units: 40, lot: 'LA', exp: inD(20) });
    const vac = await ops.saveProduct({ name: 'Vacuna Séxtuple', form: 'Vacuna', category: 'Vacunas', rx: 'receta', unitsPerBox: 1, price: 15, cost: 7, minStock: 5, vaccine: true }, null, { units: 10, lot: 'VX1', exp: inD(200) });
    const food = await ops.saveProduct({ name: 'Alimento Adulto 15 kg', form: 'Saco de alimento', category: 'Alimento para perros', unitsPerBox: 15, price: 30, cost: 20, minStock: 30, unitName: 'kg', boxName: 'Saco' }, null, { units: 45, lot: 'AL1', exp: inD(300) });
    const anti = await ops.saveProduct({ name: 'Amoxicilina veterinaria 250 mg', form: 'Tableta', category: 'Antibióticos', rx: 'antibiotico', unitsPerBox: 10, price: 8, cost: 4, minStock: 50 }, null, { units: 30, lot: 'AM1', exp: inD(200) });
    const svc = await ops.saveProduct({ name: 'Consulta general', category: 'Servicios veterinarios', price: 15, trackStock: false });
    const bath = await ops.saveProduct({ name: 'Baño y corte', category: 'Servicios de peluquería', price: 18, trackStock: false });
    let dupBar = ''; try { await ops.saveProduct({ name: 'Otro', barcode: '7590000000017', price: 1 }); } catch (e) { dupBar = e.message; }
    await wait(() => store.products.length >= 6 && store.product(melox.id));
    await ops.receivePurchase({ supplierId: sup.id, invoiceNo: 'F-1', items: [{ productId: melox.id, boxes: 3, cost: 1.2, lot: 'LB', exp: inD(400) }], paid: 0, dueDate: inD(-1) });
    await wait(() => store.product(melox.id).stock === 100 && store.payables.length === 1);
    const a = store.product(melox.id);
    return { shift: !!store.openShift, stock: a.stock, lots: a.lots.map((l) => `${l.lot}:${l.qty}`).join(','), cost: a.cost, byBar: store.byBarcode('7590000000017')?.id === melox.id, dupBar, payable: store.payables[0]?.balance, vets: store.vets.length, groomers: store.groomers.length, ids: { melox: melox.id, vac: vac.id, food: food.id, anti: anti.id, svc: svc.id, bath: bath.id } };
  });
  ok('Caja abierta y equipo por rol', r1.shift && r1.vets === 1 && r1.groomers === 1, `vets ${r1.vets} · peluqueros ${r1.groomers}`);
  ok('Compra entra por lote y ordena por vencimiento (FEFO)', r1.stock === 100 && r1.lots === 'LA:40,LB:60', `${r1.stock} und · ${r1.lots}`);
  ok('Costo promedio ponderado al recibir', Math.abs(r1.cost - 1.12) < 0.01, String(r1.cost));
  ok('Encuentra por código de barras y rechaza duplicado', r1.byBar && /código de barras/.test(r1.dupBar), r1.dupBar);
  ok('Factura a crédito queda en cuentas por pagar', r1.payable === 3.6, String(r1.payable));
  const ID = r1.ids;

  // ==================================================================
  console.log('3) Tutor, mascota, vacunas y desparasitación');
  const r2 = await run(p, async ({ store, ops, utils, vet, wait }, ID) => {
    const inD = (n) => utils.dayKey(utils.addDays(new Date(), n));
    const { pet, owner } = await ops.savePet({ name: 'Firulais', species: 'perro', breed: 'Mestizo', sex: 'macho', birthDate: inD(-800), weight: 12.5, allergies: ['Penicilina'], conditions: [], temperament: 'docil' }, null, { name: 'Tutor Prueba', phone: '04241112233', idDoc: 'v-12345678', agreementId: 'seg' });
    let noOwner = ''; try { await ops.savePet({ name: 'Sin tutor', species: 'gato' }, null, null); } catch (e) { noOwner = e.message; }
    let dup = ''; try { await ops.saveClient({ name: 'Otro', phone: '04241112233' }); } catch (e) { dup = e.message; }
    await wait(() => store.pet(pet.id) && store.client(owner.id));
    const { pet: cat } = await ops.savePet({ name: 'Michi', species: 'gato', sex: 'hembra', weight: 3.4 }, null, { id: owner.id });
    await wait(() => store.pet(cat.id));
    // Vacuna con producto del inventario: descuenta 1 dosis y toma el lote
    const v1 = await ops.addVaccine(store.pet(pet.id), { name: 'Séxtuple', date: inD(-360), everyDays: 365, productId: ID.vac, vetId: 'v1' });
    await wait(() => store.product(ID.vac).stock === 9);
    // Rabia vencida (aplicada hace 400 días) → aparece en recordatorios
    await ops.addVaccine(store.pet(pet.id), { name: 'Rabia', date: inD(-400), everyDays: 365 });
    await ops.addDeworm(store.pet(pet.id), { kind: 'externa', product: 'NexGard', date: inD(-28), everyDays: 30 });
    await wait(() => (store.pet(pet.id).vaccines || []).length === 2 && (store.pet(pet.id).deworm || []).length === 1);
    const due = vet.dueItems(store.pet(pet.id)).map((x) => `${x.name}:${x.d}`);
    const inRem = store.dueVaccines.filter((x) => x.pet.id === pet.id).length;
    const card = await (await import('/js/store.js')).getCard(store.pet(pet.id).cardCode);
    return { pnum: store.pet(pet.id).number, cnum: owner.number, idDoc: store.client(owner.id).idDoc, pets: store.petsOf(owner.id).length, noOwner, dup, lot: v1.lot, next: v1.next, due, inRem, card: card && { name: card.name, vac: (card.vaccines || []).length, dew: (card.deworm || []).length }, code: store.pet(pet.id).cardCode, petId: pet.id, catId: cat.id, ownerId: owner.id };
  }, ID);
  ok('Mascota con número, tutor y cédula normalizada', /^M-\d{4}$/.test(r2.pnum) && /^T-\d{4}$/.test(r2.cnum) && r2.idDoc === 'V-12345678', `${r2.pnum} · ${r2.cnum} · ${r2.idDoc}`);
  ok('Un tutor con varias mascotas', r2.pets === 2, String(r2.pets));
  ok('Exige el tutor y rechaza teléfono duplicado', /tutor/i.test(r2.noOwner) && /Ya existe/.test(r2.dup), `${r2.noOwner} · ${r2.dup}`);
  ok('Vacuna descuenta la dosis del inventario y toma su lote', r2.lot === 'VX1' && !!r2.next, `${r2.lot} · próxima ${r2.next}`);
  ok('Vacunas y antipulgas por tocar (y vencidas) en recordatorios', r2.inRem >= 3 && r2.due.some((x) => /^Rabia:-/.test(x)), r2.due.join(', '));
  ok('Carnet público con vacunas y desparasitación', r2.card && r2.card.name === 'Firulais' && r2.card.vac === 2 && r2.card.dew === 1, JSON.stringify(r2.card));
  ID.pet = r2.petId; ID.cat = r2.catId; ID.owner = r2.ownerId;

  // ==================================================================
  console.log('4) Agenda, sala de espera y consulta con récipe');
  const r3 = await run(p, async ({ store, ops, utils, vet, wait }, ID) => {
    const today = utils.todayKey();
    const a = await ops.saveAppt({ petId: ID.pet, date: today, time: '10:00', minutes: 30, service: 'consulta', staffId: 'v1', note: 'Vómitos' });
    let clash = ''; try { await ops.saveAppt({ petId: ID.cat, date: today, time: '10:15', minutes: 30, service: 'consulta', staffId: 'v1' }); } catch (e) { clash = e.clash ? e.message : ''; }
    const forced = await ops.saveAppt({ petId: ID.cat, date: today, time: '10:15', minutes: 30, service: 'vacuna', staffId: 'v1', force: true });
    await wait(() => store.todayAppts.length >= 2);
    await ops.setApptStatus(store.appointments.find((x) => x.id === a.id), 'llego');
    await wait(() => store.waiting.some((x) => x.id === a.id));
    const waiting = store.waiting.length;
    const flag = vet.vitalFlag('temp', 40.1, 'perro');
    const line = (id, pack = 'caja', qty = 1) => { const p = store.product(id); const f = vet.packFactor(p, pack); return { productId: p.id, name: p.name, pack, factor: f, qty, price: vet.packPrice(p, pack, 10), cost: vet.unitCost(p) * f, kind: p.trackStock === false ? 'servicio' : 'producto' }; };
    const c = await ops.saveConsult({ petId: ID.pet, type: 'consulta', vetId: 'v1', reason: 'Vómitos desde ayer', vitals: { weight: '12,8', temp: 40.1, hr: 110 }, diagnosis: 'Gastroenteritis', plan: 'Dieta blanda', rx: [{ drug: 'Metoclopramida', dose: '0,5 mg/kg', route: 'Oral', freq: 'Cada 8 horas', days: '3' }], nextAt: utils.dayKey(utils.addDays(new Date(), 5)), charges: [line(ID.svc), line(ID.melox, 'blister', 1)], apptId: a.id });
    await wait(() => store.appointments.find((x) => x.id === a.id)?.status === 'atendida' && store.pet(ID.pet).weight === 12.8);
    const pending = (await store.petConsults(ID.pet)).find((x) => x.id === c.id);
    // Cobrar la consulta con la mascota: el seguro cubre 80 %
    const s = await ops.chargeSale({ lines: c.charges.map((l) => ({ ...l })), client: { id: ID.owner }, pet: store.pet(ID.pet), consultId: c.id, agreementId: 'seg', payments: [{ method: 'efectivo', amount: 3.22 }] });
    await new Promise((r) => setTimeout(r, 900));
    const after = (await store.petConsults(ID.pet)).find((x) => x.id === c.id);
    const p = store.pet(ID.pet);
    return { clash, forced: !!forced.id, waiting, flag: flag[0], num: c.number, charged0: pending?.charged, charged1: after?.charged, saleId: after?.saleId === s.sale.id, weights: (p.weights || []).length, weight: p.weight, next: p.nextControl, lastDx: p.lastDx, total: s.sale.total, due: s.sale.agreementDue, petName: s.sale.petName, rx: (after?.rx || []).length, controls: store.dueControls.some((x) => x.pet.id === ID.pet), melox: store.product(ID.melox).stock };
  }, ID);
  ok('La agenda avisa el choque de horario (y permite forzarlo)', /ya tiene una cita/.test(r3.clash) && r3.forced, r3.clash);
  ok('“Llegó” la pasa a la sala de espera', r3.waiting === 1);
  ok('Signos vitales: fiebre marcada como alta', r3.flag === 'Alta', r3.flag);
  ok('Consulta con historia, récipe y la cita atendida', /^HC-\d{5}$/.test(r3.num) && r3.rx === 1 && r3.lastDx === 'Gastroenteritis', r3.num);
  ok('El peso de la consulta actualiza la curva', r3.weight === 12.8 && r3.weights >= 1, `${r3.weight} kg · ${r3.weights} registros`);
  ok('Próximo control entra a recordatorios', !!r3.next && r3.controls, r3.next);
  ok('Consulta por cobrar → cobrada con la mascota y el plan', r3.charged0 === false && r3.charged1 === true && r3.saleId && r3.petName === 'Firulais' && r3.total === 16.1 && r3.due === 12.88, `total ${r3.total} · cubre ${r3.due}`);
  ok('El blíster sale del lote que vence antes', r3.melox === 90, String(r3.melox));

  // ==================================================================
  console.log('5) Peluquería y hospitalización');
  const r4 = await run(p, async ({ store, ops, wait }, ID) => {
    const g = await ops.openStay({ kind: 'peluqueria', petId: ID.cat, services: ['Baño y corte'], staffId: 'g1', price: 18 });
    let dupStay = ''; try { await ops.openStay({ kind: 'peluqueria', petId: ID.cat }); } catch (e) { dupStay = e.message; }
    await wait(() => store.grooming.some((x) => x.id === g.id));
    for (const st of ['banando', 'secando', 'listo']) { await ops.setStayStatus(store.stays.find((x) => x.id === g.id), st); await wait(() => store.stays.find((x) => x.id === g.id)?.status === st); }
    const ready = store.stays.find((x) => x.id === g.id);
    const h = await ops.openStay({ kind: 'hospital', petId: ID.pet, reason: 'Fluidoterapia', staffId: 'v1', price: 25 });
    await wait(() => store.hospitalized.length === 1);
    await ops.addStayNote(store.stays.find((x) => x.id === h.id), 'Sin vómitos, comió bien');
    await wait(() => (store.stays.find((x) => x.id === h.id)?.log || []).length === 2);
    const bath = store.product(ID.bath);
    const s = await ops.chargeSale({ lines: [{ productId: bath.id, name: bath.name, pack: 'caja', factor: 1, qty: 1, price: 18, cost: 0, kind: 'servicio' }], client: { id: ID.owner }, pet: store.pet(ID.cat), stayId: g.id, payments: [{ method: 'efectivo', amount: 18 }] });
    await ops.closeStay(store.stays.find((x) => x.id === g.id), { saleId: s.sale.id });
    await ops.closeStay(store.stays.find((x) => x.id === h.id), { text: 'Alta médica' });
    await wait(() => !store.stays.length);
    return { dupStay, log: ready.log.length, readyAt: !!ready.readyAt, open: store.stays.length };
  }, ID);
  ok('Peluquería: no duplica y avanza hasta “listo”', /ya está/.test(r4.dupStay) && r4.readyAt && r4.log === 4, r4.dupStay);
  ok('Hospital con bitácora, cobro y alta', r4.open === 0);

  // ==================================================================
  console.log('6) Ventas de tienda, crédito, compras y anulación');
  const r5 = await run(p, async ({ store, ops, vet, wait }, ID) => {
    const line = (id, pack = 'caja', qty = 1) => { const p = store.product(id); const f = vet.packFactor(p, pack); return { productId: p.id, name: p.name, pack, factor: f, qty, price: vet.packPrice(p, pack, store.settings.fractionMarkup), cost: vet.unitCost(p) * f }; };
    const kg = await ops.chargeSale({ lines: [line(ID.food, 'unidad', 3)], payments: [{ method: 'efectivo', amount: 10 }], sellerId: 'c1' });
    await wait(() => store.product(ID.food).stock === 42);
    let noRx = ''; try { await ops.chargeSale({ lines: [line(ID.anti)], payments: [{ method: 'efectivo', amount: 8 }] }); } catch (e) { noRx = e.message; }
    await store.saveSettings({ requireRxData: true });
    let noRx2 = ''; try { await ops.chargeSale({ lines: [line(ID.anti)], payments: [{ method: 'efectivo', amount: 8 }] }); } catch (e) { noRx2 = e.message; }
    await store.saveSettings({ requireRxData: false });
    await ops.chargeSale({ lines: [line(ID.melox)], client: { id: ID.owner }, credit: 2, payments: [] });
    const debt = await wait(() => store.client(ID.owner).balance > 0 && store.client(ID.owner).balance);
    await ops.payBalance(store.client(ID.owner), { amount: 2, payments: [{ method: 'efectivo', amount: 2 }] });
    await wait(() => store.client(ID.owner).balance < 0.01);
    let noStock = ''; try { await ops.chargeSale({ lines: [line(ID.food, 'caja', 5)], payments: [{ method: 'efectivo', amount: 200 }] }); } catch (e) { noStock = e.message; }
    const sug = ops.suggestedOrder();
    const oc = await ops.createPurchaseOrder({ supplierId: store.suppliers[0].id, items: sug.map((x) => ({ productId: x.p.id, boxes: x.boxes, cost: x.cost })) });
    await ops.payPurchase(store.payables[0], { amount: 3.6, fromCash: true });
    await wait(() => !store.payables.length);
    const before = store.product(ID.food).stock;
    await ops.voidSale(kg.sale, 'prueba');
    await wait(() => store.product(ID.food).stock === before + 3);
    return { kgTotal: kg.sale.total, kgSeller: kg.sale.sellerName, noRx, noRx2, debt, bal: store.client(ID.owner).balance, noStock, sug: sug.map((x) => x.p.name), oc: oc.number, food: store.product(ID.food).stock, points: store.client(ID.owner).points || 0 };
  }, ID);
  ok('Alimento por kilo con recargo por fraccionar', r5.kgTotal === 6.6 && r5.kgSeller === 'Caja Uno', `total ${r5.kgTotal}`);
  ok('Récipe opcional: solo se exige si se activa', !r5.noRx && /récipe|receta/i.test(r5.noRx2), r5.noRx2);
  ok('Venta a crédito y abono del tutor', r5.debt === 2 && r5.bal < 0.01, `${r5.debt} → ${r5.bal}`);
  ok('No deja vender más de lo que hay', /No hay suficiente/.test(r5.noStock), r5.noStock);
  ok('Sugerido y orden de compra; pago al proveedor', r5.sug.length >= 1 && /^OC-\d{5}$/.test(r5.oc), `${r5.oc} · ${r5.sug.join(', ')}`);
  ok('Anular devuelve el producto a su lote', r5.food === 45, String(r5.food));
  ok('El tutor acumula puntos', r5.points >= 1, String(r5.points));

  // ==================================================================
  console.log('7) Catálogo en línea, carnet público y pedido desde el teléfono');
  const slug = 'veterinaria-prueba-e2e';
  const r6 = await run(p, async ({ store, ops }, sl) => {
    await store.saveSettings({ shop: { ...store.settings.shop, enabled: true, slug: sl, delivery: true, deliveryFee: 1 } });
    await ops.publishShop({ force: true });
    const d = await (await import('/js/store.js')).getShop(sl);
    return { ok: !!d, items: d?.items?.length, names: (d?.items || []).map((x) => x.n || x.name).join(',') };
  }, slug);
  ok('Catálogo publicado (sin servicios)', r6.ok && r6.items >= 3 && !/Consulta general|Baño y corte/.test(r6.names), JSON.stringify(r6).slice(0, 160));
  const pubCtx = await browser.createBrowserContext();
  const pub = await pubCtx.newPage();
  await pub.setViewport({ width: 390, height: 844, isMobile: true });
  pub.on('pageerror', (e) => errs.push('público: ' + e.message));
  await pub.goto(`${ORIGIN}/pedido/${slug}?emu=1`, { waitUntil: 'networkidle2' });
  await pub.waitForSelector('[data-inc]', { timeout: 20000 });
  await pub.screenshot({ path: path.join(OUT, '04-catalogo.png') });
  await pub.type('#s-q', 'alimento'); await sleep(500);
  await pub.click('[data-inc]'); await sleep(200); await pub.click('[data-inc]'); await sleep(200);
  await pub.click('#s-bar'); await sleep(500);
  await pub.click('[data-mode="delivery"]'); await sleep(200);
  await pub.type('input[name="name"]', 'Cliente Web'); await pub.type('input[name="phone"]', '04261234567'); await pub.type('input[name="address"]', 'Calle 1, casa 2');
  await pub.screenshot({ path: path.join(OUT, '04-checkout.png') });
  await pub.click('#o-send'); await sleep(2500);
  ok('Tutor envía el pedido sin cuenta', (await pub.evaluate(() => document.body.innerText)).includes('¡Pedido enviado!'));
  await pub.goto(`${ORIGIN}/carnet/${r2.code}?emu=1`, { waitUntil: 'networkidle2' });
  await pub.waitForSelector('.mcard', { timeout: 20000 }); await sleep(800);
  const ct = await pub.evaluate(() => document.body.innerText);
  ok('Carnet público con mascota, vacunas, alergia y QR', ct.includes('Firulais') && ct.includes('Séxtuple') && ct.includes('Penicilina') && /Vencida/.test(ct) && !!(await pub.$('.mcard-qr img')), ct.replace(/\s+/g, ' ').slice(0, 120));
  await pub.screenshot({ path: path.join(OUT, '05-carnet.png'), fullPage: true });
  await pub.goto(`${ORIGIN}/carnet/NOEXISTE1?emu=1`, { waitUntil: 'networkidle2' }); await sleep(1500);
  ok('Carnet inexistente muestra aviso', /no encontrado/i.test(await pub.evaluate(() => document.body.innerText)));
  await pub.goto(`${ORIGIN}/pedido/no-existe-nada?emu=1`, { waitUntil: 'networkidle2' }); await sleep(1500);
  ok('Catálogo inexistente muestra aviso', (await pub.evaluate(() => document.body.innerText)).includes('Catálogo no'));
  await pubCtx.close();
  const r7 = await run(p, async ({ store, ops, wait }) => {
    const o = await wait(() => store.newOrders.find((x) => x.name === 'Cliente Web'), 10000);
    if (!o) return { got: false };
    await ops.setOrderStatus(o, 'preparando');
    await wait(() => store.orders.find((x) => x.id === o.id)?.status === 'preparando');
    const lines = ops.orderLines(o);
    const total = lines.reduce((a, l) => a + l.price * l.qty, 0) + (o.deliveryFee || 0);
    await ops.chargeSale({ lines, orderId: o.id, delivery: o.deliveryFee, payments: [{ method: 'efectivo', amount: total }] });
    await wait(() => store.orders.find((x) => x.id === o.id)?.status === 'entregada' || !store.pendingOrders.some((x) => x.id === o.id));
    return { got: true, q: lines[0]?.qty, total: o.total, status: store.orders.find((x) => x.id === o.id)?.status || 'entregada' };
  });
  ok('La clínica recibe el pedido en vivo', r7.got);
  ok('Cobrar el pedido lo marca entregado', r7.status === 'entregada' && r7.q === 2 && r7.total === 61, JSON.stringify(r7));

  // ==================================================================
  console.log('8) Pantallas, pestañas, ficha, reportes y consulta de precios');
  const before = errs.length;
  const tabsCount = {};
  for (const v of ['inicio', 'agenda', 'mascotas', 'tutores', 'sala', 'recordatorios', 'vender', 'pedidos', 'inventario', 'compras', 'facturas', 'caja', 'ajustes']) {
    await go(p, v);
    await p.screenshot({ path: path.join(OUT, `10-${v}.png`) });
    const n = await p.$$eval('#view .tabs button', (x) => x.length).catch(() => 0);
    tabsCount[v] = n;
    for (let i = 0; i < n; i++) { await p.evaluate((k) => document.querySelectorAll('#view .tabs button')[k]?.click(), i); await sleep(600); }
  }
  await go(p, 'vender');
  await p.type('#pos-search', 'meloxi'); await sleep(700);
  await p.click('#pos-grid .prow'); await sleep(600);
  await p.screenshot({ path: path.join(OUT, '11-presentacion.png') });
  const packs = await p.$$eval('.modal .pack-btn', (x) => x.length);
  await p.click('.modal .pack-btn[data-k="blister"]'); await sleep(500);
  const cartTxt = await p.evaluate(() => document.querySelector('#c-total')?.textContent || '');
  ok('En Vender elige caja, blíster o unidad', packs === 3 && /1,10/.test(cartTxt), `${packs} · ${cartTxt}`);
  await go(p, 'reportes'); await pin(p); await sleep(2200);
  const rt = await text(p);
  ok('Reportes con PIN muestran ganancia y servicios', /ganancia/i.test(rt) && rt.includes('Consulta general'));
  await p.screenshot({ path: path.join(OUT, '10-reportes.png'), fullPage: true });
  await p.evaluate(async (id) => (await import('/js/client.js')).openPet(id), ID.pet); await sleep(1500);
  const tabs = await p.$$eval('.modal [data-tabs] [data-t]', (x) => x.map((b) => b.dataset.t));
  for (const t of tabs) { await p.click(`.modal [data-tabs] [data-t="${t}"]`).catch(() => {}); await sleep(800); await p.screenshot({ path: path.join(OUT, `12-ficha-${t}.png`) }); }
  let ftxt = ""; for (const t of tabs) { await p.click(`.modal [data-tabs] [data-t="${t}"]`).catch(() => {}); await sleep(500); ftxt += await text(p); }
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals());
  await p.evaluate(async (id) => (await import('/js/client.js')).openClient(id), ID.owner); await sleep(1200);
  await p.screenshot({ path: path.join(OUT, '12-tutor.png') });
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals());
  ok('Todas las pantallas, pestañas y la ficha sin errores', errs.length === before && tabsCount.inventario >= 5 && tabsCount.sala >= 2 && tabsCount.recordatorios >= 4 && tabs.length >= 5, errs.slice(before).join(' | ') + ' · ' + JSON.stringify(tabsCount) + ` · ficha ${tabs.join(',')}`);
  ok('La ficha muestra historia, vacunas y alergias', /Gastroenteritis/.test(ftxt) && /Penicilina/.test(ftxt), '');
  await go(p, 'precios'); await sleep(800);
  await p.type('#k-q', '7590000000017'); await p.keyboard.press('Enter'); await sleep(700);
  const kt = await text(p);
  ok('Consulta de precios por código de barras', kt.includes('Meloxicam 2 mg'), kt.replace(/\s+/g, ' ').slice(0, 80));
  await p.click('#k-exit'); await pin(p); await sleep(800);
  ok('Salir de la consulta de precios con PIN', (await p.evaluate(() => location.hash)).includes('inicio'));
  const r9 = await run(p, async ({ store, ops, wait }) => { const s = store.openShift; const e = ops.shiftExpected(s); await ops.closeShift(s, { countedUSD: e.usd }); return { closed: !!(await wait(() => !store.openShift)), exp: e.usd }; });
  ok('Cierre de caja', r9.closed, `esperado ${r9.exp}`);
  await ctx.close();

  // ==================================================================
  console.log('9) Demo');
  ({ ctx, p } = await newPage());
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.click('#lg-demo');
  await pickCountry(p, 'CO');
  await p.waitForFunction(() => document.body.innerText.includes('Modo demo') && !document.getElementById('boot'), { timeout: 150000 });
  await sleep(3500);
  const d = await run(p, async ({ store }) => ({
    tutores: store.clients.length, mascotas: store.pets.length, products: store.products.length, sales: store.recentSales.length, shift: !!store.openShift, cur: store.settings.currency,
    consulta: store.product('demo_svc_consulta')?.price, orders: store.pendingOrders.length, vacunas: store.dueVaccines.length, controles: store.dueControls.length, citas: store.todayAppts.length,
    espera: store.waiting.length, pelu: store.grooming.length, hosp: store.hospitalized.length, low: store.lowProducts.length, payables: store.payables.length, consultas: (await store.listAll('consults')).length, ag: store.activeAgreements.length, cumple: store.petBirthdaysWithin(7).length
  }));
  ok('Demo con clínica de ejemplo completa', d.tutores >= 12 && d.mascotas >= 16 && d.products >= 40 && d.sales >= 30 && d.shift && d.orders >= 3 && d.vacunas >= 3 && d.controles >= 2 && d.citas >= 5 && d.espera >= 2 && d.pelu === 2 && d.hosp === 1 && d.low >= 1 && d.payables >= 2 && d.consultas >= 15 && d.ag === 3 && d.cumple >= 2, JSON.stringify(d));
  ok('Precios de la demo en pesos colombianos', d.cur === 'COP' && d.consulta > 1000, String(d.consulta));
  ok('Recorrido guiado abierto al entrar', !!(await p.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => null)));
  await p.screenshot({ path: path.join(OUT, '20-demo-tour.png') });
  await p.evaluate(async () => (await import('/js/tour.js')).stopTour());
  const b2 = errs.length;
  for (const v of ['inicio', 'agenda', 'mascotas', 'tutores', 'sala', 'recordatorios', 'vender', 'pedidos', 'inventario', 'compras', 'facturas', 'caja']) { await go(p, v); await sleep(500); await p.screenshot({ path: path.join(OUT, `21-demo-${v}.png`) }); }
  await p.evaluate(async () => { const { store } = await import('/js/store.js'); (await import('/js/client.js')).openPet(store.pets.find((x) => x.name === 'Max').id); }); await sleep(1500);
  await p.screenshot({ path: path.join(OUT, '22-demo-max.png') });
  await p.evaluate(async () => (await import('/js/utils.js')).closeAllModals());
  ok('Pantallas de la demo sin errores', errs.length === b2, errs.slice(b2).join(' | '));
  const codes = await run(p, ({ store }) => store.pets.map((m) => m.cardCode));
  const dslug = await run(p, ({ store }) => store.settings.shop?.slug);
  const uid = await p.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  await p.evaluate(() => document.getElementById('demo-end').click());
  await p.waitForSelector('.modal [data-yes]'); await p.click('.modal [data-yes]');
  await p.waitForSelector('#login-form', { timeout: 60000 }).catch(async (e) => { await p.screenshot({ path: path.join(OUT, '29-demo-fin.png') }); console.log('LOGS', logs.slice(-15).join(' || ')); throw e; });
  ok('Terminar la demo vuelve al login', true);
  await ctx.close();

  // ==================================================================
  console.log('10) Administrador general');
  ({ ctx, p } = await newPage());
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  await p.waitForSelector('#login-form');
  await p.type('#lg-user', 'admin'); await p.type('#lg-pass', acc.admin.password); await p.click('#lg-btn');
  await p.waitForSelector('[data-enter]', { timeout: 30000 }); await sleep(2000);
  ok('Admin ve las sedes', (await p.$$('[data-enter]')).length === 3);
  await p.screenshot({ path: path.join(OUT, '30-admin.png') });
  const gone = await p.evaluate(async (u, cs, sl) => {
    const f = await import('/js/firebase.js');
    const t = await f.getDoc(f.doc(f.db, 'tenants', u)); const c = await f.getDoc(f.doc(f.db, 'cards', cs[0]));
    const b = sl ? await f.getDoc(f.doc(f.db, 'shops', sl)) : null;
    return !t.exists() && !c.exists() && !(b && b.exists());
  }, uid, codes, dslug);
  ok('La demo, sus carnets y su catálogo se borraron', gone, String(dslug));
  await ctx.close();
} catch (e) { console.log('ERROR', e.stack || e.message); fails++; }
await browser.close();
console.log('Errores de página:', errs.length ? errs.join(' | ') : 'ninguno');
console.log(`${passed} OK · ${fails} fallas`);
process.exit(fails ? 1 : 0);
