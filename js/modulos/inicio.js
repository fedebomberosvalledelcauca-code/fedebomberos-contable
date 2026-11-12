// =====================================================================
// Panel principal (indicadores calculados desde los comprobantes contabilizados)
// =====================================================================
import { store, comprobantesEntre } from '../store.js';
import { $, esc, money, cent, hoy, errorMsg } from '../util.js';
import { acumular, saldoNatural } from '../contable.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export async function render(vista) {
  const ano = store.institucion.anoContable || new Date().getFullYear();
  const pasos = [
    ['Configuración institucional guardada', !!store.institucion.razonSocial, '#configuracion'],
    [`Periodos ${ano - 1}-12 y ${ano} habilitados`, store.periodos.has(`${ano - 1}-12`) && store.periodos.has(`${ano}-01`), '#configuracion'],
    ['Plan de cuentas cargado', store.puc.size > 0, '#puc'],
    ['Terceros registrados', store.terceros.size > 0, '#terceros'],
    [`Saldos iniciales al ${ano - 1}-12-31 confirmados`, store.apertura?.estado === 'confirmada', '#apertura']
  ];
  const resp = store.institucion.responsabilidades || {};
  const iva = ['48', '49', '09'].filter(c => !resp[c]?.verificada);

  vista.innerHTML = `
  ${pasos.some(p => !p[1]) ? `<div class="tarjeta"><h3>Puesta en marcha</h3><table class="t"><tbody>${pasos.map(([t, ok, h]) =>
    `<tr><td><span class="chip ${ok ? 'ok' : 'mal'}">${ok ? 'Listo' : 'Pendiente'}</span></td><td><a href="${h}">${esc(t)}</a></td></tr>`).join('')}</tbody></table></div>` : ''}
  ${iva.length ? `<div class="alerta aviso">Verificación tributaria pendiente: responsabilidades ${iva.join(', ')} (IVA / ReteIVA) no confirmadas.</div>` : ''}
  <div class="fila"><label class="fijo">Corte<input type="date" id="iCorte" value="${hoy() < `${ano}-12-31` ? hoy() : `${ano}-12-31`}"></label></div>
  <div id="iKpis" class="cargando">Calculando indicadores…</div>`;

  async function calcular() {
    const hasta = $('#iCorte').value, desde = `${ano}-01-01`;
    try {
      const comps = await comprobantesEntre('2000-01-01', hasta);
      const acc = acumular(comps, desde, hasta);
      const fin = c => { const x = acc.get(c); return x ? saldoNatural(c, x.siD + x.d, x.siC + x.c) : 0; };
      const mov = c => { const x = acc.get(c); return x ? saldoNatural(c, x.d, x.c) : 0; };
      const ingresos = mov('4'), gastos = mov('5') + mov('6') + mov('7');
      const activo = fin('1'), pasivo = fin('2'), patrimonio = fin('3');
      const mensual = MESES.map(() => ({ i: 0, g: 0 }));
      comps.filter(c => c.fecha >= desde && c.tipo !== 'AP').forEach(c => c.lineas.forEach(l => {
        const m = Number(c.fecha.slice(5, 7)) - 1, k = l.cuenta[0];
        if (k === '4') mensual[m].i += cent(l.credito) - cent(l.debito);
        if (['5', '6', '7'].includes(k)) mensual[m].g += cent(l.debito) - cent(l.credito);
      }));
      const max = Math.max(1, ...mensual.flatMap(x => [x.i, x.g]));
      const cuadre = activo - pasivo - patrimonio - (ingresos - gastos);
      const n = comps.filter(c => c.fecha >= desde).length;
      $('#iKpis').className = '';
      $('#iKpis').innerHTML = `
      <div class="kpis">
        ${[['Ingresos del año', ingresos], ['Gastos y costos del año', gastos], ['Resultado del ejercicio', ingresos - gastos], ['Activo', activo], ['Pasivo', pasivo], ['Patrimonio (sin resultado)', patrimonio], ['Disponible (11)', fin('11')], ['Deudores (13)', fin('13')]]
          .map(([t, v]) => `<div class="kpi"><small>${t}</small><b style="color:${v < 0 ? 'var(--rojo)' : 'inherit'}">${money(v / 100)}</b></div>`).join('')}
      </div>
      <div class="alerta ${cuadre ? 'error' : 'ok'}" style="margin-top:12px">Ecuación contable al ${hasta}: Activo − Pasivo − Patrimonio − Resultado = ${money(cuadre / 100)} ${cuadre ? '→ revisar balance de prueba' : '(cuadra)'} · ${n} comprobantes contabilizados en ${ano}.</div>
      <div class="tarjeta" style="margin-top:12px"><h3>Ingresos y gastos por mes</h3>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:6px;align-items:end;height:180px">
          ${mensual.map((x, k) => `<div style="display:flex;gap:2px;align-items:end;height:100%" title="${MESES[k]}: ingresos ${money(x.i / 100)} · gastos ${money(x.g / 100)}">
            <div style="flex:1;background:#2d5f8a;height:${Math.max(0, x.i) / max * 100}%"></div><div style="flex:1;background:#b3261e;height:${Math.max(0, x.g) / max * 100}%"></div></div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:6px;text-align:center" class="tenue">${MESES.map(m => `<span>${m}</span>`).join('')}</div>
        <p class="tenue"><span style="color:#2d5f8a">■</span> Ingresos (clase 4) &nbsp; <span style="color:#b3261e">■</span> Gastos y costos (clases 5, 6, 7). Los códigos 11 y 13 siguen la estructura del PUC; si su catálogo usa otra, ajuste el análisis en el balance de prueba.</p>
      </div>`;
    } catch (e) { $('#iKpis').innerHTML = `<div class="alerta error">${esc(errorMsg(e))}</div>`; }
  }
  $('#iCorte').onchange = calcular;
  calcular();
}
