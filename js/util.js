// =====================================================================
// Utilidades: formato, cálculo, DV, Excel, impresión, interfaz
// =====================================================================
import XLSX from './vendor/xlsx.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Dinero: se calcula en centavos enteros para evitar errores de coma flotante ----------
export const cent = v => Math.round((Number(v) || 0) * 100);
export const desdeCent = c => c / 100;
export function sumar(valores) { return desdeCent(valores.reduce((a, v) => a + cent(v), 0)); }

const fmtCOP = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = v => fmtCOP.format(Number(v) || 0);

/** Interpreta un número escrito en formato colombiano (1.234.567,89) o internacional. */
export function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/\s|\$/g, '');
  if (!s) return 0;
  let neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : NaN;
}

// ---------- Fechas ----------
export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fechaExcel(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number') { // número de serie de Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
export function fechaValida(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const [y, m, d] = f.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
export const fmtFechaHora = ts => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' });
};

// ---------- Dígito de verificación DIAN (NIT) ----------
const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
export function dvNit(nit) {
  const s = String(nit).replace(/\D/g, '');
  if (!s || s.length > 15) return '';
  let suma = 0;
  [...s].reverse().forEach((c, i) => { suma += Number(c) * PESOS_DV[i]; });
  const r = suma % 11;
  return String(r > 1 ? 11 - r : r);
}

// ---------- PUC: nivel y naturaleza ----------
export function nivelCuenta(codigo) {
  const l = String(codigo).length;
  return l === 1 ? 1 : l === 2 ? 2 : l <= 4 ? 3 : l <= 6 ? 4 : 4 + Math.ceil((l - 6) / 2);
}
export const LONG_NIVEL = { 1: 1, 2: 2, 3: 4, 4: 6, 5: 8, 6: 10, 7: 12 };
export function prefijos(codigo) {
  const c = String(codigo); const out = [];
  for (const n of [1, 2, 4, 6, 8, 10, 12, 14, 16]) if (c.length >= n) out.push(c.slice(0, n));
  if (!out.includes(c)) out.push(c);
  return out;
}
/** Naturaleza por defecto según la clase (Decreto 2650 de 1993); 8 y 9 dependen del grupo. */
export function naturalezaPorDefecto(codigo) {
  const c = String(codigo);
  if (['1', '5', '6', '7'].includes(c[0])) return 'D';
  if (['2', '3', '4'].includes(c[0])) return 'C';
  if (c[0] === '8') return ['81', '82', '83'].includes(c.slice(0, 2)) ? 'D' : 'C';
  if (c[0] === '9') return ['91', '92', '93'].includes(c.slice(0, 2)) ? 'C' : 'D';
  return 'D';
}
export const CLASES = {
  '1': 'Activo', '2': 'Pasivo', '3': 'Patrimonio', '4': 'Ingresos', '5': 'Gastos',
  '6': 'Costos de ventas', '7': 'Costos de producción', '8': 'Cuentas de orden deudoras', '9': 'Cuentas de orden acreedoras'
};

// ---------- Excel ----------
export function exportarExcel(nombreArchivo, hojas) {
  // hojas: [{ nombre, filas: [[...]] }]  (primera fila = encabezados)
  const wb = XLSX.utils.book_new();
  hojas.forEach(h => {
    const ws = XLSX.utils.aoa_to_sheet(h.filas);
    ws['!cols'] = (h.filas[0] || []).map((_, i) => ({ wch: Math.min(60, Math.max(10, ...h.filas.map(f => String(f[i] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  });
  XLSX.writeFile(wb, nombreArchivo);
}
export async function leerExcel(archivo) {
  const buf = await archivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  // Normaliza encabezados: minúsculas, sin tildes ni espacios
  return filas.map(f => Object.fromEntries(Object.entries(f).map(([k, v]) => [normal(k), v])));
}
export const normal = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const siNo = v => ['s', 'si', 'x', '1', 'true', 'verdadero'].includes(normal(v));

// ---------- Interfaz ----------
export function toast(msg, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('fuera'), tipo === 'error' ? 7000 : 3500);
  setTimeout(() => t.remove(), tipo === 'error' ? 7600 : 4100);
}

export function errorMsg(e) {
  const c = e?.code || '';
  if (c.includes('permission-denied')) return 'Operación rechazada por las reglas de seguridad (permiso, periodo cerrado o dato inválido).';
  if (c.includes('unavailable')) return 'Sin conexión con Firebase. Verifique internet e intente de nuevo.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (c.includes('too-many-requests')) return 'Demasiados intentos. Espere unos minutos.';
  if (c.includes('email-already-in-use')) return 'Ese correo ya tiene una cuenta en Firebase.';
  if (c.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres (se recomiendan 12).';
  return e?.message || String(e);
}

/** Ventana modal. Devuelve { el, cerrar }. */
export function modal(titulo, cuerpoHtml, { ancho = '720px', botones = '' } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal" style="max-width:${ancho}">
    <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="btn-x" data-cerrar>×</button></div>
    <div class="modal-cuerpo">${cuerpoHtml}</div>
    ${botones ? `<div class="modal-pie">${botones}</div>` : ''}</div>`;
  document.body.appendChild(fondo);
  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', e => { if (e.target.matches('[data-cerrar]')) cerrar(); });
  return { el: fondo, cerrar };
}

export function confirmar(titulo, mensaje, { pedirMotivo = false, textoBoton = 'Confirmar', peligro = false } = {}) {
  return new Promise(res => {
    const m = modal(titulo, `<p>${mensaje}</p>${pedirMotivo ? '<label>Motivo (obligatorio)<textarea id="motivo" rows="3" maxlength="500"></textarea></label>' : ''}`,
      { ancho: '520px', botones: `<button class="btn" data-cerrar>Cancelar</button><button class="btn ${peligro ? 'peligro' : 'primario'}" id="ok">${esc(textoBoton)}</button>` });
    m.el.querySelector('#ok').onclick = () => {
      const motivo = pedirMotivo ? m.el.querySelector('#motivo').value.trim() : true;
      if (pedirMotivo && motivo.length < 10) { toast('Escriba un motivo de al menos 10 caracteres.', 'error'); return; }
      m.cerrar(); res(motivo);
    };
    m.el.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => res(false)));
  });
}

/** Abre una ventana de impresión (el usuario puede elegir "Guardar como PDF"). */
export function imprimir(titulo, html, encabezado) {
  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana emergente. Permita ventanas emergentes para este sitio.', 'error'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#111;margin:18px}
    h1{font-size:14px;margin:0} h2{font-size:12px;margin:2px 0 10px}
    .enc{border-bottom:2px solid #333;margin-bottom:10px;padding-bottom:6px}
    table{width:100%;border-collapse:collapse} th,td{border:1px solid #999;padding:3px 5px;text-align:left}
    th{background:#eee} .n{text-align:right;white-space:nowrap} tr.tot td{font-weight:bold;background:#f3f3f3}
    .firmas{display:flex;gap:40px;margin-top:50px} .firmas div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center}
    @page{size:auto;margin:12mm}
  </style></head><body>
  <div class="enc">${encabezado || ''}<h2>${esc(titulo)}</h2></div>${html}
  <p style="margin-top:14px;color:#666">Generado: ${new Date().toLocaleString('es-CO')}</p>
  <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

/** Ordena y filtra una tabla HTML ya renderizada al hacer clic en encabezados con data-ordenar. */
export function tablaOrdenable(tabla) {
  tabla.querySelectorAll('th[data-ordenar]').forEach((th, idx) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = [...th.parentNode.children].indexOf(th);
      const asc = th.dataset.dir !== 'asc'; th.dataset.dir = asc ? 'asc' : 'desc';
      const tb = tabla.tBodies[0];
      const filas = [...tb.rows];
      filas.sort((a, b) => {
        const x = a.cells[col]?.dataset.v ?? a.cells[col]?.textContent ?? '';
        const y = b.cells[col]?.dataset.v ?? b.cells[col]?.textContent ?? '';
        const nx = parseFloat(x), ny = parseFloat(y);
        const r = (!isNaN(nx) && !isNaN(ny) && String(nx) === x && String(ny) === y) ? nx - ny : String(x).localeCompare(String(y), 'es', { numeric: true });
        return asc ? r : -r;
      });
      filas.forEach(f => tb.appendChild(f));
    });
  });
}

// ---------- Soportes por enlace (Google Drive) ----------
export function campoEnlace(id) {
  return `<input id="${id}N" placeholder="Nombre del soporte (ej. Factura FE-123)" maxlength="200">
    <input id="${id}" type="url" placeholder="Enlace de Google Drive (https://…)">`;
}
/** Devuelve { name, url } o null si el campo de enlace está vacío. */
export function leerEnlace(id, raiz = document) {
  const url = (raiz.querySelector('#' + id)?.value || '').trim();
  if (!url) return null;
  return { name: (raiz.querySelector('#' + id + 'N')?.value || '').trim() || 'Soporte', url };
}
