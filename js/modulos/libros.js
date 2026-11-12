// =====================================================================
// Libros oficiales e informes de saldos:
// diario, mayor y balances, auxiliar, balance de prueba / comprobación
// =====================================================================
import { store, cuenta, nombreTercero, comprobantesEntre, encabezadoInstitucional } from '../store.js';
import { $, $$, esc, toast, errorMsg, money, cent, exportarExcel, imprimir, nivelCuenta, LONG_NIVEL, hoy } from '../util.js';
import { acumular, naturaleza, saldoNatural, TIPOS } from '../contable.js';

const nombre = k => cuenta(k)?.nombre || '(sin nombre en el PUC)';
const m$ = c => money(c / 100);   // centavos → texto
const celdaSaldo = c => `<td class="n ${c < 0 ? 'neg' : ''}">${m$(c)}</td>`;

export async function render(vista) {
  const ano = store.institucion.anoContable || new Date().getFullYear();
  const hastaDef = hoy() < `${ano}-12-31` ? hoy() : `${ano}-12-31`;
  let pestana = 'balance';
  let ultimo = null;   // { titulo, filas (para Excel), html (para imprimir) }

  vista.innerHTML = `
  <div class="tarjeta">
    <div class="pestanas">${[['balance', 'Balance de prueba'], ['mayor', 'Libro mayor y balances'], ['auxiliar', 'Libro auxiliar'], ['diario', 'Libro diario']]
      .map(([k, t]) => `<button data-p="${k}" class="${k === pestana ? 'activo' : ''}">${t}</button>`).join('')}</div>
    <div class="fila" style="margin-top:12px">
      <label class="fijo">Desde<input type="date" id="lDesde" value="${ano}-01-01"></label>
      <label class="fijo">Hasta<input type="date" id="lHasta" value="${hastaDef}"></label>
      <label class="fijo" data-solo="balance mayor">Nivel<select id="lNivel">${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} (${LONG_NIVEL[n]} díg.)</option>`).join('')}</select></label>
      <label class="fijo" data-solo="balance"><span>&nbsp;</span><span class="chk"><input type="checkbox" id="lTer"> Detallar por tercero (comprobación)</span></label>
      <label class="fijo" data-solo="balance mayor"><span>&nbsp;</span><span class="chk"><input type="checkbox" id="lCero"> Incluir cuentas en cero</span></label>
      <label data-solo="auxiliar">Cuenta (o prefijo)<input id="lCta" list="dlTodas" placeholder="Ej. 1110 o 11100501"></label>
      <label data-solo="auxiliar">Tercero (opcional)<input id="lTerc" list="dlTer2" placeholder="tipo-número"></label>
      <label class="fijo" data-solo="diario"><span>&nbsp;</span><span class="chk"><input type="checkbox" id="lRes"> Resumido por comprobante</span></label>
      <div class="acciones fijo"><button class="btn primario" id="lGen">Generar</button><button class="btn" id="lXls" disabled>Excel</button><button class="btn" id="lPdf" disabled>Imprimir / PDF</button></div>
    </div>
    <datalist id="dlTodas">${[...store.puc.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(c => `<option value="${c.codigo}">${esc(c.nombre)}</option>`).join('')}</datalist>
    <datalist id="dlTer2">${[...store.terceros.values()].map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join('')}</datalist>
    <p class="tenue">Solo comprobantes contabilizados (los anulados no afectan saldos). El asiento de apertura se presenta como saldo inicial cuando “Desde” es posterior a su fecha. Saldos en el sentido de la naturaleza de cada cuenta; en rojo, saldos contrarios a su naturaleza.</p>
  </div>
  <div class="tarjeta" id="lRes0"><div class="tenue">Seleccione los parámetros y pulse “Generar”.</div></div>`;

  const mostrarFiltros = () => $$('[data-solo]').forEach(el => { el.style.display = el.dataset.solo.split(' ').includes(pestana) ? '' : 'none'; });
  mostrarFiltros();
  $$('[data-p]').forEach(b => b.onclick = () => {
    pestana = b.dataset.p; $$('[data-p]').forEach(x => x.classList.toggle('activo', x === b)); mostrarFiltros();
    $('#lRes0').innerHTML = '<div class="tenue">Pulse “Generar”.</div>'; ultimo = null; $('#lXls').disabled = $('#lPdf').disabled = true;
  });

  $('#lGen').onclick = async () => {
    const desde = $('#lDesde').value, hasta = $('#lHasta').value;
    if (!desde || !hasta || desde > hasta) return toast('Rango de fechas inválido.', 'error');
    $('#lRes0').innerHTML = '<div class="cargando">Calculando…</div>';
    try {
      const comps = await comprobantesEntre('2000-01-01', hasta);
      ultimo = ({ balance, mayor, auxiliar, diario })[pestana](comps, desde, hasta);
      if (!ultimo) return;
      $('#lRes0').innerHTML = `<h3>${esc(ultimo.titulo)}</h3>${ultimo.alertas || ''}<div class="tabla-cont">${ultimo.html}</div>`;
      $('#lXls').disabled = $('#lPdf').disabled = false;
    } catch (e) { $('#lRes0').innerHTML = `<div class="alerta error">${esc(errorMsg(e))}</div>`; }
  };
  $('#lXls').onclick = () => ultimo && exportarExcel(`${ultimo.titulo.replace(/[^\w]+/g, '_')}.xlsx`, [{ nombre: ultimo.hoja, filas: ultimo.filas }]);
  $('#lPdf').onclick = () => ultimo && imprimir(ultimo.titulo, ultimo.alertas + ultimo.html.replace(/class="t[^"]*"/g, ''), encabezadoInstitucional());

  // ------------------------------------------------------------------
  // BALANCE DE PRUEBA / COMPROBACIÓN
  function balance(comps, desde, hasta) {
    const nivel = Number($('#lNivel').value), porTer = $('#lTer').checked, ceros = $('#lCero').checked;
    const acc = acumular(comps, desde, hasta, { porTercero: porTer });
    // Cuentas hasta el nivel elegido; con "por tercero", también el detalle por tercero de cada cuenta auxiliar visible
    const visibles = [...acc.keys()].filter(k => nivelCuenta(k.split('|')[0]) <= nivel);
    visibles.sort((a, b) => { const [ca, ta = ''] = a.split('|'), [cb, tb = ''] = b.split('|'); return ca.localeCompare(cb) || (a.includes('|') - b.includes('|')) || ta.localeCompare(tb); });

    const filas = [['Código', 'Nombre', 'Tercero', 'Nombre tercero', 'Nivel', 'Saldo inicial', 'Débitos', 'Créditos', 'Saldo final']];
    let html = `<table class="t"><thead><tr><th>Código</th><th>Nombre</th><th class="n">Saldo inicial</th><th class="n">Débitos</th><th class="n">Créditos</th><th class="n">Saldo final</th></tr></thead><tbody>`;
    const tot = { siD: 0, siC: 0, d: 0, c: 0 };
    for (const k of visibles) {
      const [c, t] = k.split('|'); const x = acc.get(k);
      const si = saldoNatural(c, x.siD, x.siC), sf = saldoNatural(c, x.siD + x.d, x.siC + x.c);
      if (!ceros && !si && !x.d && !x.c && !sf) continue;
      if (c.length === 1 && t === undefined) { tot.siD += x.siD; tot.siC += x.siC; tot.d += x.d; tot.c += x.c; }
      const niv = nivelCuenta(c);
      if (t !== undefined) {
        html += `<tr><td></td><td class="tenue" style="padding-left:${niv * 12 + 14}px">↳ ${esc(t ? t + ' ' + nombreTercero(t) : 'Sin tercero')}</td><td class="n">${m$(si)}</td><td class="n">${m$(x.d)}</td><td class="n">${m$(x.c)}</td>${celdaSaldo(sf)}</tr>`;
        filas.push([c, nombre(c), t, nombreTercero(t), niv, si / 100, x.d / 100, x.c / 100, sf / 100]);
      } else {
        html += `<tr class="nivel${Math.min(niv, 3)}"><td>${c}</td><td style="padding-left:${(niv - 1) * 12 + 8}px">${esc(nombre(c))}</td><td class="n">${m$(si)}</td><td class="n">${m$(x.d)}</td><td class="n">${m$(x.c)}</td>${celdaSaldo(sf)}</tr>`;
        filas.push([c, nombre(c), '', '', niv, si / 100, x.d / 100, x.c / 100, sf / 100]);
      }
    }
    html += `<tr class="tot"><td colspan="3">Sumas del periodo</td><td class="n">${m$(tot.d)}</td><td class="n">${m$(tot.c)}</td><td></td></tr></tbody></table>`;
    filas.push(['', 'SUMAS DEL PERIODO', '', '', '', '', tot.d / 100, tot.c / 100, '']);
    const okMov = tot.d === tot.c, okSi = tot.siD === tot.siC;
    const sf = (tot.siD + tot.d) - (tot.siC + tot.c);
    const alertas = `<div class="${okMov && okSi && !sf ? 'alerta ok' : 'alerta error'}" style="margin-bottom:8px">
      Control 1 – Débitos = Créditos del periodo: ${okMov ? 'cumple' : 'NO cumple (diferencia ' + m$(tot.d - tot.c) + ')'} ·
      Control 2 – Saldos iniciales cuadrados: ${okSi ? 'cumple' : 'NO cumple (diferencia ' + m$(tot.siD - tot.siC) + ')'} ·
      Control 3 – Saldos finales cuadrados: ${!sf ? 'cumple' : 'NO cumple (diferencia ' + m$(sf) + ')'}</div>
      ${!store.apertura?.estado || store.apertura.estado !== 'confirmada' ? '<div class="alerta aviso" style="margin-bottom:8px">La apertura no está confirmada: los saldos iniciales pueden estar incompletos.</div>' : ''}`;
    return { titulo: `Balance de ${porTer ? 'comprobación' : 'prueba'} ${desde} a ${hasta} (nivel ${nivel})`, hoja: 'Balance', html, filas, alertas };
  }

  // ------------------------------------------------------------------
  // LIBRO MAYOR Y BALANCES (cuentas de un nivel, con saldo anterior, movimiento y nuevo saldo)
  function mayor(comps, desde, hasta) {
    const nivel = Number($('#lNivel').value), ceros = $('#lCero').checked, largo = LONG_NIVEL[nivel];
    const acc = acumular(comps, desde, hasta);
    // Cuentas del nivel exacto + cuentas auxiliares más cortas sin subcuentas a ese nivel
    const claves = [...acc.keys()].filter(c => c.length === largo || (c.length < largo && cuenta(c)?.movimiento)).sort();
    const filas = [['Código', 'Nombre', 'Saldo anterior', 'Débitos', 'Créditos', 'Nuevo saldo']];
    let html = `<table class="t"><thead><tr><th>Código</th><th>Nombre</th><th class="n">Saldo anterior</th><th class="n">Débitos</th><th class="n">Créditos</th><th class="n">Nuevo saldo</th></tr></thead><tbody>`;
    let tD = 0, tC = 0;
    for (const c of claves) {
      const x = acc.get(c); const si = saldoNatural(c, x.siD, x.siC), sf = saldoNatural(c, x.siD + x.d, x.siC + x.c);
      if (!ceros && !si && !x.d && !x.c) continue;
      tD += x.d; tC += x.c;
      html += `<tr><td>${c}</td><td>${esc(nombre(c))}</td><td class="n">${m$(si)}</td><td class="n">${m$(x.d)}</td><td class="n">${m$(x.c)}</td>${celdaSaldo(sf)}</tr>`;
      filas.push([c, nombre(c), si / 100, x.d / 100, x.c / 100, sf / 100]);
    }
    html += `<tr class="tot"><td colspan="3">Totales</td><td class="n">${m$(tD)}</td><td class="n">${m$(tC)}</td><td></td></tr></tbody></table>`;
    return { titulo: `Libro mayor y balances ${desde} a ${hasta}`, hoja: 'Mayor', html, filas,
      alertas: tD === tC ? '' : `<div class="alerta error">Débitos y créditos no coinciden: diferencia ${m$(tD - tC)}</div>` };
  }

  // ------------------------------------------------------------------
  // LIBRO AUXILIAR (por cuenta auxiliar, con saldo acumulado)
  function auxiliar(comps, desde, hasta) {
    const pref = $('#lCta').value.trim(), ter = $('#lTerc').value.trim();
    if (!pref) { toast('Indique una cuenta o prefijo.', 'error'); $('#lRes0').innerHTML = ''; return null; }
    const porCuenta = new Map();
    for (const comp of comps) {
      if (comp.estado !== 'contabilizado') continue;
      comp.lineas.forEach(l => {
        if (!l.cuenta.startsWith(pref) || (ter && l.tercero !== ter)) return;
        if (!porCuenta.has(l.cuenta)) porCuenta.set(l.cuenta, { siD: 0, siC: 0, mov: [] });
        const x = porCuenta.get(l.cuenta);
        if (comp.fecha < desde) { x.siD += cent(l.debito); x.siC += cent(l.credito); }
        else x.mov.push({ comp, l });
      });
    }
    const filas = [['Cuenta', 'Nombre cuenta', 'Fecha', 'Comprobante', 'Tercero', 'Nombre tercero', 'Concepto / detalle', 'Doc. ref.', 'Débito', 'Crédito', 'Saldo']];
    let html = '';
    const cuentas = [...porCuenta.keys()].sort();
    for (const c of cuentas) {
      const x = porCuenta.get(c); let saldo = saldoNatural(c, x.siD, x.siC); let tD = 0, tC = 0;
      html += `<h3 style="margin-top:14px">${c} – ${esc(nombre(c))} <span class="chip">${naturaleza(c) === 'D' ? 'Débito' : 'Crédito'}</span></h3>
        <table class="t"><thead><tr><th>Fecha</th><th>Comprobante</th><th>Tercero</th><th>Concepto / detalle</th><th>Doc. ref.</th><th class="n">Débito</th><th class="n">Crédito</th><th class="n">Saldo</th></tr></thead><tbody>
        <tr class="tot"><td colspan="7">Saldo inicial</td>${celdaSaldo(saldo)}</tr>`;
      filas.push([c, nombre(c), '', 'SALDO INICIAL', '', '', '', '', '', '', saldo / 100]);
      for (const { comp, l } of x.mov) {
        const d = cent(l.debito), cr = cent(l.credito);
        saldo += naturaleza(c) === 'D' ? d - cr : cr - d; tD += d; tC += cr;
        const txt = [comp.concepto, l.detalle].filter(Boolean).join(' · ');
        html += `<tr><td>${comp.fecha}</td><td>${esc(comp.id)}</td><td>${esc(l.tercero ? l.tercero + ' ' + nombreTercero(l.tercero) : '')}</td><td>${esc(txt)}</td><td>${esc(comp.docRef || '')}</td>
          <td class="n">${d ? m$(d) : ''}</td><td class="n">${cr ? m$(cr) : ''}</td>${celdaSaldo(saldo)}</tr>`;
        filas.push([c, nombre(c), comp.fecha, comp.id, l.tercero, nombreTercero(l.tercero), txt, comp.docRef || '', d / 100, cr / 100, saldo / 100]);
      }
      html += `<tr class="tot"><td colspan="5">Totales y saldo final</td><td class="n">${m$(tD)}</td><td class="n">${m$(tC)}</td>${celdaSaldo(saldo)}</tr></tbody></table>`;
    }
    if (!cuentas.length) html = '<p class="tenue">Sin movimientos para los filtros indicados.</p>';
    return { titulo: `Libro auxiliar ${pref}${ter ? ' · ' + ter : ''} ${desde} a ${hasta}`, hoja: 'Auxiliar', html: `<div style="padding:8px">${html}</div>`, filas, alertas: '' };
  }

  // ------------------------------------------------------------------
  // LIBRO DIARIO
  function diario(comps, desde, hasta) {
    const resumido = $('#lRes').checked;
    const enRango = comps.filter(c => c.fecha >= desde && c.fecha <= hasta);
    let tD = 0, tC = 0;
    const filas = [resumido ? ['Fecha', 'Comprobante', 'Tipo', 'Tercero', 'Concepto', 'Débitos', 'Créditos']
      : ['Fecha', 'Comprobante', 'Cuenta', 'Nombre cuenta', 'Tercero', 'Detalle', 'Débito', 'Crédito']];
    let html = `<table class="t"><thead><tr>${filas[0].map((h, i) => `<th class="${i >= filas[0].length - 2 ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>`;
    for (const c of enRango) {
      if (resumido) {
        tD += cent(c.totalDebito); tC += cent(c.totalCredito);
        html += `<tr><td>${c.fecha}</td><td>${esc(c.id)}</td><td>${esc(TIPOS[c.tipo])}</td><td>${esc(nombreTercero(c.tercero))}</td><td>${esc(c.concepto)}</td><td class="n">${money(c.totalDebito)}</td><td class="n">${money(c.totalCredito)}</td></tr>`;
        filas.push([c.fecha, c.id, TIPOS[c.tipo], nombreTercero(c.tercero), c.concepto, c.totalDebito, c.totalCredito]);
      } else {
        html += `<tr class="nivel2"><td>${c.fecha}</td><td>${esc(c.id)}</td><td colspan="6">${esc(c.concepto)}</td></tr>`;
        c.lineas.forEach(l => {
          tD += cent(l.debito); tC += cent(l.credito);
          html += `<tr><td></td><td></td><td>${esc(l.cuenta)}</td><td>${esc(l.nombreCuenta || nombre(l.cuenta))}</td><td>${esc(l.tercero ? nombreTercero(l.tercero) : '')}</td><td>${esc(l.detalle)}</td>
            <td class="n">${cent(l.debito) ? money(l.debito) : ''}</td><td class="n">${cent(l.credito) ? money(l.credito) : ''}</td></tr>`;
          filas.push([c.fecha, c.id, l.cuenta, l.nombreCuenta || nombre(l.cuenta), l.tercero, l.detalle, l.debito, l.credito]);
        });
      }
    }
    const span = resumido ? 5 : 6;
    html += `<tr class="tot"><td colspan="${span}">Totales (${enRango.length} comprobantes)</td><td class="n">${m$(tD)}</td><td class="n">${m$(tC)}</td></tr></tbody></table>`;
    return { titulo: `Libro diario ${desde} a ${hasta}`, hoja: 'Diario', html, filas,
      alertas: tD === tC ? '' : `<div class="alerta error">Débitos y créditos del diario no coinciden: ${m$(tD - tC)}</div>` };
  }
}
