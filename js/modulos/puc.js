// =====================================================================
// Plan de cuentas (PUC adaptable)
// =====================================================================
import { guardarAuditado, guardarMasivoAuditado, sesion } from '../db.js';
import { store, alCambiar } from '../store.js';
import { $, $$, esc, toast, errorMsg, modal, exportarExcel, leerExcel, siNo, nivelCuenta, naturalezaPorDefecto, CLASES, tablaOrdenable } from '../util.js';
import { puede } from '../app.js';

const ENC = ['codigo', 'nombre', 'naturaleza', 'movimiento', 'exige_tercero', 'exige_centro_costo', 'activa', 'concepto_tributario'];

export async function render(vista) {
  const editable = puede('admin', 'contador');
  let filtro = { texto: '', clase: '', solo: '' };

  vista.innerHTML = `
  <div class="tarjeta">
    <div class="fila">
      <label>Buscar<input id="fTexto" placeholder="Código o nombre"></label>
      <label class="fijo">Clase<select id="fClase"><option value="">Todas</option>${Object.entries(CLASES).map(([k, v]) => `<option value="${k}">${k} – ${v}</option>`).join('')}</select></label>
      <label class="fijo">Mostrar<select id="fSolo"><option value="">Todas</option><option value="mov">Solo de movimiento</option><option value="inact">Inactivas</option></select></label>
      <div class="acciones fijo">
        ${editable ? '<button class="btn primario" id="nueva">Nueva cuenta</button><button class="btn" id="importar">Importar Excel</button>' : ''}
        <button class="btn" id="exportar">Exportar Excel</button>
      </div>
    </div>
  </div>
  <div class="tarjeta"><div id="resumen" class="tenue"></div><div class="tabla-cont" style="margin-top:8px"><table class="t" id="tabla"></table></div></div>`;

  function dibujar() {
    const lista = [...store.puc.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
    const t = filtro.texto.toLowerCase();
    const vis = lista.filter(c => (!t || c.codigo.startsWith(t) || c.nombre.toLowerCase().includes(t))
      && (!filtro.clase || c.codigo[0] === filtro.clase)
      && (filtro.solo !== 'mov' || c.movimiento) && (filtro.solo !== 'inact' || !c.activa));
    // Control: cuentas de movimiento cuyo padre no existe en el catálogo
    const huerfanas = lista.filter(c => c.codigo.length > 1 && !store.puc.has(padre(c.codigo)));
    $('#resumen').innerHTML = `${lista.length} cuentas · ${lista.filter(c => c.movimiento).length} de movimiento · mostrando ${vis.length}
      ${huerfanas.length ? `<div class="alerta aviso" style="margin-top:6px">${huerfanas.length} cuenta(s) sin cuenta superior en el catálogo (p. ej. ${huerfanas.slice(0, 5).map(c => c.codigo).join(', ')}). Los informes por nivel las agrupan igual, pero conviene crear la cuenta superior para que tenga nombre.</div>` : ''}
      ${!lista.length ? '<div class="alerta info" style="margin-top:6px">El catálogo está vacío. Importe el plan de cuentas de la Federación desde Excel (descargue la plantilla con “Exportar Excel”) o créelo cuenta por cuenta.</div>' : ''}`;
    $('#tabla').innerHTML = `<thead><tr><th data-ordenar>Código</th><th data-ordenar>Nombre</th><th>Nivel</th><th>Nat.</th><th>Mov.</th><th>Tercero</th><th>C. costo</th><th>Concepto tributario</th><th>Estado</th>${editable ? '<th></th>' : ''}</tr></thead>
      <tbody>${vis.slice(0, 2000).map(c => `<tr class="nivel${nivelCuenta(c.codigo)}">
        <td>${esc(c.codigo)}</td><td style="padding-left:${(nivelCuenta(c.codigo) - 1) * 12 + 8}px">${esc(c.nombre)}</td>
        <td>${nivelCuenta(c.codigo)}</td><td>${c.naturaleza}</td><td>${c.movimiento ? 'Sí' : ''}</td>
        <td>${c.exigeTercero ? 'Exige' : ''}</td><td>${c.exigeCentro ? 'Exige' : ''}</td><td>${esc(c.conceptoTributario || '')}</td>
        <td><span class="chip ${c.activa ? 'ok' : 'mal'}">${c.activa ? 'Activa' : 'Inactiva'}</span></td>
        ${editable ? `<td><button class="btn chico" data-ed="${esc(c.codigo)}">Editar</button></td>` : ''}</tr>`).join('')}</tbody>`;
    tablaOrdenable($('#tabla'));
    $$('[data-ed]').forEach(b => b.onclick = () => formulario(store.puc.get(b.dataset.ed)));
  }

  const padre = c => c.length <= 2 ? c.slice(0, c.length - 1) : c.length <= 4 ? c.slice(0, 2) : c.slice(0, c.length - 2);

  function formulario(c) {
    const nueva = !c;
    c = c || { codigo: '', nombre: '', naturaleza: 'D', movimiento: true, exigeTercero: false, exigeCentro: false, activa: true, conceptoTributario: '' };
    const m = modal(nueva ? 'Nueva cuenta' : `Cuenta ${c.codigo}`, `
      <div class="rejilla">
        <label>Código<input id="cCod" value="${esc(c.codigo)}" ${nueva ? '' : 'readonly'} inputmode="numeric"></label>
        <label style="grid-column:span 2">Nombre<input id="cNom" value="${esc(c.nombre)}" maxlength="200"></label>
        <label>Naturaleza<select id="cNat"><option value="D">Débito</option><option value="C">Crédito</option></select></label>
        <label>Concepto tributario / exógena (opcional)<input id="cTrib" value="${esc(c.conceptoTributario || '')}" maxlength="80"></label>
      </div>
      <div class="fila">
        <label class="chk"><input type="checkbox" id="cMov" ${c.movimiento ? 'checked' : ''}> Permite movimiento (auxiliar)</label>
        <label class="chk"><input type="checkbox" id="cTer" ${c.exigeTercero ? 'checked' : ''}> Exige tercero</label>
        <label class="chk"><input type="checkbox" id="cCen" ${c.exigeCentro ? 'checked' : ''}> Exige centro de costo / convenio</label>
        <label class="chk"><input type="checkbox" id="cAct" ${c.activa ? 'checked' : ''}> Activa</label>
      </div>
      <p class="tenue" id="cAyuda"></p>`,
      { botones: '<button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="cGuardar">Guardar</button>' });
    $('#cNat', m.el).value = c.naturaleza;
    const ayuda = () => {
      const cod = $('#cCod', m.el).value.trim();
      if (!cod) return;
      const p = padre(cod);
      $('#cAyuda', m.el).textContent = `Nivel ${nivelCuenta(cod)} · Clase ${cod[0]} ${CLASES[cod[0]] || ''} · ` +
        (p ? (store.puc.has(p) ? `Cuenta superior: ${p} ${store.puc.get(p).nombre}` : `Atención: la cuenta superior ${p} no existe.`) : '');
      if (nueva) $('#cNat', m.el).value = naturalezaPorDefecto(cod);
    };
    $('#cCod', m.el).oninput = ayuda; ayuda();
    $('#cGuardar', m.el).onclick = async () => {
      const d = {
        codigo: $('#cCod', m.el).value.trim(), nombre: $('#cNom', m.el).value.trim().toUpperCase(),
        naturaleza: $('#cNat', m.el).value, movimiento: $('#cMov', m.el).checked,
        exigeTercero: $('#cTer', m.el).checked, exigeCentro: $('#cCen', m.el).checked,
        activa: $('#cAct', m.el).checked, conceptoTributario: $('#cTrib', m.el).value.trim(),
        nivel: 0, actualizadoPor: sesion.user.email
      };
      if (!/^[1-9]\d{0,15}$/.test(d.codigo)) return toast('Código inválido: solo dígitos, sin iniciar en 0.', 'error');
      if (!d.nombre) return toast('El nombre es obligatorio.', 'error');
      if (nueva && store.puc.has(d.codigo)) return toast('Esa cuenta ya existe.', 'error');
      if (!d.movimiento && !nueva && [...store.puc.keys()].every(k => k === d.codigo || !k.startsWith(d.codigo)))
        if (!confirm('La cuenta no tiene subcuentas y quedará sin movimiento. ¿Continuar?')) return;
      d.nivel = nivelCuenta(d.codigo);
      try {
        await guardarAuditado('puc', d.codigo, d, { accion: nueva ? 'crear' : 'modificar', antes: nueva ? null : c });
        toast('Cuenta guardada.'); m.cerrar();
      } catch (e) { toast(errorMsg(e), 'error'); }
    };
  }

  function exportar() {
    const filas = [ENC, ...[...store.puc.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map(c => [c.codigo, c.nombre, c.naturaleza, c.movimiento ? 'S' : 'N', c.exigeTercero ? 'S' : 'N', c.exigeCentro ? 'S' : 'N', c.activa ? 'S' : 'N', c.conceptoTributario || ''])];
    exportarExcel(`PUC_FEDEBOMBEROS_${new Date().toISOString().slice(0, 10)}.xlsx`, [{ nombre: 'PUC', filas }]);
  }

  async function importar() {
    const m = modal('Importar plan de cuentas', `
      <p>Columnas esperadas (la primera fila son encabezados): <b>${ENC.join(', ')}</b>.
      Naturaleza D/C; las columnas de sí/no aceptan S/N. Si naturaleza viene vacía se asigna según la clase.</p>
      <p class="tenue">Las cuentas existentes con el mismo código se <b>actualizan</b> (queda registro en la bitácora). Ninguna cuenta se elimina.</p>
      <input type="file" id="arch" accept=".xlsx,.xls,.csv"><div id="prev"></div>`,
      { ancho: '900px', botones: '<button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="ok" disabled>Importar</button>' });
    let validas = [];
    $('#arch', m.el).onchange = async e => {
      try {
        const filas = await leerExcel(e.target.files[0]);
        const errores = []; const vistos = new Set(); validas = [];
        filas.forEach((f, k) => {
          const codigo = String(f.codigo ?? '').trim().replace(/\D/g, '');
          const nombre = String(f.nombre ?? '').trim().toUpperCase();
          let nat = String(f.naturaleza ?? '').trim().toUpperCase().slice(0, 1);
          if (!codigo && !nombre) return;
          if (!/^[1-9]\d{0,15}$/.test(codigo)) return errores.push(`Fila ${k + 2}: código inválido “${f.codigo}”.`);
          if (!nombre) return errores.push(`Fila ${k + 2}: cuenta ${codigo} sin nombre.`);
          if (vistos.has(codigo)) return errores.push(`Fila ${k + 2}: código ${codigo} repetido en el archivo.`);
          if (nat && !['D', 'C'].includes(nat)) return errores.push(`Fila ${k + 2}: naturaleza “${f.naturaleza}” inválida.`);
          vistos.add(codigo);
          const mov = f.movimiento === '' ? codigo.length >= 6 : siNo(f.movimiento);
          validas.push({ id: codigo, datos: {
            codigo, nombre, naturaleza: nat || naturalezaPorDefecto(codigo), movimiento: mov,
            exigeTercero: siNo(f.exigetercero), exigeCentro: siNo(f.exigecentrocosto),
            activa: f.activa === '' ? true : siNo(f.activa), conceptoTributario: String(f.conceptotributario ?? '').trim(),
            nivel: nivelCuenta(codigo), actualizadoPor: sesion.user.email
          } });
        });
        const nuevas = validas.filter(v => !store.puc.has(v.id)).length;
        $('#prev', m.el).innerHTML = `<div class="alerta ${errores.length ? 'aviso' : 'ok'}">${validas.length} cuentas válidas (${nuevas} nuevas, ${validas.length - nuevas} a actualizar). ${errores.length} con error.</div>
          ${errores.length ? `<pre class="json">${esc(errores.join('\n'))}</pre><p class="tenue">Corrija el archivo y vuelva a cargarlo, o importe solo las válidas.</p>` : ''}`;
        $('#ok', m.el).disabled = !validas.length;
      } catch (err) { toast('No se pudo leer el archivo: ' + errorMsg(err), 'error'); }
    };
    $('#ok', m.el).onclick = async () => {
      $('#ok', m.el).disabled = true; $('#ok', m.el).textContent = 'Importando…';
      const r = await guardarMasivoAuditado('puc', validas, { accion: 'importar Excel', detalle: $('#arch', m.el).files[0]?.name });
      m.cerrar();
      if (r.errores.length) toast(`${r.ok} cuentas importadas; ${r.errores.length} rechazadas (${r.errores.slice(0, 3).map(e => e.id).join(', ')}…).`, 'error');
      else toast(`${r.ok} cuentas importadas.`);
    };
  }

  $('#fTexto').oninput = e => { filtro.texto = e.target.value.trim(); dibujar(); };
  $('#fClase').onchange = e => { filtro.clase = e.target.value; dibujar(); };
  $('#fSolo').onchange = e => { filtro.solo = e.target.value; dibujar(); };
  $('#exportar').onclick = exportar;
  if (editable) { $('#nueva').onclick = () => formulario(null); $('#importar').onclick = importar; }
  dibujar();
  return alCambiar(q => { if (q === 'puc') dibujar(); });
}
