// =====================================================================
// Arranque, autenticación, navegación y permisos de interfaz
// =====================================================================
import { auth, db, doc, getDoc, sesion, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from './db.js';
import { iniciarStore, detenerStore, store } from './store.js';
import { $, esc, toast, errorMsg } from './util.js';

const RAIZ_UID = 'hyW8eSx0JtM8POROWIPr4B0p5Ix2';

export const ROLES = {
  admin: 'Administrador', contador: 'Contador', revisor: 'Revisor fiscal', auxiliar: 'Auxiliar contable'
};

// Menú: id, título, roles que lo ven, cargador del módulo, etapa
const MENU = [
  { grupo: 'General' },
  { id: 'inicio', t: 'Panel principal', i: '◧', roles: ['admin', 'contador', 'revisor', 'auxiliar'], m: () => import('./modulos/inicio.js') },
  { grupo: 'Contabilidad' },
  { id: 'comprobantes', t: 'Comprobantes', i: '▤', roles: ['admin', 'contador', 'revisor', 'auxiliar'], m: () => import('./modulos/comprobantes.js') },
  { id: 'libros', t: 'Libros y balance de prueba', i: '▥', roles: ['admin', 'contador', 'revisor', 'auxiliar'], m: () => import('./modulos/libros.js') },
  { id: 'apertura', t: 'Saldos iniciales', i: '⚑', roles: ['admin', 'contador', 'revisor'], m: () => import('./modulos/apertura.js') },
  { grupo: 'Maestros' },
  { id: 'puc', t: 'Plan de cuentas', i: '☰', roles: ['admin', 'contador', 'revisor', 'auxiliar'], m: () => import('./modulos/puc.js') },
  { id: 'terceros', t: 'Terceros', i: '☺', roles: ['admin', 'contador', 'revisor', 'auxiliar'], m: () => import('./modulos/terceros.js') },
  { grupo: 'Administración' },
  { id: 'configuracion', t: 'Configuración y periodos', i: '⚙', roles: ['admin', 'contador', 'revisor'], m: () => import('./modulos/configuracion.js') },
  { id: 'usuarios', t: 'Usuarios y roles', i: '⚷', roles: ['admin'], m: () => import('./modulos/usuarios.js') },
  { id: 'bitacora', t: 'Bitácora de auditoría', i: '⌛', roles: ['admin', 'contador', 'revisor'], m: () => import('./modulos/bitacora.js') },
  { grupo: 'Próximas etapas' },
  { id: '_e2', t: 'Tesorería, CxC, CxP, convenios', i: '·', roles: ['admin', 'contador', 'revisor', 'auxiliar'], etapa: 2 },
  { id: '_e3', t: 'Retenciones, IVA, exógena, RTE', i: '·', roles: ['admin', 'contador', 'revisor', 'auxiliar'], etapa: 3 },
  { id: '_e4', t: 'Presupuesto, activos, EEFF', i: '·', roles: ['admin', 'contador', 'revisor', 'auxiliar'], etapa: 4 }
];

export const puede = (...roles) => roles.includes(sesion.rol);

function pantallaLogin(msg = '') {
  document.body.innerHTML = `
  <div class="login">
    <form class="login-caja" id="fLogin">
      <div class="marca"><span class="logo">F</span><div><b>FEDEBOMBEROS</b><small>Sistema contable</small></div></div>
      ${msg ? `<div class="alerta error">${esc(msg)}</div>` : ''}
      <label>Correo electrónico<input type="email" id="lEmail" required autocomplete="username"></label>
      <label>Contraseña<input type="password" id="lClave" required autocomplete="current-password"></label>
      <button class="btn primario ancho" type="submit">Ingresar</button>
      <a href="#" id="olvido" class="enlace">¿Olvidó su contraseña?</a>
    </form>
  </div>`;
  $('#fLogin').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter; b.disabled = true; b.textContent = 'Ingresando…';
    try { await signInWithEmailAndPassword(auth, $('#lEmail').value.trim(), $('#lClave').value); }
    catch (err) { pantallaLogin(errorMsg(err)); }
  };
  $('#olvido').onclick = async e => {
    e.preventDefault();
    const email = $('#lEmail').value.trim();
    if (!email) return toast('Escriba primero su correo.', 'error');
    try { await sendPasswordResetEmail(auth, email); toast('Si el correo está registrado, recibirá un enlace para restablecer la contraseña.'); }
    catch (err) { toast(errorMsg(err), 'error'); }
  };
}

function pantallaShell() {
  const items = MENU.filter(x => x.grupo || x.roles.includes(sesion.rol));
  document.body.innerHTML = `
  <div class="shell">
    <aside class="lateral" id="lateral">
      <div class="marca"><span class="logo">F</span><div><b>FEDEBOMBEROS</b><small>Sistema contable</small></div></div>
      <nav>${items.map(x => x.grupo
        ? `<div class="grupo">${esc(x.grupo)}</div>`
        : `<a href="#${x.id}" data-id="${x.id}" class="${x.etapa ? 'pendiente' : ''}"><span class="ic">${x.i}</span>${esc(x.t)}${x.etapa ? `<em>E${x.etapa}</em>` : ''}</a>`).join('')}
      </nav>
    </aside>
    <div class="principal">
      <header class="cabecera">
        <button class="btn-menu" id="btnMenu" aria-label="Menú">☰</button>
        <div class="titulo" id="titulo"></div>
        <div class="usuario"><span>${esc(sesion.perfil?.nombre || sesion.user.email)}</span>
          <span class="chip">${ROLES[sesion.rol]}</span>
          <button class="btn chico" id="salir">Salir</button></div>
      </header>
      <main id="vista" class="vista"></main>
    </div>
  </div>`;
  $('#salir').onclick = () => { detenerStore(); signOut(auth); };
  $('#btnMenu').onclick = () => $('#lateral').classList.toggle('abierto');
  window.onhashchange = navegar;
  navegar();
}

let limpiezaVista = null;
async function navegar() {
  const id = location.hash.slice(1) || 'inicio';
  const item = MENU.find(x => x.id === id && x.roles?.includes(sesion.rol)) || MENU.find(x => x.id === 'inicio');
  document.querySelectorAll('.lateral nav a').forEach(a => a.classList.toggle('activo', a.dataset.id === item.id));
  $('#lateral').classList.remove('abierto');
  $('#titulo').textContent = item.t;
  if (typeof limpiezaVista === 'function') { limpiezaVista(); limpiezaVista = null; }
  const vista = $('#vista');
  if (item.etapa) {
    vista.innerHTML = `<div class="tarjeta"><h3>${esc(item.t)}</h3><p>Este módulo se entrega en la etapa ${item.etapa}, una vez validadas las etapas anteriores con datos reales.</p></div>`;
    return;
  }
  vista.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    const mod = await item.m();
    limpiezaVista = await mod.render(vista);
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="alerta error">Error al cargar el módulo: ${esc(errorMsg(e))}</div>`;
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) { sesion.user = null; sesion.perfil = null; sesion.rol = 'ninguno'; pantallaLogin(); return; }
  sesion.user = user;
  document.body.innerHTML = '<div class="cargando pantalla">Verificando permisos…</div>';
  try {
    const p = await getDoc(doc(db, 'usuarios', user.uid));
    sesion.perfil = p.exists() ? p.data() : null;
    if (user.uid === RAIZ_UID) sesion.rol = 'admin';
    else if (sesion.perfil?.activo) sesion.rol = sesion.perfil.rol;
    else { await signOut(auth); pantallaLogin('Su usuario no tiene un rol activo en el sistema. Solicítelo al administrador.'); return; }
    await iniciarStore();
    pantallaShell();
  } catch (e) {
    console.error(e);
    await signOut(auth);
    pantallaLogin('No fue posible cargar el perfil: ' + errorMsg(e));
  }
});
