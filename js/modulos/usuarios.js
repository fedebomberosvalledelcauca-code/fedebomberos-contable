// =====================================================================
// Usuarios y roles (solo administrador)
// =====================================================================
import { db, collection, onSnapshot, guardarAuditado, crearUsuarioAuth, sendPasswordResetEmail, auth, sesion } from '../db.js';
import { $, $$, esc, toast, errorMsg, modal } from '../util.js';
import { ROLES } from '../app.js';

const PERMISOS = {
  admin: 'Todo: configuración, periodos, usuarios, registro, anulación, apertura y respaldo.',
  contador: 'Registra, modifica, anula y reversa comprobantes; administra PUC, terceros y saldos iniciales; consulta bitácora.',
  revisor: 'Solo consulta: comprobantes, soportes, libros, configuración y bitácora. No modifica registros.',
  auxiliar: 'Crea comprobantes y terceros y adjunta soportes. No modifica ni anula comprobantes.'
};

export async function render(vista) {
  let usuarios = [];
  vista.innerHTML = `
  <div class="tarjeta"><div class="fila"><p class="tenue" style="flex:3">El administrador raíz (fijado en las reglas de seguridad) no puede perder su rol desde la aplicación.
    Los usuarios no se eliminan: se desactivan, para conservar la trazabilidad de lo que registraron.</p>
    <div class="acciones fijo"><button class="btn primario" id="nuevo">Nuevo usuario</button></div></div></div>
  <div class="tarjeta"><table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody id="cuerpo"></tbody></table></div>
  <div class="tarjeta"><h3>Permisos por rol</h3><table class="t"><tbody>${Object.entries(PERMISOS).map(([k, v]) => `<tr><td><b>${ROLES[k]}</b></td><td>${v}</td></tr>`).join('')}</tbody></table>
  <p class="tenue">Los permisos los hacen cumplir las reglas de seguridad de Firebase, no solo la interfaz. La creación de roles personalizados queda prevista para una etapa posterior.</p></div>`;

  const dibujar = () => {
    $('#cuerpo').innerHTML = usuarios.map(u => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.email)}</td><td>${ROLES[u.rol] || u.rol}</td>
      <td><span class="chip ${u.activo ? 'ok' : 'mal'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="acciones"><button class="btn chico" data-ed="${u.id}">Editar</button><button class="btn chico" data-reset="${esc(u.email)}">Restablecer clave</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="tenue">Aún no hay usuarios registrados. Cree primero su propio perfil (con su mismo correo) para que su nombre aparezca en los registros.</td></tr>';
    $$('[data-ed]').forEach(b => b.onclick = () => formulario(usuarios.find(u => u.id === b.dataset.ed)));
    $$('[data-reset]').forEach(b => b.onclick = async () => {
      try { await sendPasswordResetEmail(auth, b.dataset.reset); toast('Correo de restablecimiento enviado.'); } catch (e) { toast(errorMsg(e), 'error'); }
    });
  };

  function formulario(u) {
    const nuevo = !u;
    u = u || { nombre: '', email: '', rol: 'auxiliar', activo: true };
    const m = modal(nuevo ? 'Nuevo usuario' : u.nombre, `
      <div class="rejilla">
        <label>Nombre completo<input id="uNom" value="${esc(u.nombre)}"></label>
        <label>Correo<input id="uEmail" type="email" value="${esc(u.email)}" ${nuevo ? '' : 'readonly'}></label>
        <label>Rol<select id="uRol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        ${nuevo ? `<label>Modo<select id="uModo"><option value="crear">Crear cuenta nueva con contraseña temporal</option><option value="uid">La cuenta ya existe en Firebase (pegar UID)</option></select></label>
          <label id="lClave">Contraseña temporal (mín. 12)<input id="uClave" type="text" autocomplete="off"></label>
          <label id="lUid" style="display:none">UID<input id="uUid"></label>` : ''}
        ${nuevo ? '' : `<label class="chk"><input type="checkbox" id="uAct" ${u.activo ? 'checked' : ''}> Activo</label>`}
      </div><p class="tenue" id="uPerm"></p>`,
      { botones: '<button class="btn" data-cerrar>Cancelar</button><button class="btn primario" id="uOk">Guardar</button>' });
    $('#uRol', m.el).value = u.rol;
    const perm = () => { $('#uPerm', m.el).textContent = PERMISOS[$('#uRol', m.el).value]; };
    $('#uRol', m.el).onchange = perm; perm();
    if (nuevo) $('#uModo', m.el).onchange = e => {
      $('#lClave', m.el).style.display = e.target.value === 'crear' ? '' : 'none';
      $('#lUid', m.el).style.display = e.target.value === 'uid' ? '' : 'none';
    };
    $('#uOk', m.el).onclick = async () => {
      const d = { nombre: $('#uNom', m.el).value.trim(), email: $('#uEmail', m.el).value.trim().toLowerCase(), rol: $('#uRol', m.el).value,
        activo: nuevo ? true : $('#uAct', m.el).checked, actualizadoPor: sesion.user.email };
      if (!d.nombre || !d.email) return toast('Nombre y correo son obligatorios.', 'error');
      const btn = $('#uOk', m.el); btn.disabled = true;
      try {
        let uid = u.id;
        if (nuevo) {
          if ($('#uModo', m.el).value === 'crear') {
            const clave = $('#uClave', m.el).value;
            if (clave.length < 12) { btn.disabled = false; return toast('La contraseña temporal debe tener al menos 12 caracteres.', 'error'); }
            uid = await crearUsuarioAuth(d.email, clave);
          } else {
            uid = $('#uUid', m.el).value.trim();
            if (!/^[A-Za-z0-9]{20,40}$/.test(uid)) { btn.disabled = false; return toast('UID inválido.', 'error'); }
          }
        }
        await guardarAuditado('usuarios', uid, d, { accion: nuevo ? 'crear usuario' : 'modificar usuario', antes: nuevo ? null : u });
        toast(nuevo ? 'Usuario creado. Entréguele la contraseña temporal por un canal seguro y pídale cambiarla.' : 'Usuario actualizado.');
        m.cerrar();
      } catch (e) { toast(errorMsg(e), 'error'); btn.disabled = false; }
    };
  }

  $('#nuevo').onclick = () => formulario(null);
  return onSnapshot(collection(db, 'usuarios'), s => {
    usuarios = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    dibujar();
  }, e => toast(errorMsg(e), 'error'));
}
