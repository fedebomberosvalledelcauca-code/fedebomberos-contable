// =====================================================================
// Terceros
// =====================================================================
import { guardarAuditado, guardarMasivoAuditado, subirSoporte, urlSoporte, sesion } from '../db.js';
import { store, alCambiar } from '../store.js';
import { $, $$, esc, toast, errorMsg, modal, exportarExcel, leerExcel, dvNit, normal, tablaOrdenable, campoEnlace, leerEnlace } from '../util.js';
import { puede } from '../app.js';

// Tipos de documento según codificación DIAN
export const TIPOS_ID = {
  '13': 'Cédula de ciudadanía', '31': 'NIT', '22': 'Cédula de extranjería', '12': 'Tarjeta de identidad',
  '11': 'Registro civil', '21': 'Tarjeta de extranjería', '41': 'Pasaporte', '42': 'Documento de identificación extranjero',
  '47': 'PEP', '48': 'PPT', '50': 'NIT de otro país', '91': 'NUIP'
};
export const CLASIFICACION = ['Persona natural', 'Persona jurídica', 'Cuerpo de bomberos afiliado', 'Proveedor', 'Cliente',
  'Entidad pública', 'Entidad privada', 'Contratista', 'Empleado', 'Banco', 'Otro'];
const ENC = ['tipo_id', 'numero', 'dv', 'nombre', 'direccion', 'municipio', 'departamento', 'correo', 'telefono', 'responsabilidades', 'regimen', 'clasificacion', 'cuenta_asociada', 'observaciones'];

export async function render(vista) {
  const crea = puede('admin', 'contador', 'auxiliar');
  const edita = puede('admin', 'contador');
  let filtro = { texto: '', clase: '' };

  vista.innerHTML = `
  <div class="tarjeta"><div class="fila">
    <label>Buscar<input id="fTexto" placeholder="Identificación o nombre"></label>
    <label class="fijo">Clasificación<select id="fClase"><option value="">Todas</option>${CLASIFICACION.map(c => `<option>${c}</option>`).join('')}</select></label>
    <div class="acciones fijo">${crea ? '<button class="btn primario" id="nuevo">Nuevo tercero</button>' : ''}
      ${edita ? '<button class="btn" id="importar">Importar Excel</button>' : ''}<button class="btn" id="exportar">Exportar Excel</button></div>
  </div></div>
  <div class="tarjeta"><div id="resumen" class="tenue"></div><div class="tabla-cont" style="margin-top:8px"><table class="t" id="tabla"></table></div></div>`;

  function dibujar() {
    const lista = [...store.terceros.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const t = normal(filtro.texto);
    const vis = lista.filter(x => (!t || normal(x.numero).includes(t) || normal(x.nombre).includes(t)) && (!filtro.clase || (x.clasificacion || []).includes(filtro.clase)));
    // Control de posibles duplicados: mismo número con distinto tipo, o mismo nombre normalizado
    const porNum = new Map(), porNom = new Map();
    lista.forEach(x => { porNum.set(x.numero, [...(porNum.get(x.numero) || []), x.id]); const n = normal(x.nombre); porNom.set(n, [...(porNom.get(n) || []), x.id]); });
    const dupNum = [...porNum.values()].filter(v => v.length > 1), dupNom = [...porNom.values()].filter(v => v.length > 1);
    const dvMal = lista.filter(x => x.tipoId === '31' && x.dv && dvNit(x.numero) !== x.dv);
    $('#resumen').innerHTML = `${lista.length} terceros · mostrando ${vis.length}
      ${dupNum.length || dupNom.length ? `<div class="alerta aviso" style="margin-top:6px">Posibles duplicados para revisar (no se fusionan automáticamente): ${[...dupNum, ...dupNom].map(v => v.join(' / ')).slice(0, 8).join('; ')}</div>` : ''}
      ${dvMal.length ? `<div class="alerta error" style="margin-top:6px">NIT con DV inconsistente: ${dvMal.map(x => x.numero).join(', ')}</div>` : ''}`;
    $('#tabla').innerHTML = `<thead><tr><th data-ordenar>Tipo</th><th data-ordenar>Identificación</th><th data-ordenar>Nombre / razón social</th><th data-ordenar>Municipio</th><th>Clasificación</th><th>Soportes</th><th>Estado</th><th></th></tr></thead>
      <tbody>${vis.map(x => `<tr><td>${esc(TIPOS_ID[x.tipoId] ? x.tipoId : x.tipoId)}</td><td>${esc(x.numero)}${x.dv ? '-' + esc(x.dv) : ''}</td><td>${esc(x.nombre)}</td>
        <td>${esc(x.municipio || '')}</td><td>${(x.clasificacion || []).map(c => `<span class="chip">${esc(c)}</span>`).join(' ')}</td>
        <td>${(x.soportes || []).length || ''}</td><td><span class="chip ${x.activo ? 'ok' : 'mal'}">${x.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td><button class="btn chico" data-ed="${esc(x.id)}">${edita ? 'Editar' : 'Ver'}</button></td></tr>`).join('')}</tbody>`;
    tablaOrdenable($('#tabla'));
    $$('[data-ed]').forEach(b => b.onclick = () => formulario(store.terceros.get(b.dataset.ed)));
  }

  function formulario(x) {
    const nuevo = !x;
    const soloLectura = !nuevo && !edita;
    x = x || { tipoId: '31', numero: '', dv: '', nombre: '', clasificacion: [], activo: true, soportes: [] };
    const ro = soloLectura ? 'readonly' : '';
    const m = modal(nuevo ? 'Nuevo tercero' : x.nombre, `
      <div class="rejilla">
        <label>Tipo de identificación<select id="tTipo" ${nuevo ? '' : 'disabled'}>${Object.entries(TIPOS_ID).map(([k, v]) => `<option value="${k}">${k} – ${v}</option>`).join('')}</select></label>
        <label>Número<input id="tNum" value="${esc(x.numero)}" ${nuevo ? '' : 'readonly'}></label>
        <label>DV<input id="tDv" value="${esc(x.dv || '')}" readonly></label>
        <label style="grid-column:span 2">Nombre o razón social<input id="tNom" value="${esc(x.nombre)}" ${ro}></label>
        <label style="grid-column:span 2">Dirección<input id="tDir" value="${esc(x.direccion || '')}" ${ro}></label>
        <label>Municipio<input id="tMun" value="${esc(x.municipio || '')}" ${ro}></label>
        <label>Departamento<input id="tDep" value="${esc(x.departamento || '')}" ${ro}></label>
        <label>Correo<input id="tCor" type="email" value="${esc(x.correo || '')}" ${ro}></label>
        <label>Teléfono<input id="tTel" value="${esc(x.telefono || '')}" ${ro}></label>
        <label>Responsabilidades RUT (códigos separados por coma)<input id="tResp" value="${esc(x.responsabilidades || '')}" ${ro}></label>
        <label>Régimen tributario<input id="tReg" value="${esc(x.regimen || '')}" ${ro}></label>
        <label>Cuenta contable asociada<input id="tCta" value="${esc(x.cuentaAsociada || '')}" list="dlCtas" ${ro}></label>
      </div>
      <datalist id="dlCtas">${[...store.puc.values()].filter(c => c.movimiento && c.activa).map(c => `<option value="${c.codigo}">${esc(c.nombre)}</option>`).join('')}</datalist>
      <div><b style="font-size:12.5px">Clasificación</b><div class="fila" style="margin-top:4px">${CLASIFICACION.map(c => `<label class="chk fijo"><input type="checkbox" value="${c}" class="tCla" ${(x.clasificacion || []).includes(c) ? 'checked' : ''} ${soloLectura ? 'disabled' : ''}> ${c}</label>`).join('')}</div></div>
      <label>Observaciones<textarea id="tObs" rows="2" ${ro}>${esc(x.observaciones || '')}</textarea></label>
      <label class="chk"><input type="checkbox" id="tAct" ${x.activo ? 'checked' : ''} ${soloLectura || nuevo ? 'disabled' : ''}> Activo</label>
      ${nuevo ? '' : `<div><b style="font-size:12.5px">Soportes (RUT y otros)</b>
        <ul>${(x.soportes || []).map((s, k) => `<li><a href="#" data-sop="${k}">${esc(s.nombre)}</a> <span class="tenue">${esc(s.subidoPor)} ${esc(s.fecha.slice(0, 10))}</span></li>`).join('') || '<li class="tenue">Sin soportes</li>'}</ul>
        ${crea ? `<div class="fila">${campoEnlace('tArch')}<button class="btn fijo" id="tSubir">Registrar enlace</button></div>` : ''}</div>`}
      <p class="tenue" id="tAviso"></p>`,
      { ancho: '860px', botones: `<button class="btn" data-cerrar>Cerrar</button>${!soloLectura ? '<button class="btn primario" id="tGuardar">Guardar</button>' : ''}` });

    $('#tTipo', m.el).value = x.tipoId;
    const calcDv = () => {
      const tipo = $('#tTipo', m.el).value, n = $('#tNum', m.el).value.replace(/[^0-9A-Za-z]/g, '');
      $('#tDv', m.el).value = tipo === '31' ? dvNit(n) : '';
      const id = `${tipo}-${n}`;
      const otros = [...store.terceros.values()].filter(t => t.numero === n && t.id !== x.id);
      $('#tAviso', m.el).innerHTML = nuevo && store.terceros.has(id) ? '<span style="color:var(--rojo)">Este tercero ya existe.</span>'
        : otros.length ? `Atención: el número ${esc(n)} ya está registrado como ${otros.map(o => esc(o.tipoId + ' ' + o.nombre)).join(', ')}.` : '';
    };
    if (nuevo) { $('#tNum', m.el).oninput = calcDv; $('#tTipo', m.el).onchange = calcDv; }

    $$('[data-sop]', m.el).forEach(a => a.onclick = async e => {
      e.preventDefault();
      try { window.open(await urlSoporte(x.soportes[Number(a.dataset.sop)].ruta), '_blank'); } catch (err) { toast(errorMsg(err), 'error'); }
    });
    const bs = $('#tSubir', m.el);
    if (bs) bs.onclick = async () => {
      const a = leerEnlace('tArch', m.el); if (!a) return toast('Pegue el enlace de Google Drive del soporte.', 'error');
      bs.disabled = true;
      try {
        const meta = await subirSoporte('terceros', x.id, a);
        const actual = store.terceros.get(x.id);
        const { id, ...resto } = actual;
        await guardarAuditado('terceros', x.id, { ...resto, soportes: [...(actual.soportes || []), meta] },
          { accion: 'adjuntar soporte', antes: { soportes: actual.soportes || [] }, detalle: a.name });
        toast('Soporte adjuntado.'); m.cerrar();
      } catch (err) { toast(errorMsg(err), 'error'); bs.disabled = false; }
    };

    const bg = $('#tGuardar', m.el);
    if (bg) bg.onclick = async () => {
      const tipoId = $('#tTipo', m.el).value;
      const numero = $('#tNum', m.el).value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const d = {
        tipoId, numero, dv: tipoId === '31' ? dvNit(numero) : '', nombre: $('#tNom', m.el).value.trim().toUpperCase().replace(/\s+/g, ' '),
        direccion: $('#tDir', m.el).value.trim(), municipio: $('#tMun', m.el).value.trim(), departamento: $('#tDep', m.el).value.trim(),
        correo: $('#tCor', m.el).value.trim(), telefono: $('#tTel', m.el).value.trim(),
        responsabilidades: $('#tResp', m.el).value.trim(), regimen: $('#tReg', m.el).value.trim(),
        cuentaAsociada: $('#tCta', m.el).value.trim(), observaciones: $('#tObs', m.el).value.trim(),
        clasificacion: $$('.tCla', m.el).filter(c => c.checked).map(c => c.value),
        activo: nuevo ? true : $('#tAct', m.el).checked, soportes: x.soportes || [], actualizadoPor: sesion.user.email
      };
      const id = `${tipoId}-${numero}`;
      if (numero.length < 3) return toast('Número de identificación inválido.', 'error');
      if (['13', '31', '12', '11'].includes(tipoId) && !/^\d+$/.test(numero)) return toast('Para este tipo de documento el número debe ser solo dígitos (sin DV).', 'error');
      if (!d.nombre) return toast('El nombre es obligatorio.', 'error');
      if (!d.clasificacion.length) return toast('Seleccione al menos una clasificación.', 'error');
      if (d.cuentaAsociada && !store.puc.has(d.cuentaAsociada)) return toast('La cuenta asociada no existe en el PUC.', 'error');
      if (nuevo && store.terceros.has(id)) return toast('Este tercero ya existe.', 'error');
      try {
        await guardarAuditado('terceros', id, d, { accion: nuevo ? 'crear' : 'modificar', antes: nuevo ? null : x });
        toast('Tercero guardado.'); m.cerrar();
      } catch (err) { toast(errorMsg(err), 'error'); }
    };
  }

  function exportar() {
    exportarExcel(`Terceros_FEDEBOMBEROS_${new Date().toISOString().slice(0, 10)}.xlsx`, [{ nombre: 'Terceros', filas: [ENC,
      ...[...store.terceros.values()].map(x => [x.tipoId, x.numero, x.dv || '', x.nombre, x.direccion || '', x.municipio || '', x.departamento || '', x.correo || '',
        x.telefono || '', x.responsabilidades || '', x.regimen || '', (x.clasificacion || []).join(';'), x.cuentaAsociada || '', x.observaciones || ''])] }]);
  }

  async function importar() {
    const m = modal('Importar terceros', `<p>Columnas: <b>${ENC.join(', ')}</b>. tipo_id con código DIAN (13 CC, 31 NIT, 22 CE…). clasificacion separada por “;”.</p>
      <p class="tenue">Solo se crean terceros nuevos. Los ya existentes (mismo tipo y número) se omiten y se listan para revisión manual.</p>
      <input type="file" id="arch" accept=".xlsx,.xls,.csv"><div id="prev"></div>`,
      { ancho: '900px', botones: '<button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="ok" disabled>Importar</button>' });
    let validos = [];
    $('#arch', m.el).onchange = async e => {
      const filas = await leerExcel(e.target.files[0]);
      const errores = [], omitidos = [], vistos = new Set(); validos = [];
      filas.forEach((f, k) => {
        const tipoId = String(f.tipoid ?? '').trim(), numero = String(f.numero ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
        const nombre = String(f.nombre ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
        if (!numero && !nombre) return;
        if (!TIPOS_ID[tipoId]) return errores.push(`Fila ${k + 2}: tipo_id “${f.tipoid}” no válido.`);
        if (numero.length < 3 || !nombre) return errores.push(`Fila ${k + 2}: número o nombre faltante.`);
        const id = `${tipoId}-${numero}`;
        if (vistos.has(id)) return errores.push(`Fila ${k + 2}: ${id} repetido en el archivo.`);
        vistos.add(id);
        if (store.terceros.has(id)) return omitidos.push(id);
        if (tipoId === '31' && String(f.dv ?? '') !== '' && String(f.dv) !== dvNit(numero)) errores.push(`Fila ${k + 2}: DV ${f.dv} no corresponde al NIT ${numero} (se usará ${dvNit(numero)}).`);
        const clas = String(f.clasificacion ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
        validos.push({ id, datos: { tipoId, numero, dv: tipoId === '31' ? dvNit(numero) : '', nombre,
          direccion: String(f.direccion ?? ''), municipio: String(f.municipio ?? ''), departamento: String(f.departamento ?? ''),
          correo: String(f.correo ?? ''), telefono: String(f.telefono ?? ''), responsabilidades: String(f.responsabilidades ?? ''),
          regimen: String(f.regimen ?? ''), clasificacion: clas.length ? clas : ['Otro'], cuentaAsociada: String(f.cuentaasociada ?? ''),
          observaciones: String(f.observaciones ?? ''), activo: true, soportes: [], actualizadoPor: sesion.user.email } });
      });
      $('#prev', m.el).innerHTML = `<div class="alerta ${errores.length ? 'aviso' : 'ok'}">${validos.length} terceros nuevos · ${omitidos.length} ya existentes (omitidos) · ${errores.length} observaciones.</div>
        ${errores.length || omitidos.length ? `<pre class="json">${esc([...errores, ...omitidos.map(o => 'Ya existe: ' + o)].join('\n'))}</pre>` : ''}`;
      $('#ok', m.el).disabled = !validos.length;
    };
    $('#ok', m.el).onclick = async () => {
      $('#ok', m.el).disabled = true;
      const r = await guardarMasivoAuditado('terceros', validos, { accion: 'importar Excel', detalle: $('#arch', m.el).files[0]?.name });
      m.cerrar();
      toast(r.errores.length ? `${r.ok} importados; ${r.errores.length} rechazados.` : `${r.ok} terceros importados.`, r.errores.length ? 'error' : 'ok');
    };
  }

  $('#fTexto').oninput = e => { filtro.texto = e.target.value; dibujar(); };
  $('#fClase').onchange = e => { filtro.clase = e.target.value; dibujar(); };
  $('#exportar').onclick = exportar;
  if (crea) $('#nuevo').onclick = () => formulario(null);
  if (edita) $('#importar').onclick = importar;
  dibujar();
  return alCambiar(q => { if (q === 'terceros') dibujar(); });
}
