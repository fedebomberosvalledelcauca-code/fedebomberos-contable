// =====================================================================
// Comprobantes contables
// =====================================================================
import { db, collection, query, where, orderBy, onSnapshot, subirSoporte, urlSoporte, getDoc, doc } from '../db.js';
import { store, cuenta, nombreTercero, periodoAbierto, encabezadoInstitucional } from '../store.js';
import { $, $$, esc, toast, errorMsg, modal, confirmar, money, num, hoy, exportarExcel, imprimir, fmtFechaHora, cent, campoEnlace, leerEnlace } from '../util.js';
import { TIPOS, validar, totales, crear, modificar, anular, reversar, adjuntarSoporte, posiblesDuplicados } from '../contable.js';
import { puede } from '../app.js';

export async function render(vista) {
  const registra = puede('admin', 'contador', 'auxiliar');
  const gestiona = puede('admin', 'contador');
  const ano = store.institucion.anoContable || new Date().getFullYear();
  let lista = [], desuscribir = null;

  vista.innerHTML = `
  <div class="tarjeta"><div class="fila">
    <label class="fijo">Desde<input type="date" id="fDesde" value="${ano}-01-01"></label>
    <label class="fijo">Hasta<input type="date" id="fHasta" value="${ano}-12-31"></label>
    <label class="fijo">Tipo<select id="fTipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${k} – ${v}</option>`).join('')}</select></label>
    <label class="fijo">Estado<select id="fEst"><option value="">Todos</option><option value="contabilizado">Contabilizados</option><option value="anulado">Anulados</option></select></label>
    <label>Buscar<input id="fTxt" placeholder="Número, tercero, concepto, documento"></label>
    <div class="acciones fijo">${registra ? '<button class="btn primario" id="nuevo">Nuevo comprobante</button>' : ''}<button class="btn" id="exp">Exportar Excel</button></div>
  </div></div>
  <div class="tarjeta"><div id="res" class="tenue"></div><div class="tabla-cont" style="margin-top:8px"><table class="t"><thead><tr>
    <th>Comprobante</th><th>Fecha</th><th>Tercero</th><th>Concepto</th><th>Doc. ref.</th><th class="n">Total</th><th>Estado</th><th>Sop.</th><th></th></tr></thead>
    <tbody id="cuerpo"></tbody></table></div></div>`;

  function suscribir() {
    if (desuscribir) desuscribir();
    const q = query(collection(db, 'comprobantes'), where('fecha', '>=', $('#fDesde').value || '2000-01-01'), where('fecha', '<=', $('#fHasta').value || '2999-12-31'), orderBy('fecha', 'desc'));
    desuscribir = onSnapshot(q, s => { lista = s.docs.map(d => ({ id: d.id, ...d.data() })); dibujar(); }, e => toast(errorMsg(e), 'error'));
  }
  function visibles() {
    const tipo = $('#fTipo').value, est = $('#fEst').value, t = $('#fTxt').value.toLowerCase();
    return lista.filter(c => (!tipo || c.tipo === tipo) && (!est || c.estado === est)
      && (!t || [c.id, c.concepto, c.docRef, nombreTercero(c.tercero), c.tercero].join(' ').toLowerCase().includes(t)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.tipo.localeCompare(b.tipo) || b.numero - a.numero);
  }
  function dibujar() {
    const v = visibles();
    const reversados = new Set(lista.filter(c => c.reversaDe && c.estado === 'contabilizado').map(c => c.reversaDe));
    const tot = v.filter(c => c.estado === 'contabilizado').reduce((a, c) => a + cent(c.totalDebito), 0) / 100;
    $('#res').textContent = `${v.length} comprobantes · total débitos contabilizados ${money(tot)}`;
    $('#cuerpo').innerHTML = v.map(c => `<tr class="${c.estado === 'anulado' ? 'anulado' : ''}"><td><b>${esc(c.id)}</b></td><td>${c.fecha}</td>
      <td>${esc(nombreTercero(c.tercero))}</td><td>${esc(c.concepto)}</td><td>${esc(c.docRef || '')}</td><td class="n">${money(c.totalDebito)}</td>
      <td><span class="chip ${c.estado === 'anulado' ? 'mal' : 'ok'}">${c.estado}</span>${reversados.has(c.id) ? ' <span class="chip aviso">reversado</span>' : ''}${c.reversaDe ? ` <span class="chip">rev. ${esc(c.reversaDe)}</span>` : ''}</td>
      <td>${(c.soportes || []).length || ''}</td><td><button class="btn chico" data-ver="${esc(c.id)}">Ver</button></td></tr>`).join('')
      || '<tr><td colspan="9" class="tenue">No hay comprobantes en el rango.</td></tr>';
    $$('[data-ver]').forEach(b => b.onclick = () => detalle(lista.find(c => c.id === b.dataset.ver)));
  }

  // ------------------------------------------------------------------
  function datalists() {
    return `<datalist id="dlCtas">${[...store.puc.values()].filter(c => c.movimiento && c.activa).sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map(c => `<option value="${c.codigo}">${esc(c.nombre)}</option>`).join('')}</datalist>
      <datalist id="dlTer">${[...store.terceros.values()].filter(t => t.activo).map(t => `<option value="${esc(t.id)}">${esc(t.nombre)}</option>`).join('')}</datalist>`;
  }

  function formulario(orig) {
    const edicion = !!orig;
    const c = orig || { tipo: 'CD', fecha: hoy(), tercero: '', docRef: '', concepto: '', centro: '', lineas: [{}, {}] };
    const m = modal(edicion ? `Modificar ${orig.id}` : 'Nuevo comprobante', `
      ${datalists()}
      <div class="rejilla">
        <label>Tipo<select id="cTipo" ${edicion ? 'disabled' : ''}>${Object.entries(TIPOS).filter(([k]) => k !== 'AP').map(([k, v]) => `<option value="${k}">${k} – ${v}</option>`).join('')}</select></label>
        <label>Fecha<input type="date" id="cFecha" value="${c.fecha}"></label>
        <label>Tercero (encabezado)<input id="cTer" list="dlTer" value="${esc(c.tercero)}" placeholder="tipo-número"></label>
        <label>Documento de referencia<input id="cDoc" value="${esc(c.docRef || '')}" placeholder="Factura, recibo, extracto…"></label>
        <label>Centro de costo / convenio<input id="cCen" value="${esc(c.centro || '')}"></label>
      </div>
      <label>Concepto<input id="cCon" value="${esc(c.concepto)}" maxlength="500"></label>
      <div id="nomTer" class="tenue"></div>
      <div class="tabla-cont" style="max-height:45vh"><table class="t lineas"><thead><tr><th style="width:120px">Cuenta</th><th>Nombre</th><th style="width:150px">Tercero</th><th>Detalle</th><th style="width:100px">C. costo</th><th class="n" style="width:130px">Débito</th><th class="n" style="width:130px">Crédito</th><th></th></tr></thead>
        <tbody id="lin"></tbody>
        <tfoot><tr class="tot"><td colspan="5"><button class="btn chico" id="addL" type="button">+ Línea</button> <button class="btn chico" id="ajustar" type="button" title="Lleva la diferencia a la última línea vacía">Cuadrar en línea nueva</button></td><td class="n" id="tD"></td><td class="n" id="tC"></td><td></td></tr></tfoot></table></div>
      <div id="dif"></div><div id="errs"></div>
      ${edicion ? '<label>Motivo de la modificación (obligatorio)<input id="cMot" maxlength="300"></label>' : `<div><b style="font-size:12.5px">Soporte (opcional) – enlace de Google Drive</b><div class="fila" style="margin-top:4px">${campoEnlace('cArch')}</div></div>`}`,
      { ancho: '1200px', botones: `<button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="cOk">${edicion ? 'Guardar cambios' : 'Contabilizar'}</button>` });
    $('#cTipo', m.el).value = c.tipo;

    const fila = l => `<tr>
      <td><input class="lc" list="dlCtas" value="${esc(l.cuenta || '')}"></td><td class="ln tenue">${esc(cuenta(l.cuenta)?.nombre || '')}</td>
      <td><input class="lt" list="dlTer" value="${esc(l.tercero || '')}"></td><td><input class="ld" value="${esc(l.detalle || '')}"></td>
      <td><input class="lcc" value="${esc(l.centro || '')}"></td>
      <td><input class="lD n" type="number" step="0.01" min="0" value="${cent(l.debito) ? l.debito : ''}"></td>
      <td><input class="lC n" type="number" step="0.01" min="0" value="${cent(l.credito) ? l.credito : ''}"></td>
      <td><button class="btn-x" type="button" data-del>×</button></td></tr>`;
    $('#lin', m.el).innerHTML = c.lineas.map(fila).join('');

    const leer = () => ({
      tipo: $('#cTipo', m.el).value, fecha: $('#cFecha', m.el).value, tercero: $('#cTer', m.el).value.trim(),
      docRef: $('#cDoc', m.el).value.trim(), centro: $('#cCen', m.el).value.trim(), concepto: $('#cCon', m.el).value.trim(),
      lineas: $$('#lin tr', m.el).map(tr => ({
        cuenta: $('.lc', tr).value.trim(), tercero: $('.lt', tr).value.trim(), detalle: $('.ld', tr).value,
        centro: $('.lcc', tr).value.trim(), debito: num($('.lD', tr).value), credito: num($('.lC', tr).value)
      })).filter(l => l.cuenta || l.debito || l.credito)
    });
    const recalcular = () => {
      const d = leer(); const t = totales(d.lineas);
      $('#tD', m.el).textContent = money(t.debito); $('#tC', m.el).textContent = money(t.credito);
      $('#dif', m.el).innerHTML = cent(t.diferencia) ? `<div class="alerta error">Diferencia: ${money(t.diferencia)} (${t.diferencia > 0 ? 'faltan créditos' : 'faltan débitos'})</div>` : (cent(t.debito) ? '<div class="alerta ok">Comprobante cuadrado.</div>' : '');
      $('#nomTer', m.el).textContent = d.tercero ? nombreTercero(d.tercero) : '';
      $$('#lin tr', m.el).forEach(tr => { $('.ln', tr).textContent = cuenta($('.lc', tr).value.trim())?.nombre || ''; });
    };
    $('#lin', m.el).addEventListener('input', recalcular);
    $('#lin', m.el).addEventListener('change', e => {
      // Al escribir la cuenta, si la línea no tiene tercero toma el del encabezado cuando la cuenta lo exige
      if (e.target.classList.contains('lc')) {
        const tr = e.target.closest('tr'); const ct = cuenta(e.target.value.trim());
        if (ct?.exigeTercero && !$('.lt', tr).value) $('.lt', tr).value = $('#cTer', m.el).value.trim();
        if (ct?.exigeCentro && !$('.lcc', tr).value) $('.lcc', tr).value = $('#cCen', m.el).value.trim();
      }
      recalcular();
    });
    $('#lin', m.el).addEventListener('click', e => { if (e.target.matches('[data-del]')) { e.target.closest('tr').remove(); recalcular(); } });
    $('#addL', m.el).onclick = () => { $('#lin', m.el).insertAdjacentHTML('beforeend', fila({})); };
    $('#ajustar', m.el).onclick = () => {
      const t = totales(leer().lineas); if (!cent(t.diferencia)) return;
      $('#lin', m.el).insertAdjacentHTML('beforeend', fila(t.diferencia > 0 ? { credito: t.diferencia } : { debito: -t.diferencia }));
      recalcular();
    };
    m.el.addEventListener('input', e => { if (['cTer', 'cFecha'].includes(e.target.id)) recalcular(); });
    recalcular();

    $('#cOk', m.el).onclick = async () => {
      const d = leer();
      const errs = validar(d);
      if (edicion && !periodoAbierto(orig.periodo)) errs.push(`El periodo original ${orig.periodo} está cerrado.`);
      const motivo = edicion ? $('#cMot', m.el).value.trim() : '';
      if (edicion && motivo.length < 10) errs.push('Escriba el motivo de la modificación (mínimo 10 caracteres).');
      $('#errs', m.el).innerHTML = errs.length ? `<div class="alerta error"><b>No se puede guardar:</b><ul>${errs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
      if (errs.length) return;
      const dups = await posiblesDuplicados(d.docRef, orig?.id).catch(() => []);
      if (dups.length && !confirm(`Ya existe(n) ${dups.map(x => x.id).join(', ')} con el documento de referencia “${d.docRef}”. ¿Registrar de todas formas?`)) return;
      const b = $('#cOk', m.el); b.disabled = true; b.textContent = 'Guardando…';
      try {
        if (edicion) { await modificar(orig, d, motivo); toast(`${orig.id} modificado.`); m.cerrar(); return; }
        const id = await crear(d);
        const archivos = [leerEnlace('cArch', m.el)].filter(Boolean);
        for (const a of archivos) {
          try {
            const meta = await subirSoporte('comprobantes', id, a);
            const sv = await getDoc(doc(db, 'comprobantes', id));   // versión vigente en el servidor
            await adjuntarSoporte({ id, ...sv.data() }, meta);
          } catch (err) { toast(`${id} quedó contabilizado, pero falló el soporte ${a.name}: ${errorMsg(err)}`, 'error'); }
        }
        toast(`Comprobante ${id} contabilizado.`); m.cerrar();
      } catch (err) { toast(errorMsg(err), 'error'); b.disabled = false; b.textContent = edicion ? 'Guardar cambios' : 'Contabilizar'; }
    };
  }

  // ------------------------------------------------------------------
  function tablaLineas(c) {
    return `<table class="t"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th>Detalle</th><th>C. costo</th><th class="n">Débito</th><th class="n">Crédito</th></tr></thead><tbody>
      ${c.lineas.map(l => `<tr><td>${esc(l.cuenta)}</td><td>${esc(l.nombreCuenta || cuenta(l.cuenta)?.nombre || '')}</td><td>${esc(l.tercero ? l.tercero + ' ' + nombreTercero(l.tercero) : '')}</td>
        <td>${esc(l.detalle)}</td><td>${esc(l.centro)}</td><td class="n">${cent(l.debito) ? money(l.debito) : ''}</td><td class="n">${cent(l.credito) ? money(l.credito) : ''}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Totales</td><td class="n">${money(c.totalDebito)}</td><td class="n">${money(c.totalCredito)}</td></tr></tbody></table>`;
  }

  function detalle(c) {
    const abierto = periodoAbierto(c.periodo);
    const vivo = c.estado === 'contabilizado';
    const m = modal(`${c.id} · ${TIPOS[c.tipo]}`, `
      <div class="rejilla">
        <div><small class="tenue">Fecha</small><div>${c.fecha}</div></div>
        <div><small class="tenue">Tercero</small><div>${esc(c.tercero ? c.tercero + ' ' + nombreTercero(c.tercero) : '—')}</div></div>
        <div><small class="tenue">Documento de referencia</small><div>${esc(c.docRef || '—')}</div></div>
        <div><small class="tenue">Estado</small><div><span class="chip ${vivo ? 'ok' : 'mal'}">${c.estado}</span>${!abierto ? ' <span class="chip mal">periodo cerrado</span>' : ''}</div></div>
      </div>
      <div><small class="tenue">Concepto</small><div>${esc(c.concepto)}</div></div>
      ${c.motivoAnulacion ? `<div class="alerta error">Anulado por ${esc(c.anuladoPor)} el ${esc(c.anuladoEn?.slice(0, 10))}: ${esc(c.motivoAnulacion)}</div>` : ''}
      ${c.motivoModificacion ? `<div class="alerta aviso">Modificado por ${esc(c.modificadoPor)}: ${esc(c.motivoModificacion)}</div>` : ''}
      ${tablaLineas(c)}
      <div><b style="font-size:12.5px">Soportes</b><ul>${(c.soportes || []).map((s, k) => `<li><a href="#" data-sop="${k}">${esc(s.nombre)}</a> <span class="tenue">${esc(s.subidoPor)} ${esc(s.fecha?.slice(0, 10))}</span></li>`).join('') || '<li class="tenue">Sin soportes</li>'}</ul>
        ${registra && vivo && abierto ? `<div class="fila">${campoEnlace('dArch')}<button class="btn fijo" id="dSubir">Registrar enlace</button></div>` : ''}</div>
      <p class="tenue">Registrado por ${esc(c.creadoPorEmail || c.creadoPor)} · ${fmtFechaHora(c.creadoEn)}</p>`,
      { ancho: '1100px', botones: `<button class="btn" id="dImp">Imprimir / PDF</button>
        ${gestiona && vivo && abierto && c.tipo !== 'AP' ? '<button class="btn" id="dEd">Modificar</button><button class="btn peligro" id="dAn">Anular</button>' : ''}
        ${gestiona && vivo && c.tipo !== 'AP' ? '<button class="btn" id="dRev">Reversar</button>' : ''}
        <button class="btn" data-cerrar>Cerrar</button>` });

    $$('[data-sop]', m.el).forEach(a => a.onclick = async e => {
      e.preventDefault();
      try { window.open(await urlSoporte(c.soportes[Number(a.dataset.sop)].ruta), '_blank'); } catch (err) { toast(errorMsg(err), 'error'); }
    });
    const ds = $('#dSubir', m.el);
    if (ds) ds.onclick = async () => {
      const a = leerEnlace('dArch', m.el); if (!a) return toast('Pegue el enlace de Google Drive del soporte.', 'error');
      ds.disabled = true;
      try { await adjuntarSoporte(c, await subirSoporte('comprobantes', c.id, a)); toast('Soporte adjuntado.'); m.cerrar(); }
      catch (err) { toast(errorMsg(err), 'error'); ds.disabled = false; }
    };
    $('#dImp', m.el).onclick = () => {
      const i = store.institucion;
      imprimir(`${TIPOS[c.tipo]} ${c.id}`, `
        <p><b>Fecha:</b> ${c.fecha} &nbsp; <b>Tercero:</b> ${esc(c.tercero ? c.tercero + ' ' + nombreTercero(c.tercero) : '—')} &nbsp; <b>Doc. ref.:</b> ${esc(c.docRef || '—')}</p>
        <p><b>Concepto:</b> ${esc(c.concepto)}</p>${c.estado === 'anulado' ? '<h2 style="color:#b3261e">ANULADO</h2>' : ''}${tablaLineas(c)}
        <div class="firmas"><div>Elaboró<br>${esc(c.creadoPorEmail || '')}</div><div>Revisó</div><div>Aprobó<br>${esc(i.repLegal || '')}</div></div>`, encabezadoInstitucional());
    };
    if ($('#dEd', m.el)) $('#dEd', m.el).onclick = () => { m.cerrar(); formulario(c); };
    if ($('#dAn', m.el)) $('#dAn', m.el).onclick = async () => {
      const motivo = await confirmar(`Anular ${c.id}`, 'El comprobante quedará visible como ANULADO y dejará de afectar saldos. Esta acción no se puede deshacer.', { pedirMotivo: true, peligro: true, textoBoton: 'Anular' });
      if (!motivo) return;
      try { await anular(c, motivo); toast(`${c.id} anulado.`); m.cerrar(); } catch (err) { toast(errorMsg(err), 'error'); }
    };
    if ($('#dRev', m.el)) $('#dRev', m.el).onclick = async () => {
      const f = prompt('Fecha de la reversión (AAAA-MM-DD). Debe estar en un periodo abierto:', hoy());
      if (!f) return;
      if (!periodoAbierto(f.slice(0, 7))) return toast(`El periodo ${f.slice(0, 7)} no está abierto.`, 'error');
      const motivo = await confirmar(`Reversar ${c.id}`, `Se creará un comprobante de ajuste (AJ) con fecha ${esc(f)} que invierte todas las partidas. El original no se modifica.`, { pedirMotivo: true });
      if (!motivo) return;
      try { const id = await reversar(c, f, motivo); toast(`Reversión registrada: ${id}.`); m.cerrar(); } catch (err) { toast(errorMsg(err), 'error'); }
    };
  }

  // ------------------------------------------------------------------
  $('#fDesde').onchange = suscribir; $('#fHasta').onchange = suscribir;
  $('#fTipo').onchange = dibujar; $('#fEst').onchange = dibujar; $('#fTxt').oninput = dibujar;
  if (registra) $('#nuevo').onclick = () => {
    if (!store.puc.size) return toast('Primero cargue el plan de cuentas.', 'error');
    formulario(null);
  };
  $('#exp').onclick = () => {
    const filas = [['Comprobante', 'Tipo', 'Número', 'Fecha', 'Estado', 'Tercero encabezado', 'Concepto', 'Doc. ref.', 'Cuenta', 'Nombre cuenta', 'Tercero línea', 'Nombre tercero', 'Detalle', 'C. costo', 'Débito', 'Crédito']];
    visibles().forEach(c => c.lineas.forEach(l => filas.push([c.id, c.tipo, c.numero, c.fecha, c.estado, c.tercero, c.concepto, c.docRef, l.cuenta, l.nombreCuenta, l.tercero, nombreTercero(l.tercero), l.detalle, l.centro, l.debito, l.credito])));
    exportarExcel(`Comprobantes_${$('#fDesde').value}_${$('#fHasta').value}.xlsx`, [{ nombre: 'Comprobantes', filas }]);
  };
  suscribir();
  return () => desuscribir && desuscribir();
}
