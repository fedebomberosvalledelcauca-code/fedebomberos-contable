// =====================================================================
// Motor contable: validación, registro, edición, anulación, reversión
// y cálculo de saldos. Toda escritura va con bitácora en la misma
// transacción (las reglas de seguridad lo exigen).
// =====================================================================
import { db, doc, collection, getDocs, query, where, runTransaction, writeBatch, serverTimestamp, auditar, sesion } from './db.js';
import { store, cuenta, periodoAbierto } from './store.js';
import { cent, desdeCent, fechaValida, prefijos, naturalezaPorDefecto } from './util.js';

export const TIPOS = {
  CI: 'Comprobante de ingreso', CE: 'Comprobante de egreso', CD: 'Comprobante de diario', AJ: 'Comprobante de ajuste',
  AP: 'Comprobante de apertura', CC: 'Comprobante de cierre', DP: 'Comprobante de depreciación', NO: 'Comprobante de nómina',
  PR: 'Comprobante de provisiones', RC: 'Comprobante de reclasificación', LT: 'Comprobante de liquidación tributaria'
};

const r2 = v => desdeCent(cent(v));

/** Normaliza las líneas (redondeo a centavos, nombre de cuenta como evidencia histórica). */
export function normalizarLineas(lineas) {
  return lineas
    .filter(l => l.cuenta || cent(l.debito) || cent(l.credito))
    .map(l => ({
      cuenta: String(l.cuenta || '').trim(),
      nombreCuenta: cuenta(l.cuenta)?.nombre || '',
      tercero: l.tercero || '',
      detalle: String(l.detalle || '').trim().slice(0, 300),
      centro: String(l.centro || '').trim(),
      debito: r2(l.debito), credito: r2(l.credito)
    }));
}

export function totales(lineas) {
  const d = lineas.reduce((a, l) => a + cent(l.debito), 0);
  const c = lineas.reduce((a, l) => a + cent(l.credito), 0);
  return { debito: desdeCent(d), credito: desdeCent(c), diferencia: desdeCent(d - c) };
}

/** Devuelve lista de errores (vacía = válido). */
export function validar(comp, { permitirAP = false } = {}) {
  const e = [];
  if (!TIPOS[comp.tipo]) e.push('Tipo de comprobante inválido.');
  if (comp.tipo === 'AP' && !permitirAP) e.push('El comprobante de apertura solo se genera desde el módulo de saldos iniciales.');
  if (!fechaValida(comp.fecha)) e.push('Fecha inválida.');
  else if (!periodoAbierto(comp.fecha.slice(0, 7))) e.push(`El periodo ${comp.fecha.slice(0, 7)} no existe o está cerrado.`);
  if (!comp.concepto?.trim()) e.push('El concepto es obligatorio.');
  if (comp.tercero && !store.terceros.has(comp.tercero)) e.push('El tercero del encabezado no existe.');
  const L = comp.lineas || [];
  if (L.length < 2) e.push('Debe haber al menos dos líneas.');
  L.forEach((l, i) => {
    const n = `Línea ${i + 1}`;
    const c = cuenta(l.cuenta);
    if (!c) e.push(`${n}: la cuenta “${l.cuenta}” no existe en el PUC.`);
    else {
      if (!c.movimiento) e.push(`${n}: la cuenta ${c.codigo} no permite movimiento.`);
      if (!c.activa) e.push(`${n}: la cuenta ${c.codigo} está inactiva.`);
      if (c.exigeTercero && !l.tercero) e.push(`${n}: la cuenta ${c.codigo} exige tercero.`);
      if (c.exigeCentro && !l.centro) e.push(`${n}: la cuenta ${c.codigo} exige centro de costo o convenio.`);
    }
    if (l.tercero && !store.terceros.has(l.tercero)) e.push(`${n}: el tercero no existe.`);
    const d = cent(l.debito), cr = cent(l.credito);
    if (d < 0 || cr < 0) e.push(`${n}: no se admiten valores negativos.`);
    if ((d > 0) === (cr > 0)) e.push(`${n}: debe tener valor en débito o en crédito (solo uno).`);
  });
  const t = totales(L);
  if (cent(t.debito) !== cent(t.credito)) e.push(`Comprobante descuadrado: diferencia ${t.diferencia.toLocaleString('es-CO')}.`);
  if (cent(t.debito) <= 0) e.push('El comprobante no tiene valores.');
  return e;
}

/** Busca comprobantes vigentes con el mismo documento de referencia (control de duplicados). */
export async function posiblesDuplicados(docRef, excluirId = '') {
  if (!docRef?.trim()) return [];
  const s = await getDocs(query(collection(db, 'comprobantes'), where('docRef', '==', docRef.trim())));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.id !== excluirId && c.estado === 'contabilizado');
}

function cuerpo(comp) {
  const lineas = normalizarLineas(comp.lineas);
  const t = totales(lineas);
  return {
    tipo: comp.tipo, fecha: comp.fecha, periodo: comp.fecha.slice(0, 7),
    tercero: comp.tercero || '', concepto: comp.concepto.trim().slice(0, 500), docRef: (comp.docRef || '').trim(),
    centro: (comp.centro || '').trim(), lineas, totalDebito: t.debito, totalCredito: t.credito,
    soportes: comp.soportes || [], reversaDe: comp.reversaDe || '', apertura: comp.tipo === 'AP'
  };
}

/** Crea un comprobante con consecutivo automático (transacción). Devuelve su id. */
export async function crear(comp, { extraAuditoria = '', operacionesExtra = null } = {}) {
  const datos = cuerpo(comp);
  return runTransaction(db, async tx => {
    const cRef = doc(db, 'consecutivos', datos.tipo);
    const s = await tx.get(cRef);
    const numero = s.exists() ? s.data().ultimo + 1 : 1;
    const id = `${datos.tipo}-${numero}`;
    const auditId = auditar(tx, { accion: 'crear', coleccion: 'comprobantes', docIds: [id], despues: { id, ...datos }, detalle: extraAuditoria });
    tx.set(doc(db, 'comprobantes', id), {
      ...datos, numero, estado: 'contabilizado',
      creadoPor: sesion.user.uid, creadoPorEmail: sesion.user.email, creadoEn: serverTimestamp(), auditId
    });
    tx.set(cRef, { ultimo: numero });
    // Escrituras adicionales en la misma transacción (cada una con su propia bitácora)
    if (operacionesExtra) operacionesExtra(tx, id);
    return id;
  });
}

/** Modifica un comprobante contabilizado (solo administrador/contador, periodo abierto). */
export async function modificar(original, cambios, motivo) {
  const datos = cuerpo({ ...cambios, tipo: original.tipo, soportes: original.soportes });
  const b = writeBatch(db);
  const { id, ...previo } = original;
  const auditId = auditar(b, { accion: 'modificar', coleccion: 'comprobantes', docIds: [id], antes: previo, despues: datos, detalle: motivo });
  b.set(doc(db, 'comprobantes', id), {
    ...previo, ...datos, numero: original.numero, estado: 'contabilizado',
    modificadoPor: sesion.user.email, modificadoEn: new Date().toISOString(), motivoModificacion: motivo, auditId
  });
  await b.commit();
}

export async function anular(original, motivo) {
  const b = writeBatch(db);
  const { id, ...previo } = original;
  const cambios = { estado: 'anulado', anuladoPor: sesion.user.email, anuladoEn: new Date().toISOString(), motivoAnulacion: motivo };
  const auditId = auditar(b, { accion: 'anular', coleccion: 'comprobantes', docIds: [id], antes: { estado: previo.estado }, despues: cambios, detalle: motivo });
  b.set(doc(db, 'comprobantes', id), { ...previo, ...cambios, auditId });
  await b.commit();
}

/** Crea un comprobante de ajuste que invierte débitos y créditos del original. */
export async function reversar(original, fecha, motivo) {
  return crear({
    tipo: 'AJ', fecha, tercero: original.tercero, docRef: original.docRef, centro: original.centro,
    concepto: `Reversión de ${original.id}: ${motivo}`.slice(0, 500), reversaDe: original.id,
    lineas: original.lineas.map(l => ({ ...l, debito: l.credito, credito: l.debito }))
  }, { extraAuditoria: `Reversión de ${original.id}: ${motivo}` });
}

export async function adjuntarSoporte(original, meta) {
  const b = writeBatch(db);
  const { id, ...previo } = original;
  const soportes = [...(previo.soportes || []), meta];
  const auditId = auditar(b, { accion: 'adjuntar soporte', coleccion: 'comprobantes', docIds: [id], antes: { soportes: previo.soportes || [] }, despues: { soportes }, detalle: meta.nombre });
  b.set(doc(db, 'comprobantes', id), { ...previo, soportes, auditId });
  await b.commit();
}

// =====================================================================
// SALDOS
// =====================================================================
export function naturaleza(codigo) {
  return store.puc.get(codigo)?.naturaleza || naturalezaPorDefecto(codigo);
}
/** Saldo en el sentido de la naturaleza de la cuenta (en centavos). */
export const saldoNatural = (codigo, debC, creC) => naturaleza(codigo) === 'D' ? debC - creC : creC - debC;

/**
 * Acumula movimientos por cuenta (y opcionalmente por tercero) separando
 * saldo inicial (fecha < desde) y movimiento del rango [desde, hasta].
 * Todo en centavos.
 */
export function acumular(comprobantes, desde, hasta, { porTercero = false, niveles = true } = {}) {
  const m = new Map();
  const reg = (k, campo, v) => {
    let x = m.get(k);
    if (!x) { x = { siD: 0, siC: 0, d: 0, c: 0 }; m.set(k, x); }
    x[campo] += v;
  };
  for (const comp of comprobantes) {
    if (comp.estado !== 'contabilizado' || comp.fecha > hasta) continue;
    const antes = comp.fecha < desde;
    for (const l of comp.lineas) {
      const claves = niveles ? prefijos(l.cuenta) : [l.cuenta];
      if (porTercero) claves.push(`${l.cuenta}|${l.tercero || ''}`);   // detalle por tercero de la cuenta auxiliar
      for (const k of claves) {
        if (antes) { reg(k, 'siD', cent(l.debito)); reg(k, 'siC', cent(l.credito)); }
        else { reg(k, 'd', cent(l.debito)); reg(k, 'c', cent(l.credito)); }
      }
    }
  }
  return m;
}
