// =====================================================================
// Configuración institucional, responsabilidades RUT, periodos y respaldo
// =====================================================================
import { db, doc, collection, getDocs, writeBatch, auditar, guardarAuditado, sesion, subirSoporte, urlSoporte } from '../db.js';
import { store, alCambiar } from '../store.js';
import { $, $$, esc, toast, errorMsg, dvNit, confirmar, fmtFechaHora, campoEnlace, leerEnlace } from '../util.js';
import { puede } from '../app.js';

export const RESPONSABILIDADES = [
  { c: '04', n: 'Impuesto sobre la renta y complementarios – régimen tributario especial', def: true },
  { c: '07', n: 'Retención en la fuente a título de renta', def: true },
  { c: '14', n: 'Informante de exógena', def: true },
  { c: '16', n: 'Obligación de facturar por ingresos (verificar descripción exacta en el RUT)', def: true },
  { c: '42', n: 'Obligado a llevar contabilidad', def: true },
  { c: '52', n: 'Facturador electrónico', def: true },
  { c: '55', n: 'Informante de beneficiarios finales', def: true },
  { c: '48', n: 'Impuesto sobre las ventas – IVA', def: false, verificar: true },
  { c: '49', n: 'No responsable de IVA', def: false, verificar: true },
  { c: '09', n: 'Retención en la fuente en el impuesto sobre las ventas', def: false, verificar: true }
];

// Valores iniciales tomados del documento de requerimientos (RUT suministrado).
const BASE = {
  razonSocial: 'FEDERACIÓN DE BOMBEROS DEL VALLE DEL CAUCA Y OTROS DEPARTAMENTOS',
  nombreComercial: 'FEDEBOMBEROS', nit: '901108629', dv: '6',
  municipio: 'Guadalajara de Buga', departamento: 'Valle del Cauca', actividad: '9499',
  naturaleza: 'Entidad sin ánimo de lucro', regimen: 'Régimen tributario especial',
  marco: 'Grupo 2 – NIIF para las Pymes (Decreto 2420 de 2015, Anexo 2)',
  moneda: 'COP', anoContable: 2026
};

const CAMPOS = [
  ['razonSocial', 'Razón social', 'text', 2], ['nombreComercial', 'Nombre comercial', 'text'],
  ['nit', 'NIT (sin DV)', 'text'], ['dv', 'DV', 'text'], ['actividad', 'Actividad económica (CIIU)', 'text'],
  ['direccion', 'Dirección', 'text', 2], ['municipio', 'Municipio', 'text'], ['departamento', 'Departamento', 'text'],
  ['correo', 'Correo electrónico', 'email'], ['telefono', 'Teléfono', 'text'],
  ['naturaleza', 'Naturaleza', 'text'], ['regimen', 'Régimen tributario', 'text'], ['marco', 'Marco técnico normativo', 'text', 2],
  ['anoContable', 'Año contable en curso', 'number'], ['moneda', 'Moneda', 'text'],
  ['repLegal', 'Representante legal', 'text'], ['repLegalId', 'C.C. representante legal', 'text'],
  ['contador', 'Contador(a) público(a)', 'text'], ['contadorTP', 'T.P. contador(a)', 'text'],
  ['revisor', 'Revisor(a) fiscal', 'text'], ['revisorTP', 'T.P. revisor(a) fiscal', 'text'],
  ['bancos', 'Datos bancarios (banco, tipo y número de cuenta)', 'textarea', 2],
  ['infoAdicional', 'Información institucional adicional', 'textarea', 2]
];

export async function render(vista) {
  const editable = puede('admin', 'contador');
  const esAdmin = puede('admin');

  function dibujar() {
    const i = { ...BASE, ...store.institucion };
    const nueva = !store.institucion.razonSocial;
    const resp = i.responsabilidades || Object.fromEntries(RESPONSABILIDADES.map(r => [r.c, { activa: r.def }]));
    const pendientes = RESPONSABILIDADES.filter(r => r.verificar && !resp[r.c]?.verificada);
    const dvCalc = dvNit(i.nit);

    vista.innerHTML = `
    ${nueva ? `<div class="alerta aviso">La configuración aún no se ha guardado. Los datos mostrados provienen del documento de requerimientos: revíselos contra el RUT y el certificado de Cámara de Comercio y guarde.</div>` : ''}
    <div class="alerta aviso"><b>Verificar razón social:</b> en documentos anteriores de la entidad figura “Federación <u>Departamental</u> de Bomberos del Valle del Cauca y Otros Departamentos”. Use el nombre exacto de la casilla 35 del RUT.</div>
    ${pendientes.length ? `<div class="alerta aviso"><b>Alerta de verificación tributaria:</b> el RUT suministrado no muestra las responsabilidades ${pendientes.map(r => r.c).join(', ')}. Los módulos de IVA y ReteIVA permanecerán inactivos hasta confirmar la situación tributaria. Marque cada una como verificada cuando haga la revisión.</div>` : ''}

    <form class="tarjeta" id="fInst">
      <h3>Datos institucionales</h3>
      <div class="rejilla">
        ${CAMPOS.map(([k, t, tipo, span]) => `<label style="${span ? 'grid-column:span ' + span : ''}">${esc(t)}
          ${tipo === 'textarea' ? `<textarea name="${k}" rows="2" ${editable ? '' : 'readonly'}>${esc(i[k] || '')}</textarea>`
            : `<input name="${k}" type="${tipo}" value="${esc(i[k] ?? '')}" ${editable ? '' : 'readonly'}>`}</label>`).join('')}
      </div>
      ${i.nit && dvCalc !== String(i.dv) ? `<div class="alerta error">El DV registrado (${esc(i.dv)}) no coincide con el calculado (${dvCalc}).</div>` : `<p class="tenue">DV calculado para el NIT: ${dvCalc}</p>`}
      <h3 style="margin-top:14px">Responsabilidades tributarias (RUT casilla 53)</h3>
      <table class="t"><thead><tr><th>Código</th><th>Responsabilidad</th><th>Registrada en RUT</th><th>Estado de verificación</th></tr></thead><tbody>
      ${RESPONSABILIDADES.map(r => {
        const v = resp[r.c] || {};
        return `<tr><td>${r.c}</td><td>${esc(r.n)}</td>
          <td><label class="chk"><input type="checkbox" name="resp_${r.c}" ${v.activa ? 'checked' : ''} ${editable ? '' : 'disabled'}> Activa</label></td>
          <td>${r.verificar ? `<label class="chk"><input type="checkbox" name="ver_${r.c}" ${v.verificada ? 'checked' : ''} ${editable ? '' : 'disabled'}> Verificada</label>` : '<span class="chip ok">Según RUT</span>'}</td></tr>`;
      }).join('')}
      </tbody></table>
      ${editable ? '<div class="acciones" style="margin-top:12px"><button class="btn primario">Guardar configuración</button></div>' : ''}
      ${i.actualizadoPor ? `<p class="tenue">Última actualización: ${esc(i.actualizadoPor)} · ${esc(i.actualizadoEn || '')}</p>` : ''}
    </form>

    <div class="tarjeta">
      <h3>Documentos institucionales</h3>
      <p class="tenue">RUT, certificado de existencia y representación legal, estatutos, actas, certificación RTE, etc. El archivo se guarda en Google Drive de la Federación y aquí se registra su enlace.</p>
      <table class="t"><thead><tr><th>Documento</th><th>Cargado por</th><th>Fecha</th><th></th></tr></thead><tbody>
        ${(i.documentos || []).map((d, k) => `<tr><td>${esc(d.nombre)}</td><td>${esc(d.subidoPor)}</td><td>${esc(d.fecha?.slice(0, 10))}</td><td><button class="btn chico" data-ver="${k}">Ver</button></td></tr>`).join('') || '<tr><td colspan="4" class="tenue">Sin documentos cargados.</td></tr>'}
      </tbody></table>
      ${editable ? `<div class="fila" style="margin-top:10px">${campoEnlace('docInst')}<button class="btn fijo" id="subirDoc">Registrar documento</button></div>` : ''}
    </div>

    <div class="tarjeta">
      <h3>Periodos contables</h3>
      <p class="tenue">Solo se registran comprobantes en periodos existentes y abiertos. Diciembre de 2025 se habilita únicamente para el asiento de apertura.</p>
      ${esAdmin ? `<div class="fila"><label>Año<input type="number" id="anoPer" value="${i.anoContable || 2026}" min="2025" max="2099"></label>
        <button class="btn fijo" id="crearAno">Habilitar los 12 meses del año</button>
        <button class="btn fijo" id="crearDic">Habilitar diciembre del año anterior (apertura)</button></div>` : ''}
      <div class="tabla-cont" style="margin-top:10px"><table class="t"><thead><tr><th>Periodo</th><th>Estado</th><th>Último cambio</th>${esAdmin ? '<th></th>' : ''}</tr></thead><tbody>
      ${[...store.periodos.values()].sort((a, b) => a.id.localeCompare(b.id)).map(p => `<tr><td>${p.id}</td>
        <td><span class="chip ${p.estado === 'abierto' ? 'ok' : 'mal'}">${p.estado}</span></td>
        <td class="tenue">${esc(p.cambiadoPor || '')} ${esc(p.cambiadoEn || '')}</td>
        ${esAdmin ? `<td><button class="btn chico" data-per="${p.id}" data-est="${p.estado === 'abierto' ? 'cerrado' : 'abierto'}">${p.estado === 'abierto' ? 'Cerrar' : 'Reabrir'}</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="4" class="tenue">No hay periodos habilitados.</td></tr>'}
      </tbody></table></div>
    </div>

    ${esAdmin ? `<div class="tarjeta"><h3>Respaldo de información</h3>
      <p class="tenue">Descarga una copia completa (JSON) de configuración, periodos, plan de cuentas, terceros, comprobantes, usuarios y bitácora. Guárdela fuera del sistema (por ejemplo, mensualmente).</p>
      <button class="btn" id="respaldo">Descargar respaldo completo</button></div>` : ''}`;

    // ---- Eventos ----
    $('#fInst').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const datos = {};
      CAMPOS.forEach(([k, , tipo]) => { datos[k] = tipo === 'number' ? Number(f.get(k)) : String(f.get(k) || '').trim(); });
      datos.nit = datos.nit.replace(/\D/g, '');
      if (!datos.razonSocial || !datos.nit) return toast('Razón social y NIT son obligatorios.', 'error');
      if (dvNit(datos.nit) !== datos.dv) return toast(`El DV no corresponde al NIT (calculado: ${dvNit(datos.nit)}).`, 'error');
      datos.responsabilidades = Object.fromEntries(RESPONSABILIDADES.map(r => [r.c, {
        activa: f.get('resp_' + r.c) === 'on',
        verificada: r.verificar ? f.get('ver_' + r.c) === 'on' : true
      }]));
      datos.documentos = store.institucion.documentos || [];
      datos.actualizadoPor = sesion.user.email;
      datos.actualizadoEn = new Date().toLocaleString('es-CO');
      try {
        await guardarAuditado('config', 'institucion', datos, { accion: nueva ? 'crear' : 'modificar', antes: store.institucion });
        toast('Configuración guardada.');
      } catch (err) { toast(errorMsg(err), 'error'); }
    };

    $$('[data-ver]').forEach(b => b.onclick = async () => {
      const d = i.documentos[Number(b.dataset.ver)];
      try { window.open(await urlSoporte(d.ruta), '_blank'); } catch (err) { toast(errorMsg(err), 'error'); }
    });
    const sd = $('#subirDoc');
    if (sd) sd.onclick = async () => {
      const a = leerEnlace('docInst');
      if (!a) return toast('Pegue el enlace de Google Drive del documento.', 'error');
      if (!store.institucion.razonSocial) return toast('Guarde primero la configuración institucional.', 'error');
      sd.disabled = true;
      try {
        const meta = await subirSoporte('config', 'institucion', a);
        const antes = store.institucion;
        await guardarAuditado('config', 'institucion', { ...antes, documentos: [...(antes.documentos || []), meta] },
          { accion: 'adjuntar documento', antes: { documentos: antes.documentos || [] }, detalle: a.name });
        toast('Documento cargado.');
      } catch (err) { toast(errorMsg(err), 'error'); sd.disabled = false; }
    };

    async function crearPeriodos(lista) {
      const nuevos = lista.filter(p => !store.periodos.has(p));
      if (!nuevos.length) return toast('Esos periodos ya existen.', 'error');
      const b = writeBatch(db);
      const auditId = auditar(b, { accion: 'habilitar periodos', coleccion: 'periodos', docIds: nuevos, despues: { estado: 'abierto' } });
      nuevos.forEach(p => b.set(doc(db, 'periodos', p), { estado: 'abierto', cambiadoPor: sesion.user.email, cambiadoEn: new Date().toLocaleString('es-CO'), auditId }));
      try { await b.commit(); toast(`${nuevos.length} periodo(s) habilitado(s).`); } catch (err) { toast(errorMsg(err), 'error'); }
    }
    if ($('#crearAno')) {
      $('#crearAno').onclick = () => { const a = Number($('#anoPer').value); crearPeriodos(Array.from({ length: 12 }, (_, k) => `${a}-${String(k + 1).padStart(2, '0')}`)); };
      $('#crearDic').onclick = () => { const a = Number($('#anoPer').value) - 1; crearPeriodos([`${a}-12`]); };
    }
    $$('[data-per]').forEach(b => b.onclick = async () => {
      const p = b.dataset.per, est = b.dataset.est;
      const motivo = await confirmar(`${est === 'cerrado' ? 'Cerrar' : 'Reabrir'} periodo ${p}`,
        est === 'cerrado' ? 'Al cerrar el periodo nadie podrá registrar, modificar ni anular comprobantes con fecha en ese mes.' : 'Reabrir permite modificar información ya reportada. Quedará registrado en la bitácora.',
        { pedirMotivo: true, peligro: est === 'abierto' });
      if (!motivo) return;
      try {
        await guardarAuditado('periodos', p, { estado: est, cambiadoPor: sesion.user.email, cambiadoEn: new Date().toLocaleString('es-CO'), motivo },
          { accion: est === 'cerrado' ? 'cerrar periodo' : 'reabrir periodo', antes: store.periodos.get(p), detalle: motivo });
        toast(`Periodo ${p} ${est}.`);
      } catch (err) { toast(errorMsg(err), 'error'); }
    });

    const r = $('#respaldo');
    if (r) r.onclick = async () => {
      r.disabled = true; r.textContent = 'Generando…';
      try {
        const out = { generado: new Date().toISOString(), por: sesion.user.email, proyecto: 'fedebomberos-contable' };
        for (const c of ['config', 'periodos', 'puc', 'terceros', 'comprobantes', 'consecutivos', 'usuarios', 'aperturaBorrador', 'bitacora']) {
          const s = await getDocs(collection(db, c));
          out[c] = s.docs.map(d => ({ id: d.id, ...JSON.parse(JSON.stringify(d.data())) }));
        }
        const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `respaldo_fedebomberos_${new Date().toISOString().slice(0, 10)}.json`; a.click();
        toast('Respaldo descargado.');
      } catch (err) { toast(errorMsg(err), 'error'); }
      r.disabled = false; r.textContent = 'Descargar respaldo completo';
    };
  }

  dibujar();
  return alCambiar(q => { if (q === 'config' || q === 'periodos') dibujar(); });
}
