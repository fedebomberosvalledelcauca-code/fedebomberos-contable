// =====================================================================
// Conexión a Firebase y operaciones atómicas con bitácora
// =====================================================================
import {
  initializeApp, deleteApp,
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, writeBatch, runTransaction, serverTimestamp, deleteDoc
} from './vendor/firebase.js'; // SDK Firebase 13.2.0 empaquetado localmente
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, onSnapshot, query, where,
  orderBy, limit, writeBatch, runTransaction, serverTimestamp, deleteDoc,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail
};

export const sesion = { user: null, perfil: null, rol: 'ninguno' };

// Convierte valores para guardarlos en la bitácora (sin undefined ni objetos de Firestore).
function limpio(v) {
  if (v === undefined) return null;
  try { return JSON.parse(JSON.stringify(v, (k, x) => (k === 'auditId' ? undefined : x))); }
  catch { return null; }
}

/**
 * Agrega a un batch o transacción el registro de bitácora y devuelve su id.
 * Toda escritura contable debe incluir { auditId } con este valor (lo exigen las reglas).
 */
export function auditar(op, { accion, coleccion, docIds, antes = null, despues = null, detalle = '' }) {
  const r = doc(collection(db, 'bitacora'));
  op.set(r, {
    uid: sesion.user.uid,
    email: sesion.user.email,
    rol: sesion.rol,
    accion, coleccion, docIds,
    antes: limpio(antes), despues: limpio(despues),
    detalle: String(detalle).slice(0, 1000),
    fecha: serverTimestamp()
  });
  return r.id;
}

/** Escritura simple auditada de un documento (crear o reemplazar/actualizar). */
export async function guardarAuditado(coleccion, id, datos, { accion, antes = null, merge = false, detalle = '' }) {
  const b = writeBatch(db);
  const auditId = auditar(b, { accion, coleccion, docIds: [id], antes, despues: datos, detalle });
  b.set(doc(db, coleccion, id), { ...datos, auditId }, { merge });
  await b.commit();
}

/**
 * Escritura masiva auditada: un registro de bitácora por lote.
 * Si un lote es rechazado se divide automáticamente para aislar el registro con problema.
 */
export async function guardarMasivoAuditado(coleccion, items, { accion, detalle = '' }, tam = 100) {
  const errores = [];
  let ok = 0;
  async function lote(grupo) {
    const b = writeBatch(db);
    const auditId = auditar(b, {
      accion, coleccion, docIds: grupo.map(g => g.id),
      despues: { cantidad: grupo.length }, detalle
    });
    grupo.forEach(g => b.set(doc(db, coleccion, g.id), { ...g.datos, auditId }));
    try { await b.commit(); ok += grupo.length; }
    catch (e) {
      if (grupo.length > 1) {
        const m = Math.ceil(grupo.length / 2);
        await lote(grupo.slice(0, m));
        await lote(grupo.slice(m));
      } else errores.push({ id: grupo[0].id, error: e.code || e.message });
    }
  }
  for (let i = 0; i < items.length; i += tam) await lote(items.slice(i, i + tam));
  return { ok, errores };
}

/**
 * Soportes como ENLACES (plan gratuito Spark, sin Firebase Storage).
 * El archivo se guarda en Google Drive de la Federación y aquí se registra
 * su enlace. enlace = { name, url }.
 */
export async function subirSoporte(coleccion, docId, enlace) {
  const url = String(enlace?.url || '').trim();
  if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('El enlace del soporte debe comenzar por https://');
  const nombre = String(enlace?.name || '').trim() || 'Soporte';
  return {
    nombre: nombre.slice(0, 200), ruta: url, url, tipo: 'enlace',
    subidoPor: sesion.user.email, fecha: new Date().toISOString()
  };
}

export async function urlSoporte(ruta) {
  return ruta;
}

/**
 * Crea un usuario de Authentication sin cerrar la sesión del administrador
 * (usa una instancia secundaria temporal de Firebase).
 */
export async function crearUsuarioAuth(email, clave) {
  const sec = initializeApp(firebaseConfig, 'secundaria-' + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(sec), email, clave);
    return cred.user.uid;
  } finally {
    await signOut(getAuth(sec)).catch(() => {});
    await deleteApp(sec);
  }
}
