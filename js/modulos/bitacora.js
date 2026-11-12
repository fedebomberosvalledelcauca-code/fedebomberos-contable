// =====================================================================
// Bitácora de auditoría (solo lectura)
// =====================================================================
import { db, collection, query, orderBy, limit, getDocs, where } from '../db.js';
import { $, $$, esc, toast, errorMsg, modal, exportarExcel, fmtFechaHora } from '../util.js';

export async function render(vista) {
  let filas = [];
  vista.innerHTML = `
  <div class="tarjeta"><div class="fila">
    <label class="fijo">Desde<input type="date" id="bDesde"></label>
    <label class="fijo">Hasta<input type="date" id="bHasta"></label>
    <label class="fijo">Colección<select id="bCol"><option value="">Todas</option>${['comprobantes', 'puc', 'terceros', 'config', 'periodos', 'usuarios'].map(c => `<option>${c}</option>`).join('')}</select></label>
    <label>Texto (usuario, documento, acción)<input id="bTxt"></label>
    <div class="acciones fijo"><button class="btn primario" id="bBuscar">Consultar</button><button class="btn" id="bExp">Exportar Excel</button></div>
  </div><p class="tenue">Registros inalterables: ningún usuario, ni el administrador, puede modificarlos o borrarlos. Hora del servidor de Firebase.</p></div>
  <div class="tarjeta"><div id="bRes" class="tenue"></div><div class="tabla-cont"><table class="t"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Colección</th><th>Documento(s)</th><th>Detalle</th><th></th></tr></thead><tbody id="bCuerpo"></tbody></table></div></div>`;

  async function consultar() {
    try {
      const cond = [];
      if ($('#bDesde').value) cond.push(where('fecha', '>=', new Date($('#bDesde').value + 'T00:00:00')));
      if ($('#bHasta').value) cond.push(where('fecha', '<=', new Date($('#bHasta').value + 'T23:59:59')));
      const s = await getDocs(query(collection(db, 'bitacora'), ...cond, orderBy('fecha', 'desc'), limit(1000)));
      filas = s.docs.map(d => ({ id: d.id, ...d.data() }));
      dibujar();
    } catch (e) { toast(errorMsg(e), 'error'); }
  }
  function visibles() {
    const col = $('#bCol').value, t = $('#bTxt').value.toLowerCase();
    return filas.filter(f => (!col || f.coleccion === col) && (!t || [f.email, f.accion, f.detalle, ...(f.docIds || [])].join(' ').toLowerCase().includes(t)));
  }
  function dibujar() {
    const v = visibles();
    $('#bRes').textContent = `${v.length} registros${filas.length === 1000 ? ' (se muestran los 1.000 más recientes del rango; acote las fechas)' : ''}.`;
    $('#bCuerpo').innerHTML = v.map((f, k) => `<tr><td>${fmtFechaHora(f.fecha)}</td><td>${esc(f.email)}</td><td>${esc(f.rol || '')}</td><td>${esc(f.accion)}</td>
      <td>${esc(f.coleccion)}</td><td>${esc((f.docIds || []).slice(0, 3).join(', '))}${(f.docIds || []).length > 3 ? ` (+${f.docIds.length - 3})` : ''}</td>
      <td>${esc(f.detalle || '')}</td><td><button class="btn chico" data-k="${k}">Ver</button></td></tr>`).join('');
    $$('[data-k]').forEach(b => b.onclick = () => {
      const f = v[Number(b.dataset.k)];
      modal(`${f.accion} · ${f.coleccion}`, `<p><b>${esc(f.email)}</b> · ${fmtFechaHora(f.fecha)}</p><p>Documentos: ${esc((f.docIds || []).join(', '))}</p>
        ${f.detalle ? `<p>Detalle: ${esc(f.detalle)}</p>` : ''}
        <div class="rejilla"><div><b>Valor anterior</b><pre class="json">${esc(JSON.stringify(f.antes, null, 2))}</pre></div>
        <div><b>Valor nuevo</b><pre class="json">${esc(JSON.stringify(f.despues, null, 2))}</pre></div></div>`, { ancho: '1000px' });
    });
  }
  $('#bBuscar').onclick = consultar;
  $('#bCol').onchange = dibujar; $('#bTxt').oninput = dibujar;
  $('#bExp').onclick = () => exportarExcel('Bitacora_FEDEBOMBEROS.xlsx', [{ nombre: 'Bitacora', filas: [
    ['Fecha', 'Usuario', 'Rol', 'Acción', 'Colección', 'Documentos', 'Detalle', 'Valor anterior', 'Valor nuevo'],
    ...visibles().map(f => [fmtFechaHora(f.fecha), f.email, f.rol || '', f.accion, f.coleccion, (f.docIds || []).join(', '), f.detalle || '',
      JSON.stringify(f.antes).slice(0, 32000), JSON.stringify(f.despues).slice(0, 32000)])] }]);
  consultar();
}
