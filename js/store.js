// =====================================================================
// Datos maestros sincronizados en tiempo real (PUC, terceros, config, periodos)
// =====================================================================
import { db, collection, doc, onSnapshot, getDocs, query, where, orderBy } from './db.js';

export const store = {
  puc: new Map(),        // codigo -> cuenta
  terceros: new Map(),   // id -> tercero
  periodos: new Map(),   // 'YYYY-MM' -> { estado }
  institucion: {},
  apertura: {},
  listo: false
};

const oyentes = new Set();
export function alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
const avisar = (que) => oyentes.forEach(fn => { try { fn(que); } catch (e) { console.error(e); } });

const desuscribir = [];
export function iniciarStore() {
  return new Promise(resolve => {
    let pendientes = 4;
    const listo = () => { if (--pendientes === 0) { store.listo = true; resolve(); } };
    const mapa = (col, destino, clave, aviso) => {
      let primero = true;
      desuscribir.push(onSnapshot(collection(db, col), snap => {
        destino.clear();
        snap.forEach(d => destino.set(d.id, { id: d.id, ...d.data() }));
        avisar(aviso);
        if (primero) { primero = false; listo(); }
      }, err => { console.error(col, err); if (primero) { primero = false; listo(); } }));
    };
    mapa('puc', store.puc, 'codigo', 'puc');
    mapa('terceros', store.terceros, 'id', 'terceros');
    mapa('periodos', store.periodos, 'id', 'periodos');
    let primero = true;
    desuscribir.push(onSnapshot(collection(db, 'config'), snap => {
      store.institucion = {}; store.apertura = {};
      snap.forEach(d => { if (d.id === 'institucion') store.institucion = d.data(); if (d.id === 'apertura') store.apertura = d.data(); });
      avisar('config');
      if (primero) { primero = false; listo(); }
    }, err => { console.error('config', err); if (primero) { primero = false; listo(); } }));
  });
}
export function detenerStore() { desuscribir.splice(0).forEach(f => f()); }

// ---------- Consultas ----------
export const cuenta = c => store.puc.get(String(c));
export const tercero = id => store.terceros.get(id);
export const nombreTercero = id => { const t = store.terceros.get(id); return t ? t.nombre : (id || ''); };
export const periodoAbierto = p => store.periodos.get(p)?.estado === 'abierto';

export function cuentasMovimiento() {
  return [...store.puc.values()].filter(c => c.movimiento && c.activa).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Comprobantes contabilizados entre dos fechas (inclusive). Filtra estado en el cliente. */
export async function comprobantesEntre(desde, hasta, { incluirAnulados = false } = {}) {
  const q = query(collection(db, 'comprobantes'), where('fecha', '>=', desde), where('fecha', '<=', hasta), orderBy('fecha'));
  const s = await getDocs(q);
  const out = [];
  s.forEach(d => { const c = { id: d.id, ...d.data() }; if (incluirAnulados || c.estado === 'contabilizado') out.push(c); });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo) || a.numero - b.numero);
}

/** Encabezado institucional para impresos. */
export function encabezadoInstitucional() {
  const i = store.institucion || {};
  return `<h1>${(i.razonSocial || 'FEDEBOMBEROS').replace(/</g, '&lt;')}</h1>
    <div>NIT ${i.nit || ''}${i.dv ? '-' + i.dv : ''} · ${i.municipio || ''}${i.departamento ? ', ' + i.departamento : ''}</div>`;
}
