# FEDEBOMBEROS – Sistema contable · Etapa 1
## Guía de instalación (plan gratuito Spark – sin tarjeta, sin cobros)

Misma arquitectura de la herramienta de la heladería: **Firebase Firestore (plan Spark) + GitHub Pages**.
Proyecto Firebase: `fedebomberos-contable-b7555` · Administrador raíz (UID): `hyW8eSx0JtM8POROWIPr4B0p5Ix2`.
Los soportes (facturas, RUT, extractos) se guardan en **Google Drive** de la Federación y en el sistema se registra su enlace.

### Contenido del paquete
| Archivo / carpeta | Qué es |
|---|---|
| `index.html`, `css/`, `js/` | La aplicación. Se sube tal cual a GitHub. |
| `js/firebase-config.js` | Conexión al proyecto `fedebomberos-contable`. |
| `js/vendor/` | Librerías Firebase y Excel incluidas (no dependen de servidores externos). |
| `firestore.rules` | Reglas de seguridad. **Se pegan en la consola de Firebase.** |
| `.nojekyll` | Archivo oculto vacío que GitHub Pages necesita. Súbalo también. |

---

### Paso 1 · Publicar las reglas de seguridad (antes de usar el sistema)
1. Firebase → **Firestore Database → pestaña Reglas**.
2. Borre todo el texto que hay.
3. Abra `firestore.rules` con el Bloc de notas → **Ctrl+A**, **Ctrl+C** → pegue en la consola → **Publicar**.
4. Si aparece un error en rojo, **no publique**: envíe captura.

### Paso 2 · Publicar la aplicación en GitHub Pages
1. En GitHub (la misma cuenta de la heladería u otra institucional) → **New repository** → nombre `fedebomberos-contable` → **Create**.
2. **uploading an existing file** → arrastre **todo el contenido de la carpeta** (no la carpeta misma): `index.html`, `css`, `js`, `firestore.rules`, `.nojekyll` → **Commit changes**.
3. **Settings → Pages → Branch: main · /(root) → Save**.
4. En 1–2 minutos aparece la dirección: `https://SU-USUARIO.github.io/fedebomberos-contable/`

### Paso 3 · Autorizar la dirección en Firebase (si se omite, no deja ingresar)
Firebase → **Authentication → Configuración → Dominios autorizados → Agregar dominio** → `SU-USUARIO.github.io` (sin `https://` ni carpeta).

### Paso 4 · Primer ingreso y puesta en marcha (en este orden)
1. Ingresar con el usuario administrador creado en Firebase.
2. **Usuarios y roles** → crear su propio perfil con “La cuenta ya existe (pegar UID)”; luego contador(a), revisor(a) fiscal y auxiliares.
3. **Configuración y periodos** → revisar datos contra RUT y Cámara de Comercio → Guardar → **Habilitar los 12 meses de 2026** y **Habilitar diciembre del año anterior** (solo para la apertura).
4. **Plan de cuentas** → *Exportar Excel* (plantilla) → llenar con el PUC → *Importar Excel*.
5. **Terceros** → crear o importar.
6. **Saldos iniciales** → importar el balance al 31-12-2025 → diferencia 0 y sin errores → *Guardar borrador* → *Confirmar apertura*.
7. Cerrar el periodo 2025-12.
8. **Comprobantes** y **Libros y balance de prueba**.

### Cómo registrar un soporte
1. Suba el archivo a una carpeta de Google Drive de la Federación (por ejemplo `Soportes 2026 / Enero`).
2. Clic derecho → **Compartir** → en *Acceso general* deje **Restringido** y agregue solo los correos de quienes deben verlo (contadora, revisoría fiscal).
3. **Copiar vínculo** → péguelo en el sistema junto con el nombre del soporte.

> Control interno: con acceso *Restringido*, solo las personas agregadas pueden abrir el archivo aunque tengan el enlace. Evite “Cualquier persona con el vínculo”.

### Protección del acceso (control interno)
- La cuenta de Google dueña del proyecto es institucional y tiene verificación en dos pasos.
- Firebase → Configuración → **Usuarios y permisos**: debe existir un **segundo propietario** (contadora o representante legal), para que la suspensión de una cuenta no deje a la Federación sin acceso a su contabilidad.
- Las credenciales quedan bajo custodia formal de la Federación.

### Respaldo
Administrador → **Configuración → Descargar respaldo completo** (JSON). Mensual y antes de cada cierre.

### Límites del plan gratuito
Firestore Spark incluye una cuota diaria gratuita de lecturas y escrituras muy superior al uso esperado de la Federación. Si algún día se agota, el sistema deja de responder hasta el día siguiente; **nunca genera cobro**, porque no hay tarjeta vinculada.

### Controles que hacen cumplir las reglas de Firebase
- Sin perfil activo no se lee ni se escribe nada.
- Toda escritura contable exige su registro de bitácora en la misma operación; la bitácora no se modifica ni se borra.
- Consecutivos por tipo de comprobante sin saltos ni repeticiones.
- Débitos = créditos; no se registra en periodos cerrados o inexistentes.
- Los comprobantes no se borran: se anulan (con motivo) o se reversan.
- Revisor fiscal: solo consulta. Auxiliar: registra, no modifica ni anula.
