// =====================================================================
// Saldos iniciales (asiento de apertura al 31 de diciembre del año anterior)
// =====================================================================
import { db, doc, collection, getDoc, getDocs, writeBatch, auditar, sesion } from '../db.js';
import { store, cuenta, nombreTercero, periodoAbierto, alCambiar, encabezadoInstitucional } from '../store.js';
import { $, $$, esc, toast, errorMsg, modal, confirmar, money, num, cent, exportarExcel, leerExcel, imprimir } from '../util.js';
import { crear, validar, totales } from '../contable.js';
import { puede } from '../app.js';

const ENC = ['cuenta', 'nombre_cuenta', 'tercero_tipo_id', 'tercero_numero', 'debito', 'credito', 'centro_costo', 'observaciones'];

export async function render(vista) {
  const ano = (store.institucion.anoContable || 2026) - 1;
  const fechaAp = `${ano}-12-31`;
  const gestiona = puede('admin', 'contador');
  let lineas = [];   // borrador local
  let sucio = false;

  async function cargar() {
    const s = await getDocs(collection(db, 'aperturaBorrador'));
    lineas = s.docs.map(d => ({ _id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    sucio = false; dibujar();
  }

  function erroresLinea(l) {
    const e = []; const c = cuenta(l.cuenta);
    if (!c) e.push('cuenta inexistente');
    else {
      if (!c.movimiento) e.push('cuenta sin movimiento');
      if (!c.activa) e.push('cuenta inactiva');
      if (c.exigeTercero && !l.tercero) e.push('exige tercero');
      if (c.exigeCentro && !l.centro) e.push('exige centro de costo');
      if (['4', '5', '6', '7'].includes(c.codigo[0])) e.push('cuenta de resultado: no debe tener saldo inicial');
    }
    if (l.tercero && !store.terceros.has(l.tercero)) e.push('tercero inexistente');
    if ((cent(l.debito) > 0) === (cent(l.credito) > 0)) e.push('débito o crédito (solo uno)');
    if (cent(l.debito) < 0 || cent(l.credito) < 0) e.push('valor negativo');
    return e;
  }

  function dibujar() {
    const ap = store.apertura || {};
    const confirmada = ap.estado === 'confirmada';
    const editable = gestiona && !confirmada;
    const t = totales(lineas);
    const conErr = lineas.map(erroresLinea);
    const nErr = conErr.filter(e => e.length).length;
    const claves = new Map(); lineas.forEach((l, i) => { const k = `${l.cuenta}|${l.tercero}|${l.centro}`; claves.set(k, [...(claves.get(k) || []), i + 1]); });
    const repetidas = [...claves.entries()].filter(([, v]) => v.length > 1);
    // Ecuación patrimonial informativa: Activo = Pasivo + Patrimonio (sumas por clase en sentido natural)
    const porClase = cl => lineas.filter(l => String(l.cuenta)[0] === cl).reduce((a, l) => a + cent(l.debito) - cent(l.credito), 0) / 100;
    const A = porClase('1'), P = -porClase('2'), PT = -porClase('3');

    vista.innerHTML = `
    <div class="tarjeta">
      <div class="fila"><div style="flex:3">
        <h3>Asiento de apertura · saldos al ${fechaAp}</h3>
        <p class="tenue">Los saldos se registran en un borrador. Al confirmar se genera un único comprobante tipo AP, identificado como apertura y separado de los movimientos de ${ano + 1}. En los libros, la apertura aparece como saldo inicial.</p></div>
        <div class="fijo">${confirmada ? `<span class="chip ok">Confirmada · ${esc(ap.comprobanteId)}</span>` : `<span class="chip aviso">${ap.estado === 'reversada' ? 'Reversada – borrador habilitado' : 'En borrador'}</span>`}</div>
      </div>
      ${!periodoAbierto(`${ano}-12`) ? `<div class="alerta aviso">El periodo ${ano}-12 no está habilitado o está cerrado. El administrador debe habilitarlo en Configuración y periodos antes de confirmar o reversar la apertura.</div>` : ''}
      ${confirmada ? `<div class="alerta ok">Apertura confirmada por ${esc(ap.confirmadaPor)} el ${esc(ap.confirmadaEn)}. El borrador queda bloqueado como evidencia. Correcciones: solo mediante reversión controlada (administrador).</div>` : ''}
      ${ap.estado === 'reversada' ? `<div class="alerta aviso">Apertura ${esc(ap.comprobanteAnulado)} reversada por ${esc(ap.reversadaPor)}: ${esc(ap.motivo)}</div>` : ''}
      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><small>Total débitos</small><b>${money(t.debito)}</b></div>
        <div class="kpi"><small>Total créditos</small><b>${money(t.credito)}</b></div>
        <div class="kpi"><small>Diferencia</small><b style="color:${cent(t.diferencia) ? 'var(--rojo)' : 'inherit'}">${money(t.diferencia)}</b></div>
        <div class="kpi"><small>Líneas / con error</small><b>${lineas.length} / ${nErr}</b></div>
      </div>
      <p class="tenue" style="margin-top:8px">Control: Activo ${money(A)} · Pasivo ${money(P)} · Patrimonio ${money(PT)} · A − (P + Pt) = <b>${money(A - P - PT)}</b> (clases 8 y 9 no intervienen).</p>
      ${repetidas.length ? `<div class="alerta aviso">Combinaciones cuenta/tercero/centro repetidas (verifique si son el mismo saldo): ${repetidas.slice(0, 6).map(([k, v]) => `${esc(k.replace(/\|/g, ' / '))} en filas ${v.join(', ')}`).join('; ')}</div>` : ''}
      <div class="acciones" style="margin-top:10px">
        ${editable ? `<button class="btn" id="add">+ Línea</button><button class="btn" id="imp">Importar Excel</button>
          <button class="btn" id="guardar" ${sucio ? '' : 'disabled'}>Guardar borrador</button>
          <button class="btn primario" id="confirmar" ${!lineas.length || cent(t.diferencia) || nErr || sucio ? 'disabled' : ''}>Confirmar apertura</button>` : ''}
        <button class="btn" id="exp">Exportar Excel / plantilla</button><button class="btn" id="pdf">Informe imprimible</button>
        ${confirmada && puede('admin') ? '<button class="btn peligro" id="rev">Reversar apertura</button>' : ''}
      </div>
      ${sucio ? '<p class="tenue" style="color:var(--rojo)">Hay cambios sin guardar.</p>' : ''}
    </div>
    <div class="tarjeta"><datalist id="dlCtas">${[...store.puc.values()].filter(c => c.movimiento && c.activa).map(c => `<option value="${c.codigo}">${esc(c.nombre)}</option>`).join('')}</datalist>
      <datalist id="dlTer">${[...store.terceros.values()].map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</datalist>
      <div class="tabla-cont"><table class="t lineas"><thead><tr><th>#</th><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th class="n">Débito</th><th class="n">Crédito</th><th>C. costo</th><th>Observaciones</th><th>Validación</th>${editable ? '<th></th>' : ''}</tr></thead>
      <tbody>${lineas.map((l, i) => `<tr class="${conErr[i].length ? 'error' : ''}" data-i="${i}"><td>${i + 1}</td>
        ${editable ? `<td><input data-f="cuenta" list="dlCtas" value="${esc(l.cuenta)}" style="width:110px"></td><td class="tenue">${esc(cuenta(l.cuenta)?.nombre || '')}</td>
          <td><input data-f="tercero" list="dlTer" value="${esc(l.tercero)}" style="width:140px"><div class="tenue">${esc(l.tercero ? nombreTercero(l.tercero) : '')}</div></td>
          <td><input data-f="debito" type="number" step="0.01" min="0" class="n" value="${cent(l.debito) ? l.debito : ''}" style="width:130px"></td>
          <td><input data-f="credito" type="number" step="0.01" min="0" class="n" value="${cent(l.credito) ? l.credito : ''}" style="width:130px"></td>
          <td><input data-f="centro" value="${esc(l.centro)}" style="width:90px"></td><td><input data-f="obs" value="${esc(l.obs)}"></td>`
        : `<td>${esc(l.cuenta)}</td><td>${esc(cuenta(l.cuenta)?.nombre || '')}</td><td>${esc(l.tercero ? l.tercero + ' ' + nombreTercero(l.tercero) : '')}</td>
          <td class="n">${cent(l.debito) ? money(l.debito) : ''}</td><td class="n">${cent(l.credito) ? money(l.credito) : ''}</td><td>${esc(l.centro)}</td><td>${esc(l.obs)}</td>`}
        <td>${conErr[i].length ? `<span style="color:var(--rojo)">${esc(conErr[i].join('; '))}</span>` : '<span class="chip ok">OK</span>'}</td>
        ${editable ? '<td><button class="btn-x" data-del>×</button></td>' : ''}</tr>`).join('') || `<tr><td colspan="10" class="tenue">Sin líneas. Agregue saldos manualmente o importe desde Excel.</td></tr>`}
      </tbody></table></div></div>`;

    // ---- edición en línea ----
    $$('tbody input[data-f]').forEach(inp => inp.onchange = () => {
      const i = Number(inp.closest('tr').dataset.i), f = inp.dataset.f;
      lineas[i][f] = ['debito', 'credito'].includes(f) ? num(inp.value) : inp.value.trim();
      sucio = true; dibujar();
    });
    $$('[data-del]').forEach(b => b.onclick = () => { lineas.splice(Number(b.closest('tr').dataset.i), 1); sucio = true; dibujar(); });
    if ($('#add')) $('#add').onclick = () => { lineas.push({ cuenta: '', tercero: '', debito: 0, credito: 0, centro: '', obs: '' }); sucio = true; dibujar(); };
    if ($('#guardar')) $('#guardar').onclick = guardar;
    if ($('#imp')) $('#imp').onclick = importar;
    if ($('#confirmar')) $('#confirmar').onclick = confirmarApertura;
    if ($('#rev')) $('#rev').onclick = reversarApertura;
    $('#exp').onclick = () => exportarExcel(`Saldos_iniciales_${fechaAp}.xlsx`, [{ nombre: 'Saldos iniciales', filas: [ENC,
      ...lineas.map(l => { const [ti, nu] = (l.tercero || '-').split('-'); return [l.cuenta, cuenta(l.cuenta)?.nombre || '', l.tercero ? ti : '', l.tercero ? nu : '', l.debito || 0, l.credito || 0, l.centro || '', l.obs || '']; })] }]);
    $('#pdf').onclick = () => imprimir(`Informe de saldos iniciales al ${fechaAp}`, `
      <p>Estado: ${confirmada ? 'CONFIRMADA – ' + esc(ap.comprobanteId) : 'BORRADOR (no confirmado)'}</p>
      <table><thead><tr><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th>C. costo</th><th class="n">Débito</th><th class="n">Crédito</th></tr></thead><tbody>
      ${[...lineas].sort((a, b) => String(a.cuenta).localeCompare(String(b.cuenta))).map(l => `<tr><td>${esc(l.cuenta)}</td><td>${esc(cuenta(l.cuenta)?.nombre || '')}</td><td>${esc(l.tercero ? l.tercero + ' ' + nombreTercero(l.tercero) : '')}</td><td>${esc(l.centro || '')}</td>
        <td class="n">${cent(l.debito) ? money(l.debito) : ''}</td><td class="n">${cent(l.credito) ? money(l.credito) : ''}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Totales (diferencia ${money(t.diferencia)})</td><td class="n">${money(t.debito)}</td><td class="n">${money(t.credito)}</td></tr></tbody></table>
      <div class="firmas"><div>Contador(a)<br>${esc(store.institucion.contador || '')}</div><div>Representante legal<br>${esc(store.institucion.repLegal || '')}</div><div>Revisor(a) fiscal<br>${esc(store.institucion.revisor || '')}</div></div>`, encabezadoInstitucional());
  }

  async function guardar() {
    const b0 = $('#guardar'); b0.disabled = true; b0.textContent = 'Guardando…';
    try {
      const existentes = (await getDocs(collection(db, 'aperturaBorrador'))).docs.map(d => d.id);
      const ops = [];
      const nuevos = lineas.map((l, i) => ({ id: `L${String(i + 1).padStart(5, '0')}`, datos: {
        orden: i + 1, cuenta: String(l.cuenta || ''), tercero: l.tercero || '', debito: num(l.debito) || 0, credito: num(l.credito) || 0,
        centro: l.centro || '', obs: l.obs || '', actualizadoPor: sesion.user.email } }));
      nuevos.forEach(n => ops.push(b => b.set(doc(db, 'aperturaBorrador', n.id), n.datos)));
      existentes.filter(id => !nuevos.some(n => n.id === id)).forEach(id => ops.push(b => b.delete(doc(db, 'aperturaBorrador', id))));
      for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach(o => o(b)); await b.commit(); }
      toast('Borrador guardado.'); await cargar();
    } catch (e) { toast(errorMsg(e), 'error'); dibujar(); }
  }

  async function importar() {
    const m = modal('Importar saldos iniciales', `<p>Columnas: <b>${ENC.join(', ')}</b>. El tercero se identifica con tipo (13, 31, …) y número sin DV.</p>
      <label class="chk"><input type="checkbox" id="reemp" checked> Reemplazar las líneas actuales del borrador</label>
      <input type="file" id="arch" accept=".xlsx,.xls,.csv"><div id="prev"></div>`,
      { ancho: '860px', botones: '<button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="ok" disabled>Cargar al borrador</button>' });
    let nuevas = [];
    $('#arch', m.el).onchange = async e => {
      try {
        const filas = await leerExcel(e.target.files[0]);
        const obs = []; nuevas = [];
        filas.forEach((f, k) => {
          const c = String(f.cuenta ?? '').replace(/\D/g, '');
          const d = num(f.debito), cr = num(f.credito);
          if (!c && !d && !cr) return;
          if (isNaN(d) || isNaN(cr)) return obs.push(`Fila ${k + 2}: valor no numérico.`);
          const ti = String(f.tercerotipoid ?? '').trim(), nu = String(f.terceronumero ?? '').replace(/[^0-9A-Za-z]/g, '');
          const tercero = nu ? `${ti || '13'}-${nu}` : '';
          if (tercero && !store.terceros.has(tercero)) obs.push(`Fila ${k + 2}: tercero ${tercero} no existe (créelo antes de confirmar).`);
          if (!cuenta(c)) obs.push(`Fila ${k + 2}: cuenta ${c} no existe en el PUC.`);
          nuevas.push({ cuenta: c, tercero, debito: d || 0, credito: cr || 0, centro: String(f.centrocosto ?? ''), obs: String(f.observaciones ?? '') });
        });
        const t = totales(nuevas);
        $('#prev', m.el).innerHTML = `<div class="alerta ${obs.length || cent(t.diferencia) ? 'aviso' : 'ok'}">${nuevas.length} líneas · Débitos ${money(t.debito)} · Créditos ${money(t.credito)} · Diferencia ${money(t.diferencia)}</div>
          ${obs.length ? `<pre class="json">${esc(obs.join('\n'))}</pre><p class="tenue">Se cargarán al borrador; las observaciones deben corregirse antes de confirmar.</p>` : ''}`;
        $('#ok', m.el).disabled = !nuevas.length;
      } catch (err) { toast('No se pudo leer el archivo: ' + errorMsg(err), 'error'); }
    };
    $('#ok', m.el).onclick = () => {
      lineas = $('#reemp', m.el).checked ? nuevas : [...lineas, ...nuevas];
      sucio = true; m.cerrar(); dibujar();
      toast('Líneas cargadas al borrador. Revise y pulse “Guardar borrador”.');
    };
  }

  async function confirmarApertura() {
    const comp = { tipo: 'AP', fecha: fechaAp, concepto: `Saldos iniciales al ${fechaAp} – asiento de apertura del ejercicio ${ano + 1}`,
      docRef: `APERTURA-${ano + 1}`, lineas: lineas.map(l => ({ cuenta: l.cuenta, tercero: l.tercero, debito: l.debito, credito: l.credito, centro: l.centro, detalle: l.obs })) };
    const errs = validar(comp, { permitirAP: true });
    if (comp.lineas.length > 1000) errs.push('La apertura supera 1.000 líneas; consolide saldos o solicite el ajuste de capacidad.');
    if (errs.length) return modal('No se puede confirmar', `<ul>${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`);
    const t = totales(comp.lineas);
    const ok = await confirmar('Confirmar apertura', `Se contabilizará el comprobante de apertura con ${comp.lineas.length} líneas por ${money(t.debito)}. El borrador quedará bloqueado. ¿Continuar?`, { textoBoton: 'Confirmar apertura' });
    if (!ok) return;
    try {
      const id = await crear(comp, {
        extraAuditoria: 'Confirmación de saldos iniciales',
        operacionesExtra: (tx, compId) => {
          const datos = { estado: 'confirmada', comprobanteId: compId, fecha: fechaAp, confirmadaPor: sesion.user.email, confirmadaEn: new Date().toLocaleString('es-CO') };
          const auditId = auditar(tx, { accion: 'confirmar apertura', coleccion: 'config', docIds: ['apertura'], antes: store.apertura, despues: datos });
          tx.set(doc(db, 'config', 'apertura'), { ...datos, auditId });
        }
      });
      toast(`Apertura confirmada: ${id}.`);
    } catch (e) { toast(errorMsg(e), 'error'); }
  }

  async function reversarApertura() {
    const ap = store.apertura;
    const motivo = await confirmar('Reversar apertura', `Se anulará el comprobante ${esc(ap.comprobanteId)} y el borrador volverá a ser editable para corregirlo y confirmarlo de nuevo (se generará un nuevo comprobante AP). Todo queda en la bitácora.`, { pedirMotivo: true, peligro: true, textoBoton: 'Reversar' });
    if (!motivo) return;
    try {
      const s = await getDoc(doc(db, 'comprobantes', ap.comprobanteId));
      if (!s.exists()) throw new Error('No se encontró el comprobante de apertura.');
      // Anulación del AP y cambio de estado de la apertura en una sola operación atómica
      const b = writeBatch(db);
      const anul = { estado: 'anulado', anuladoPor: sesion.user.email, anuladoEn: new Date().toISOString(), motivoAnulacion: `Reversión de apertura: ${motivo}` };
      const a1 = auditar(b, { accion: 'anular (reversión de apertura)', coleccion: 'comprobantes', docIds: [s.id], antes: { estado: 'contabilizado' }, despues: anul, detalle: motivo });
      b.set(doc(db, 'comprobantes', s.id), { ...s.data(), ...anul, auditId: a1 });
      const datos = { estado: 'reversada', comprobanteAnulado: ap.comprobanteId, reversadaPor: sesion.user.email, reversadaEn: new Date().toLocaleString('es-CO'), motivo };
      const a2 = auditar(b, { accion: 'reversar apertura', coleccion: 'config', docIds: ['apertura'], antes: ap, despues: datos, detalle: motivo });
      b.set(doc(db, 'config', 'apertura'), { ...datos, auditId: a2 });
      await b.commit();
      toast('Apertura reversada. Corrija el borrador y confírmela de nuevo.');
    } catch (e) { toast(errorMsg(e), 'error'); }
  }

  await cargar();
  return alCambiar(q => { if (q === 'config' && !sucio) cargar(); });
}
