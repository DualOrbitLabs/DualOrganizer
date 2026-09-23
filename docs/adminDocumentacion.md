# Documentación técnica — `admin.js`

Módulo de **Panel de Administración** de DualOrganizer.
Stack: JavaScript Vanilla ES6+, sin frameworks, con Supabase como única fuente de datos.
Arquitectura: renderizado dirigido por estado (`state`), delegación de eventos, creación segura de nodos con `document.createElement` y exportación/importación CSV.

---

## 1. Importaciones del módulo

El archivo comienza importando utilidades desde otros módulos del proyecto.

```javascript
import { getAuthenticatedUser, getCurrentProfile, supabase, signOut } from './supabaseClient.js';
import { APP_CONFIG, isDateInCurrentMonth } from './config.js';
import { serializeChapterCSV, downloadCSV, parseCSV, validateImportedSessions } from './csvUtils.js';
import { initLogicalTimer } from './logicalTimer.js';
```

### Qué hace cada importación

- `getAuthenticatedUser()` — devuelve el usuario autenticado actual (o `null`).
- `getCurrentProfile(userId)` — devuelve el perfil almacenado en la tabla `profiles` del usuario.
- `supabase` — instancia del cliente de Supabase; permite `.from()`, `.rpc()`, `.storage`.
- `signOut()` — cierra la sesión activa.
- `APP_CONFIG` — objeto de configuración global (aquí se usa `APP_CONFIG.academic.monthlyTargetHours`).
- `isDateInCurrentMonth(fecha)` — devuelve `true` si la fecha pertenece al mes en curso.
- `serializeChapterCSV(registros)` — convierte un arreglo de registros a texto CSV.
- `downloadCSV(nombre, contenido)` — dispara la descarga del archivo CSV en el navegador.
- `parseCSV(texto)` — convierte texto CSV en `{ rows, errors }`.
- `validateImportedSessions(rows, opciones)` — valida filas importadas y devuelve `{ validSessions, errors }`.
- `initLogicalTimer(config)` — crea un temporizador lógico con métodos `start()` y `stop()`.

### Punto de entrada

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  // ...todo el módulo vive aquí
});
```

- `DOMContentLoaded` — garantiza que el HTML ya está disponible antes de buscar elementos.
- La función es `async` porque adentro se usan `await` contra Supabase.
- `'use strict'` — activa el modo estricto de JavaScript.

---

## 2. Guardia de autorización en cliente (RBAC)

### `enforceAdminAuthorization()`

Función asíncrona que verifica que exista un usuario autenticado **y** que su rol sea `ADMIN`.

```javascript
const enforceAdminAuthorization = async () => {
  const user = await getAuthenticatedUser();

  if (!user) {
    window.location.replace('login.html');
    return null;
  }

  const profile = await getCurrentProfile(user.id);

  if (!profile || profile.role !== 'ADMIN') {
    console.warn('[Seguridad] Intento de acceso sin privilegios de ADMIN');
    window.location.replace('dashboard.html');
    return null;
  }

  return { ...profile, authUser: user };
};
```

### Explicación

- `user` — almacena la información del usuario autenticado.
- `await` — espera la respuesta del servidor antes de continuar.
- `if (!user)` — si no hay sesión, se redirige a `login.html`.
- `window.location.replace()` — sustituye la página actual **sin** dejar historial (evita volver con el botón atrás).
- `profile` — perfil del usuario obtenido con `getCurrentProfile(user.id)`; `user.id` es la clave con la que se busca.
- `profile.role !== 'ADMIN'` — si no es administrador, se manda al `dashboard.html`.
- `console.warn()` — registra el intento de acceso no autorizado.
- `{ ...profile, authUser: user }` — el *spread operator* copia todas las propiedades del perfil y agrega `authUser` con los datos de sesión (por ejemplo, el correo).

> Nota de seguridad: esta es una guardia **de interfaz**. La protección real de los datos debe estar en las políticas RLS de la base de datos.

### Ejecución de la guardia

```javascript
const currentAdmin = await enforceAdminAuthorization();
if (!currentAdmin) return;

let activeChapterId = new URLSearchParams(window.location.search).get('chapter');
let calendarSessions = [];
```

- `currentAdmin` — perfil del administrador en sesión; si es `null`, el módulo se detiene.
- `URLSearchParams` — objeto nativo para leer parámetros de la URL.
- `activeChapterId` — id del capítulo activo tomado de `?chapter=...`.
- `calendarSessions` — arreglo con las sesiones crudas del capítulo, usado por el gestor de calendario.

---

## 3. Capa de datos

### `getRemoteData()`

Descarga miembros y sesiones del capítulo y los transforma al formato que consume la interfaz.

```javascript
const getRemoteData = async () => {
  let chapterId = new URLSearchParams(window.location.search).get('chapter');
  if (!chapterId) {
    const { data: membership, error } = await supabase
      .from('chapter_members')
      .select('chapter_id')
      .eq('user_id', currentAdmin.id)
      .eq('is_primary', true)
      .maybeSingle();
    if (error) throw error;
    chapterId = membership?.chapter_id;
  }

  if (!chapterId) return { members: [], records: [], chapterId: null };
```

- `.from('tabla')` — selecciona la tabla a consultar.
- `.select('columnas')` — indica las columnas a traer.
- `.eq(columna, valor)` — filtro de igualdad.
- `.maybeSingle()` — devuelve un solo registro o `null` sin lanzar error.
- `membership?.chapter_id` — *optional chaining*: evita error si `membership` es `null`.
- Si no hay capítulo, se devuelve una estructura vacía para que la UI no se rompa.

```javascript
  const { data: memberships, error: membershipError } = await supabase
    .from('chapter_members')
    .select('user_id, role')
    .eq('chapter_id', chapterId);
  if (membershipError) throw membershipError;

  const userIds = memberships.map(member => member.user_id);
```

- `memberships` — lista de miembros del capítulo con su rol.
- `userIds` — arreglo de identificadores obtenido con `.map()`.

```javascript
  const profileQuery = supabase
    .from('profiles')
    .select('*')
    .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);

  const sessionsQuery = supabase
    .from('tutoring_sessions')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('session_date', { ascending: false });

  const [{ data: profiles, error: profileError }, { data: sessions, error: sessionError }] =
    await Promise.all([profileQuery, sessionsQuery]);

  if (profileError) throw profileError;
  if (sessionError) throw sessionError;
```

- `.in(columna, arreglo)` — filtro tipo `WHERE columna IN (...)`.
- El UUID de ceros es un **valor centinela**: evita que la consulta falle cuando no hay usuarios.
- `.order(columna, { ascending: false })` — ordena descendentemente por fecha.
- `Promise.all([...])` — ejecuta ambas consultas **en paralelo**, reduciendo el tiempo de carga.
- La desestructuración por arreglo separa los resultados de cada consulta.

```javascript
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const members = memberships.map((membership) => {
    const profile = profileById.get(membership.user_id) || {};
    return {
      id: profile.institutional_id || profile.id,
      userId: profile.id,
      name: profile.full_name || 'Sin nombre',
      initials: getInitials(profile.full_name || ''),
      role: membership.role === 'ADMIN' ? 'Coordinador / Admin' : 'Tutor Académico',
      status: 'Activo',
      totalHours: 0,
      targetHours: APP_CONFIG.academic.monthlyTargetHours,
      semester: profile.semester || 'Sin especificar',
      email: profile.id === currentAdmin.id ? currentAdmin.authUser.email : '',
      phone: profile.phone || 'No registrado',
      subjects: profile.subjects || [],
      bio: profile.description || 'Sin descripción.'
    };
  });
```

- `new Map(...)` — estructura clave/valor que permite buscar un perfil por id en tiempo constante.
- `profileById.get(...)` — recupera el perfil correspondiente a cada membresía.
- `||` — operador de valor por defecto para campos faltantes.
- Campos del objeto `member`:
  - `id` — matrícula institucional o, en su defecto, el UUID.
  - `userId` — UUID real, usado para enlaces y operaciones.
  - `initials` — iniciales calculadas para el avatar.
  - `role` — texto legible según el rol de la membresía.
  - `totalHours` — acumulador que se llena más abajo, inicia en `0`.
  - `targetHours` — meta mensual tomada de la configuración.
  - `email` — solo se muestra el propio correo del admin por privacidad.

```javascript
  const memberByUserId = new Map(members.map(member => [member.userId, member]));
  calendarSessions = sessions;

  const records = sessions.map(session => {
    const member = memberByUserId.get(session.tutor_id);
    if (member && isDateInCurrentMonth(session.session_date)) {
      member.totalHours += Number(session.hours) || 0;
    }
    return {
      id: session.id,
      matricula: member?.id || session.tutor_id,
      tutorName: member?.name || 'Tutor sin perfil',
      subject: session.subject,
      date: session.session_date,
      hours: Number(session.hours),
      status: session.status === 'APPROVED' ? 'Aprobada'
            : session.status === 'REJECTED' ? 'Rechazada'
            : 'Pendiente',
      tutorId: session.tutor_id,
      startTime: String(session.start_time).slice(0, 5),
      studentName: session.student_name,
      evidencePath: session.evidence_path
    };
  });

  activeChapterId = chapterId;
  return { members, records, chapterId };
};
```

- `memberByUserId` — índice de miembros por UUID.
- Dentro del `.map()` se **acumulan las horas del mes actual** en `member.totalHours`.
- `Number(...) || 0` — convierte a número y protege contra `NaN`.
- Los ternarios anidados traducen el estado técnico (`APPROVED`, `REJECTED`) a texto en español.
- `String(session.start_time).slice(0, 5)` — recorta `HH:MM:SS` a `HH:MM`.
- `evidencePath` — ruta del archivo de evidencia en Storage.

### `loadAdminChapterOptions()`

Rellena el `<select>` de capítulos donde el usuario es administrador.

```javascript
const loadAdminChapterOptions = async () => {
  if (!elements?.chapterSelect) return;
  const { data, error } = await supabase
    .from('chapter_members')
    .select('chapter_id, role, chapters(id, code, name)')
    .eq('user_id', currentAdmin.id)
    .eq('role', 'ADMIN');
  if (error) throw error;

  elements.chapterSelect.innerHTML = '';
  data.forEach((membership) => {
    if (!membership.chapters) return;
    const option = document.createElement('option');
    option.value = membership.chapters.id;
    option.textContent = `${membership.chapters.code} · ${membership.chapters.name}`;
    option.selected = membership.chapters.id === activeChapterId;
    elements.chapterSelect.appendChild(option);
  });

  if (!activeChapterId && elements.chapterSelect.options.length > 0) {
    activeChapterId = elements.chapterSelect.options[0].value;
    elements.chapterSelect.options[0].selected = true;
    const url = new URL(window.location.href);
    url.searchParams.set('chapter', activeChapterId);
    window.history.pushState({}, '', url);
  }
};
```

- `chapters(id, code, name)` — *join* embebido de Supabase que trae los datos de la tabla relacionada.
- `document.createElement('option')` — crea cada opción del selector.
- `option.selected` — marca como seleccionada la opción del capítulo activo.
- `new URL(...)` + `url.searchParams.set(...)` — construyen la URL con el parámetro `chapter`.
- `window.history.pushState()` — actualiza la barra de direcciones **sin recargar** la página.

---

## 4. Estado de la aplicación

```javascript
const state = {
  records: [],
  members: [],
  filterMember: 'ALL',
  searchQuery: '',
  sortKey: 'date',
  sortDirection: 'desc',
  activeTab: 'members'
};
```

Objeto único que concentra toda la información mutable de la interfaz.

- `records` — sesiones ya normalizadas para la tabla.
- `members` — tutores del capítulo.
- `filterMember` — matrícula filtrada; `'ALL'` significa sin filtro.
- `searchQuery` — texto del buscador.
- `sortKey` — columna por la que se ordena.
- `sortDirection` — `'asc'` o `'desc'`.
- `activeTab` — pestaña visible.

Todo el renderizado lee de `state`; cambiar `state` y volver a renderizar es el único flujo permitido.

---

## 5. Referencias al DOM

El objeto `elements` almacena referencias a los nodos HTML para no repetir búsquedas.

### Métodos utilizados

- `document.getElementById(id)` — busca un elemento por su atributo `id`.
- `document.querySelector(selector)` — devuelve el **primer** elemento que coincide con un selector CSS.
- `document.querySelectorAll(selector)` — devuelve **todos** los elementos coincidentes (`NodeList`).

```javascript
const elements = {
  // Pestañas
  tabsNav: document.querySelector('.admin-tabs'),
  panels: document.querySelectorAll('.admin-panel'),
  tabButtons: document.querySelectorAll('.admin-tab-btn'),
  // Métricas en Header
  kpiTotalMembers: document.getElementById('kpiTotalMembers'),
  kpiTotalHours: document.getElementById('kpiTotalHours'),
  kpiTotalSessions: document.getElementById('kpiTotalSessions'),
  // Directorio
  membersGrid: document.getElementById('membersGrid'),
  // Bitácora / Tabla
  recordSearchInput: document.getElementById('recordSearchInput'),
  memberFilterSelect: document.getElementById('memberFilterSelect'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnImportCSV: document.getElementById('btnImportCSV'),
  csvImportModal: document.getElementById('csvImportModal'),
  csvImportClose: document.getElementById('csvImportClose'),
  csvImportCancel: document.getElementById('csvImportCancel'),
  csvFileInputDialog: document.getElementById('csvFileInputDialog'),
  csvImportFeedback: document.getElementById('csvImportFeedback'),
  csvImportSummary: document.getElementById('csvImportSummary'),
  csvImportErrors: document.getElementById('csvImportErrors'),
  csvImportConfirm: document.getElementById('csvImportConfirm'),
  recordsCounterText: document.getElementById('recordsCounterText'),
  recordsTable: document.getElementById('recordsTable'),
  recordsTableBody: document.getElementById('recordsTableBody'),
  sortHeaders: document.querySelectorAll('th.sortable'),
  // Modal Ficha de Mentor (<dialog>)
  memberModal: document.getElementById('memberModal'),
  dialogMemberAvatar: document.getElementById('dialogMemberAvatar'),
  dialogMemberInitials: document.getElementById('dialogMemberInitials'),
  dialogMemberRole: document.getElementById('dialogMemberRole'),
  dialogMemberStatus: document.getElementById('dialogMemberStatus'),
  dialogMemberName: document.getElementById('dialogMemberName'),
  dialogMemberId: document.getElementById('dialogMemberId'),
  dialogMemberHours: document.getElementById('dialogMemberHours'),
  dialogMemberTarget: document.getElementById('dialogMemberTarget'),
  dialogProgressTrack: document.getElementById('dialogProgressTrack'),
  dialogProgressBar: document.getElementById('dialogProgressBar'),
  dialogMemberSemester: document.getElementById('dialogMemberSemester'),
  dialogMemberEmail: document.getElementById('dialogMemberEmail'),
  dialogMemberPhone: document.getElementById('dialogMemberPhone'),
  dialogMemberSubjects: document.getElementById('dialogMemberSubjects'),
  dialogMemberBio: document.getElementById('dialogMemberBio'),
  dialogCloseBtn: document.getElementById('dialogCloseBtn'),
  dialogCloseFooterBtn: document.getElementById('dialogCloseFooterBtn'),
  dialogViewCalendarBtn: document.getElementById('dialogViewCalendarBtn'),
  // Toast
  toast: document.getElementById('adminToast'),
  toastMsg: document.getElementById('adminToastMsg'),
  refreshButton: document.getElementById('btnRefreshAdmin')
  , chapterSelect: document.getElementById('adminChapterSelect')
  , sessionManagerModal: document.getElementById('sessionManagerModal')
  , sessionManagerForm: document.getElementById('sessionManagerForm')
  , managerOperation: document.getElementById('managerOperation')
  , managerTutor: document.getElementById('managerTutor')
  , managerSession: document.getElementById('managerSession')
  , managerTargetTutor: document.getElementById('managerTargetTutor')
  , managerTargetSession: document.getElementById('managerTargetSession')
  , managerTargetGroup: document.getElementById('managerTargetGroup')
  , managerTargetSessionGroup: document.getElementById('managerTargetSessionGroup')
  , managerSessionGroup: document.getElementById('managerSessionGroup')
  , managerNewSessionFields: document.getElementById('managerNewSessionFields')
  , managerDate: document.getElementById('managerDate')
  , managerTime: document.getElementById('managerTime')
  , managerStudent: document.getElementById('managerStudent')
  , managerSubject: document.getElementById('managerSubject')
  , managerHours: document.getElementById('managerHours')
};

let toastTimeout = null;
```

### Grupos de referencias

- **Pestañas:** `tabsNav`, `panels`, `tabButtons` controlan la navegación del panel.
- **KPI:** `kpiTotalMembers`, `kpiTotalHours`, `kpiTotalSessions` muestran métricas del encabezado.
- **Directorio:** `membersGrid` es el contenedor de tarjetas de tutores.
- **Bitácora:** entradas de búsqueda, filtro, botones CSV, tabla y encabezados ordenables.
- **Modal de ficha:** todos los `dialog*` pertenecen al `<dialog id="memberModal">`.
- **Gestor de sesiones:** todos los `manager*` pertenecen al formulario de operaciones de calendario.
- `toastTimeout` — guarda el identificador del `setTimeout` activo del toast para poder cancelarlo.

---

## 6. Utilidades de interfaz

### `showToast(message)`

Muestra una notificación temporal.

```javascript
const showToast = (message) => {
  if (!elements.toast) return;
  elements.toastMsg.textContent = message;
  elements.toast.classList.add('is-visible');
  elements.toast.setAttribute('aria-hidden', 'false');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove('is-visible');
    elements.toast.setAttribute('aria-hidden', 'true');
  }, 2800);
};
```

- `textContent` — inserta texto plano; a diferencia de `innerHTML`, evita inyección de HTML.
- `classList.add()` / `classList.remove()` — agregan o quitan la clase de visibilidad.
- `setAttribute('aria-hidden', ...)` — informa a lectores de pantalla si el aviso está visible.
- `clearTimeout(toastTimeout)` — cancela un temporizador previo para que toasts consecutivos no se corten.
- `setTimeout(..., 2800)` — oculta el toast después de 2.8 segundos.

### `getStatusBadgeClass(status)`

Traduce un estado a la clase CSS de su insignia.

```javascript
const getStatusBadgeClass = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'activo':
    case 'aprobada':
      return 'status-badge--active';
    case 'inactivo':
    case 'rechazada':
      return 'status-badge--inactive';
    case 'pendiente':
      return 'status-badge--pending';
    case 'revisión':
    case 'revision':
      return 'status-badge--review';
    default:
      return 'status-badge--inactive';
  }
};
```

- `String(status || '')` — normaliza valores `null`/`undefined`.
- `.toLowerCase()` — hace la comparación insensible a mayúsculas.
- Los `case` sin `return` intermedio son **caídas intencionales** (dos estados comparten clase).
- `default` — clase de respaldo para estados desconocidos.

### `getInitials(name)`

Calcula las iniciales del avatar.

```javascript
const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'TO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
```

- `name = ''` — parámetro con valor por defecto.
- `.trim()` — elimina espacios al inicio y al final.
- `.split(/\s+/)` — separa por uno o más espacios usando expresión regular.
- `'TO'` — iniciales de respaldo (DualOrganizer) cuando no hay nombre.
- Con un solo nombre toma las dos primeras letras; con varios, la primera del nombre y la del apellido.

### `formatSessionLabel(session)`

Genera la etiqueta legible de una sesión para los `<option>`.

```javascript
const formatSessionLabel = (session) =>
  `${session.session_date} ${String(session.start_time).slice(0, 5)} · ${session.subject} · ${session.hours}h`;
```

- Usa *template literals* para componer fecha, hora recortada, materia y horas.

---

## 7. Gestor de sesiones (formulario dinámico)

### `refreshManagerSessions()`

Recarga el `<select>` de sesiones según el tutor origen elegido.

```javascript
const refreshManagerSessions = () => {
  const tutorId = elements.managerTutor?.value;
  const sessions = calendarSessions.filter(session => session.tutor_id === tutorId);
  if (elements.managerSession) {
    elements.managerSession.innerHTML = '';
    sessions.forEach(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = formatSessionLabel(session);
      elements.managerSession.appendChild(option);
    });
    if (!sessions.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Sin sesiones';
      elements.managerSession.appendChild(option);
    }
  }
  refreshManagerTargetSessions();
};
```

- `.filter()` — deja solo las sesiones del tutor seleccionado.
- `innerHTML = ''` — limpia las opciones anteriores.
- Si no hay resultados se agrega una opción informativa `'Sin sesiones'`.
- Al final se sincroniza también el selector destino.

### `refreshManagerTargetSessions()`

Idéntica a la anterior, pero para el **tutor destino** (`managerTargetTutor` → `managerTargetSession`). Se usa en la operación de intercambio.

### `refreshManagerVisibility()`

Adapta el formulario según la operación elegida: qué campos se muestran, cuáles se habilitan y qué textos aparecen.

```javascript
const refreshManagerVisibility = () => {
  const operation = elements.managerOperation?.value;
  const needsSession = operation === 'edit' || operation === 'delete' || operation === 'swap' || operation === 'send';
  const needsTarget = operation === 'swap' || operation === 'send' || operation === 'reassign_subject';
  const needsTargetSession = operation === 'swap';
  const needsDetails = operation === 'add' || operation === 'edit' || operation === 'block_slot' || operation === 'reassign_subject';
```

- `operation` — valor del `<select>` de operación.
- `needsSession` — la operación requiere una sesión seleccionada.
- `needsTarget` — requiere un tutor destino.
- `needsTargetSession` — requiere una segunda sesión (solo `swap`).
- `needsDetails` — requiere los campos de fecha, hora, alumno, materia y horas.

```javascript
  const copy = {
    add: { title: 'Agregar sesión', hint: 'Crea una sesión nueva en el calendario del tutor seleccionado.', submit: 'Agregar sesión' },
    edit: { title: 'Editar sesión', hint: 'Selecciona una sesión y ajusta sus datos o su horario.', submit: 'Guardar cambios' },
    delete: { title: 'Eliminar sesión', hint: 'La sesión se eliminará del calendario de forma permanente.', submit: 'Eliminar sesión' },
    duplicate_week: { title: 'Duplicar semana anterior', hint: 'Copia automáticamente las sesiones de la semana previa para este tutor sumando 7 días.', submit: 'Duplicar semana' },
    reassign_subject: { title: 'Reasignar materia', hint: 'Mueve todas las sesiones de una materia de este tutor hacia un tutor destino.', submit: 'Reasignar materia' },
    block_slot: { title: 'Bloquear horario / Indisponibilidad', hint: 'Registra una reserva o bloqueo de horario institucional en la fecha especificada.', submit: 'Bloquear horario' },
    clear: { title: 'Limpiar calendario del tutor', hint: 'Borra todas las sesiones del tutor seleccionado dentro del capítulo activo.', submit: 'Limpiar calendario' },
    swap: { title: 'Intercambiar horario', hint: 'Selecciona otra sesión para intercambiar sus tutores y horarios.', submit: 'Intercambiar' },
    send: { title: 'Enviar sesión', hint: 'La sesión se moverá al horario libre más cercano del tutor destino.', submit: 'Enviar sesión' }
  }[operation] || {};
```

- `copy` — diccionario de textos indexado por operación; el acceso `[operation]` selecciona el bloque correcto.
- `|| {}` — objeto vacío de respaldo si la operación no está en el diccionario.

```javascript
  if (elements.managerSessionGroup) elements.managerSessionGroup.hidden = !needsSession;
  if (elements.managerTargetGroup) elements.managerTargetGroup.hidden = !needsTarget;
  if (elements.managerTargetSessionGroup) elements.managerTargetSessionGroup.hidden = !needsTargetSession;
  if (elements.managerNewSessionFields) {
    elements.managerNewSessionFields.hidden = !needsDetails;
  }

  const detailFields = [
    elements.managerDate,
    elements.managerTime,
    elements.managerStudent,
    elements.managerSubject,
    elements.managerHours
  ];
  detailFields.forEach(field => {
    if (field) field.disabled = !needsDetails;
  });
  [elements.managerSession, elements.managerTargetTutor, elements.managerTargetSession].forEach(field => {
    if (field) field.disabled = field === elements.managerSession ? !needsSession : !needsTarget && field !== elements.managerTargetSession;
  });
  if (elements.managerTargetSession) elements.managerTargetSession.disabled = !needsTargetSession;

  const title = document.getElementById('sessionManagerTitle');
  const hint = document.getElementById('sessionManagerHint');
  const submit = document.getElementById('sessionManagerSubmit');
  if (title && copy.title) title.textContent = copy.title;
  if (hint && copy.hint) hint.textContent = copy.hint;
  if (submit && copy.submit) submit.textContent = copy.submit;
  if (submit) submit.classList.toggle('btn--danger', operation === 'delete' || operation === 'clear');
};
```

- `hidden` — propiedad booleana nativa que oculta el elemento.
- `disabled` — deshabilita controles para que no se envíen datos irrelevantes.
- `detailFields` — arreglo con los campos de detalle, habilitados en bloque.
- `classList.toggle(clase, condición)` — pinta el botón en rojo solo en operaciones destructivas.

### `loadSelectedSessionIntoForm()`

Vuelca los datos de la sesión seleccionada en los campos del formulario.

```javascript
const loadSelectedSessionIntoForm = () => {
  const session = calendarSessions.find(item => item.id === elements.managerSession?.value);
  if (!session) return;
  elements.managerDate.value = session.session_date;
  elements.managerTime.value = String(session.start_time).slice(0, 5);
  elements.managerStudent.value = session.student_name;
  elements.managerSubject.value = session.subject;
  elements.managerHours.value = session.hours;
};
```

- `.find()` — localiza la sesión cuyo `id` coincide con el valor del selector.
- `.value` — asigna el contenido a cada `<input>`.

### `openSessionManager(tutorId, sessionId)`

Abre el modal del gestor, precargando tutores y, opcionalmente, una sesión.

```javascript
const openSessionManager = (tutorId = '', sessionId = '') => {
  if (!elements.sessionManagerModal) return;
  [elements.managerTutor, elements.managerTargetTutor].forEach((select) => {
    select.innerHTML = '';
    state.members.forEach(member => {
      const option = document.createElement('option');
      option.value = member.userId;
      option.textContent = member.name;
      select.appendChild(option);
    });
  });
  if (tutorId) elements.managerTutor.value = tutorId;
  if (sessionId) {
    const session = calendarSessions.find(item => item.id === sessionId);
    if (session) {
      elements.managerTutor.value = session.tutor_id;
      elements.managerOperation.value = 'delete';
    }
  }
  refreshManagerSessions();
  if (sessionId) elements.managerSession.value = sessionId;
  if (sessionId) {
    elements.managerOperation.value = 'edit';
    loadSelectedSessionIntoForm();
  }
  refreshManagerVisibility();
  elements.sessionManagerModal.showModal();
};
```

- Los parámetros tienen valor por defecto `''` para poder llamarla sin argumentos.
- Ambos selectores de tutor se llenan con `state.members`.
- `showModal()` — método nativo de `<dialog>` que abre el modal con backdrop y foco atrapado.

---

## 8. Renderizado del directorio de mentores

### `renderMembers()`

Construye las tarjetas del directorio creando nodos uno a uno (renderizado seguro, sin `innerHTML`).

```javascript
const renderMembers = () => {
  if (!elements.membersGrid) return;
  elements.membersGrid.innerHTML = '';

  const fragment = document.createDocumentFragment();

  state.members.forEach((member) => {
    const percentage = Math.min(100, Math.round((member.totalHours / member.targetHours) * 100));
    const card = document.createElement('article');
    card.className = 'member-card';
    card.setAttribute('role', 'listitem');

    const innerWrapper = document.createElement('div');

    // Header de tarjeta
    const cardHeader = document.createElement('header');
    cardHeader.className = 'member-card__header';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'member-card__avatar';
    avatarDiv.setAttribute('aria-hidden', 'true');

    const avatarInitials = document.createElement('span');
    avatarInitials.className = 'avatar-initials';
    avatarInitials.textContent = member.initials || getInitials(member.name);
    avatarDiv.appendChild(avatarInitials);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'member-card__info';

    const h3Name = document.createElement('h3');
    h3Name.className = 'member-card__name';
    h3Name.title = member.name;
    h3Name.textContent = member.name;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'member-card__meta';

    const roleBadge = document.createElement('span');
    roleBadge.className = 'role-badge';
    roleBadge.textContent = member.role;

    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${getStatusBadgeClass(member.status)}`;
    statusBadge.textContent = member.status;

    metaDiv.append(roleBadge, statusBadge);
    infoDiv.append(h3Name, metaDiv);
    cardHeader.append(avatarDiv, infoDiv);
```

- `document.createDocumentFragment()` — contenedor en memoria: se insertan todos los nodos de una sola vez y se evita **reflow** repetido.
- `percentage` — porcentaje de avance; `Math.min(100, ...)` evita pasar del 100 %.
- `Math.round()` — redondea al entero más cercano.
- `.append(a, b)` — inserta varios nodos en una sola llamada.
- `aria-hidden="true"` en el avatar: es decorativo para lectores de pantalla.
- `h3Name.title` — tooltip nativo con el nombre completo.

```javascript
    // Progreso
    const progressDiv = document.createElement('div');
    progressDiv.className = 'member-card__progress';

    const progressHeader = document.createElement('div');
    progressHeader.className = 'progress-header';

    const progressLabel = document.createElement('span');
    progressLabel.className = 'progress-header__label';
    progressLabel.textContent = 'Horas acumuladas';

    const progressVal = document.createElement('span');
    progressVal.className = 'progress-header__val tabular-nums';
    progressVal.textContent = `${Number(member.totalHours).toFixed(1)} / ${member.targetHours}h (${percentage}%)`;

    progressHeader.append(progressLabel, progressVal);

    const progressTrack = document.createElement('div');
    progressTrack.className = 'progress-bar-track';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-valuenow', String(member.totalHours));
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', String(member.targetHours));

    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = `${percentage}%`;
    progressTrack.appendChild(progressFill);

    progressDiv.append(progressHeader, progressTrack);
```

- `.toFixed(1)` — formatea las horas con un decimal.
- `role="progressbar"` con `aria-valuenow`, `aria-valuemin` y `aria-valuemax` describen el progreso a tecnologías de asistencia.
- `style.width` — ancho visual de la barra según el porcentaje.

```javascript
    // Chips de materias
    const subjectsDiv = document.createElement('div');
    subjectsDiv.className = 'member-card__subjects';
    subjectsDiv.setAttribute('aria-label', 'Materias impartidas');

    const visibleSubjects = member.subjects.slice(0, 2);
    const remainingCount = member.subjects.length - 2;

    visibleSubjects.forEach(sub => {
      const chip = document.createElement('span');
      chip.className = 'subject-chip';
      chip.textContent = sub;
      subjectsDiv.appendChild(chip);
    });

    if (remainingCount > 0) {
      const moreChip = document.createElement('span');
      moreChip.className = 'subject-chip subject-chip--more';
      moreChip.textContent = `+${remainingCount} más`;
      subjectsDiv.appendChild(moreChip);
    }

    innerWrapper.append(cardHeader, progressDiv, subjectsDiv);
```

- `visibleSubjects` — solo las dos primeras materias.
- `remainingCount` — cuántas quedan ocultas; si es mayor a cero se muestra el chip `+N más`.

```javascript
    // Botón ver detalle
    const btnView = document.createElement('button');
    btnView.type = 'button';
    btnView.className = 'btn btn--secondary btn--full';
    btnView.setAttribute('data-action', 'view-member');
    btnView.setAttribute('data-member-id', member.id);
    btnView.textContent = 'Ver Detalle';

    const actions = document.createElement('div');
    actions.className = 'member-card__actions';
    actions.appendChild(btnView);

    const btnManage = document.createElement('button');
    btnManage.type = 'button';
    btnManage.className = 'btn btn--outline-action btn--full';
    btnManage.setAttribute('data-action', 'manage-tutor');
    btnManage.setAttribute('data-member-id', member.userId);
    btnManage.textContent = 'Gestionar calendario';
    actions.appendChild(btnManage);

    card.append(innerWrapper, actions);
    fragment.appendChild(card);
  });

  elements.membersGrid.appendChild(fragment);

  if (elements.kpiTotalMembers) {
    elements.kpiTotalMembers.textContent = state.members.length;
  }
};
```

- `data-action` y `data-member-id` — atributos de datos que la **delegación de eventos** lee para saber qué hacer.
- `type="button"` — impide que el botón envíe formularios.
- Al final se actualiza el KPI de total de miembros.

---

## 9. Selector de filtro por tutor

### `populateMemberFilter()`

```javascript
const populateMemberFilter = () => {
  if (!elements.memberFilterSelect) return;

  elements.memberFilterSelect.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'ALL';
  allOption.textContent = 'Todos los tutores';
  elements.memberFilterSelect.appendChild(allOption);

  state.members.forEach((member) => {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent = `${member.name} (${member.id})`;
    elements.memberFilterSelect.appendChild(option);
  });

  elements.memberFilterSelect.value = state.filterMember;
};
```

- Inserta primero la opción `'ALL'` (sin filtro) y luego un `<option>` por tutor.
- La última línea **restaura** la selección guardada en `state.filterMember` tras el repintado.

---

## 10. Bitácora de sesiones: filtrado, orden y render

### `getProcessedRecords()`

Aplica filtro, búsqueda y ordenamiento sobre `state.records`.

```javascript
const getProcessedRecords = () => {
  let result = [...state.records];

  if (state.filterMember !== 'ALL') {
    result = result.filter(rec => rec.matricula === state.filterMember);
  }

  if (state.searchQuery.trim() !== '') {
    const query = state.searchQuery.toLowerCase().trim();
    result = result.filter(rec => {
      return (
        rec.matricula.toLowerCase().includes(query) ||
        rec.tutorName.toLowerCase().includes(query) ||
        rec.subject.toLowerCase().includes(query) ||
        rec.date.toLowerCase().includes(query) ||
        rec.status.toLowerCase().includes(query)
      );
    });
  }

  result.sort((a, b) => {
    let valA = a[state.sortKey];
    let valB = b[state.sortKey];

    if (typeof valA === 'string') {
      const comparison = valA.localeCompare(valB, 'es', { numeric: true });
      return state.sortDirection === 'asc' ? comparison : -comparison;
    }

    if (typeof valA === 'number') {
      return state.sortDirection === 'asc' ? valA - valB : valB - valA;
    }

    return 0;
  });

  return result;
};
```

- `[...state.records]` — copia superficial: el `sort()` no muta el estado original.
- `.filter()` por matrícula cuando hay un tutor seleccionado.
- La búsqueda es **multicampo**: matrícula, tutor, materia, fecha y estado.
- `.includes(query)` — coincidencia parcial.
- `localeCompare(valB, 'es', { numeric: true })` — comparación alfabética correcta en español y con orden numérico natural.
- El signo negativo invierte el resultado cuando la dirección es `'desc'`.
- Para números se resta directamente.

### `updateSortIndicators()`

```javascript
const updateSortIndicators = () => {
  elements.sortHeaders.forEach(th => {
    const key = th.getAttribute('data-sort');
    if (key === state.sortKey) {
      th.setAttribute('aria-sort', state.sortDirection === 'asc' ? 'ascending' : 'descending');
    } else {
      th.setAttribute('aria-sort', 'none');
    }
  });
};
```

- `aria-sort` — atributo accesible que indica por qué columna y en qué sentido está ordenada la tabla.

### `renderRecords()`

Dibuja el cuerpo de la tabla y actualiza los KPI.

```javascript
const renderRecords = () => {
  if (!elements.recordsTableBody) return;
  const records = getProcessedRecords();
  elements.recordsTableBody.innerHTML = '';

  updateSortIndicators();

  if (elements.recordsCounterText) {
    elements.recordsCounterText.textContent = `Mostrando ${records.length} de ${state.records.length} sesiones`;
  }

  if (elements.kpiTotalSessions) {
    elements.kpiTotalSessions.textContent = state.records.length;
  }
  if (elements.kpiTotalHours) {
    const totalHours = state.records
      .filter(record => isDateInCurrentMonth(record.date))
      .reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
    elements.kpiTotalHours.textContent = totalHours.toFixed(1);
  }
```

- `records` — resultado ya filtrado y ordenado.
- `recordsCounterText` — contador «Mostrando X de Y».
- `.reduce((acc, curr) => ...)` — suma acumulada de horas del mes actual; `acc` es el acumulador y `curr` el registro en turno.

```javascript
  if (records.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyTd = document.createElement('td');
    emptyTd.colSpan = 7;
    emptyTd.className = 'table-empty';
    emptyTd.textContent = 'No se encontraron sesiones registradas con los criterios seleccionados.';
    emptyRow.appendChild(emptyTd);
    elements.recordsTableBody.appendChild(emptyRow);
    return;
  }
```

- Estado vacío: una sola fila con `colSpan = 7` que abarca todas las columnas.

```javascript
  const fragment = document.createDocumentFragment();

  records.forEach((rec) => {
    const row = document.createElement('tr');

    const tdMatricula = document.createElement('td');
    tdMatricula.className = 'table-matricula tabular-nums';
    tdMatricula.textContent = rec.matricula;

    const tdTutor = document.createElement('td');
    const strongTutor = document.createElement('strong');
    strongTutor.textContent = rec.tutorName;
    tdTutor.appendChild(strongTutor);

    const tdSubject = document.createElement('td');
    tdSubject.textContent = rec.subject;

    const tdDate = document.createElement('td');
    const timeEl = document.createElement('time');
    timeEl.setAttribute('datetime', rec.date);
    timeEl.className = 'tabular-nums';
    timeEl.textContent = rec.date;
    tdDate.appendChild(timeEl);

    const tdHours = document.createElement('td');
    tdHours.className = 'text-right tabular-nums';
    const strongHours = document.createElement('strong');
    strongHours.textContent = `${Number(rec.hours).toFixed(1)}h`;
    tdHours.appendChild(strongHours);

    const tdStatus = document.createElement('td');
    const statusSpan = document.createElement('span');
    statusSpan.className = `status-badge ${getStatusBadgeClass(rec.status)}`;
    statusSpan.textContent = rec.status;
    tdStatus.appendChild(statusSpan);

    const tdActions = document.createElement('td');
    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.className = 'btn btn--secondary';
    manageButton.setAttribute('data-action', 'manage-session');
    manageButton.setAttribute('data-session-id', rec.id);
    manageButton.textContent = 'Gestionar';
    tdActions.appendChild(manageButton);

    if (rec.evidencePath) {
      const evidenceBtn = document.createElement('button');
      evidenceBtn.type = 'button';
      evidenceBtn.className = 'btn btn--outline-action';
      evidenceBtn.setAttribute('data-action', 'view-evidence');
      evidenceBtn.setAttribute('data-path', rec.evidencePath);
      evidenceBtn.style.marginLeft = '6px';
      evidenceBtn.textContent = '📎 Evidencia';
      tdActions.appendChild(evidenceBtn);
    }

    row.append(tdMatricula, tdTutor, tdSubject, tdDate, tdHours, tdStatus, tdActions);
    fragment.appendChild(row);
  });

  elements.recordsTableBody.appendChild(fragment);
};
```

- `<time datetime="...">` — marca semántica de fecha legible por máquinas.
- `tabular-nums` — clase tipográfica que alinea los dígitos en columna.
- El botón de evidencia solo se crea si `rec.evidencePath` existe.

---

## 11. Exportación e importación CSV

### `exportToCSV()`

```javascript
const exportToCSV = () => {
  const recordsToExport = getProcessedRecords();

  if (!recordsToExport || recordsToExport.length === 0) {
    showToast('No hay registros disponibles para exportar con los filtros actuales');
    return;
  }

  const csvContent = serializeChapterCSV(recordsToExport);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadCSV(`dualorganizer_sesiones_${timestamp}.csv`, csvContent);

  showToast(`Exportadas ${recordsToExport.length} sesiones a CSV con éxito`);
};
```

- Exporta exactamente **lo que se ve** (respeta filtros y búsqueda).
- `new Date().toISOString().slice(0, 10)` — fecha en formato `YYYY-MM-DD` para el nombre de archivo.
- `serializeChapterCSV` genera el CSV con BOM UTF-8 para que Excel respete los acentos.

### Variables de estado de importación

```javascript
let pendingImportSessions = [];
let isImporting = false;
```

- `pendingImportSessions` — sesiones válidas listas para insertar.
- `isImporting` — bandera que evita dobles envíos y bloquea el cierre del modal durante la inserción.

### `openCSVImportModal()`

```javascript
const openCSVImportModal = () => {
  if (isImporting) return;
  pendingImportSessions = [];
  if (elements.csvFileInputDialog) elements.csvFileInputDialog.value = '';
  if (elements.csvImportFeedback) elements.csvImportFeedback.style.display = 'none';
  if (elements.csvImportSummary) elements.csvImportSummary.textContent = '';
  if (elements.csvImportErrors) elements.csvImportErrors.innerHTML = '';
  if (elements.csvImportConfirm) {
    elements.csvImportConfirm.disabled = true;
    elements.csvImportConfirm.textContent = 'Importar 0 Sesiones';
  }
  elements.csvImportModal?.showModal();
};
```

- Reinicia por completo el estado del modal antes de abrirlo.
- El botón de confirmación arranca deshabilitado.

### `closeCSVImportModal()`

```javascript
const closeCSVImportModal = () => {
  if (isImporting) return;
  elements.csvImportModal?.close();
};
```

- `close()` — método nativo de `<dialog>`; no se ejecuta si hay una importación en curso.

### `handleCSVFileSelection(event)`

Lee y valida el archivo seleccionado.

```javascript
const handleCSVFileSelection = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parseResult = parseCSV(text);

    if (elements.csvImportFeedback) elements.csvImportFeedback.style.display = 'block';
    if (elements.csvImportErrors) elements.csvImportErrors.innerHTML = '';

    if (parseResult.errors && parseResult.errors.length > 0 && parseResult.rows.length === 0) {
      if (elements.csvImportSummary) {
        elements.csvImportSummary.textContent = 'Error al procesar el archivo CSV:';
      }
      parseResult.errors.forEach(err => {
        const li = document.createElement('li');
        li.textContent = err;
        elements.csvImportErrors.appendChild(li);
      });
      if (elements.csvImportConfirm) {
        elements.csvImportConfirm.disabled = true;
        elements.csvImportConfirm.textContent = 'Importar 0 Sesiones';
      }
      return;
    }

    const validation = validateImportedSessions(parseResult.rows, {
      chapterId: activeChapterId,
      members: state.members
    });

    pendingImportSessions = validation.validSessions;

    const combinedErrors = [...(parseResult.errors || []), ...validation.errors];

    if (elements.csvImportSummary) {
      elements.csvImportSummary.textContent = `${validation.validSessions.length} sesión(es) válida(s) lista(s) para importar. ${combinedErrors.length} advertencia(s)/error(es).`;
    }

    if (combinedErrors.length > 0) {
      combinedErrors.forEach(err => {
        const li = document.createElement('li');
        li.textContent = err;
        elements.csvImportErrors.appendChild(li);
      });
    }

    if (elements.csvImportConfirm) {
      elements.csvImportConfirm.disabled = validation.validSessions.length === 0;
      elements.csvImportConfirm.textContent = `Importar ${validation.validSessions.length} Sesiones`;
    }
  } catch (err) {
    console.error('Error al leer el archivo CSV:', err);
    showToast('Error al leer el archivo CSV: ' + err.message);
  }
};
```

- `event.target.files?.[0]` — primer archivo seleccionado por el usuario.
- `await file.text()` — lee el contenido del archivo como texto (API `File`).
- `parseResult` — `{ rows, errors }` devuelto por `parseCSV`.
- `validation` — `{ validSessions, errors }`; recibe el capítulo activo y los miembros para comprobar matrículas.
- `combinedErrors` — une errores de parseo y de validación con *spread*.
- El botón se habilita solo si hay al menos una sesión válida y muestra el conteo.

### `confirmCSVImport()`

Inserta en la base de datos las sesiones validadas.

```javascript
const confirmCSVImport = async () => {
  if (isImporting) return;
  if (!pendingImportSessions || pendingImportSessions.length === 0) {
    showToast('No hay sesiones válidas para importar');
    return;
  }

  try {
    isImporting = true;
    if (elements.csvImportConfirm) {
      elements.csvImportConfirm.disabled = true;
      elements.csvImportConfirm.textContent = 'Importando...';
    }
    if (elements.csvImportCancel) elements.csvImportCancel.disabled = true;
    if (elements.csvImportClose) elements.csvImportClose.disabled = true;

    const { error } = await supabase
      .from('tutoring_sessions')
      .insert(pendingImportSessions);

    if (error) throw error;

    showToast(`Se importaron ${pendingImportSessions.length} sesiones correctamente.`);
    isImporting = false;
    closeCSVImportModal();
    await reloadRemoteData();
  } catch (err) {
    console.error('Error insertando sesiones importadas:', err);
    showToast('Error al guardar las sesiones: ' + (err.message || err));
    if (elements.csvImportConfirm) {
      elements.csvImportConfirm.disabled = false;
      elements.csvImportConfirm.textContent = `Reintentar (${pendingImportSessions.length})`;
    }
  } finally {
    isImporting = false;
    if (elements.csvImportCancel) elements.csvImportCancel.disabled = false;
    if (elements.csvImportClose) elements.csvImportClose.disabled = false;
  }
};
```

- `.insert(arreglo)` — inserción por lotes en una sola petición.
- El bloque `try / catch / finally` garantiza que los botones se reactiven pase lo que pase.
- En caso de error el botón cambia a `Reintentar (N)`.
- `reloadRemoteData()` refresca la interfaz tras una importación exitosa.

---

## 12. Modal nativo `<dialog>`: ficha del mentor

### `openMemberModal(memberId)`

```javascript
const openMemberModal = (memberId) => {
  const member = state.members.find(m => m.id === memberId);
  if (!member || !elements.memberModal) return;

  if (elements.dialogMemberInitials) {
    elements.dialogMemberInitials.textContent = member.initials || getInitials(member.name);
  }
  elements.dialogMemberRole.textContent = member.role;
  elements.dialogMemberStatus.textContent = member.status;
  elements.dialogMemberStatus.className = `status-badge ${getStatusBadgeClass(member.status)}`;
  elements.dialogMemberName.textContent = member.name;
  elements.dialogMemberId.textContent = member.id;

  elements.dialogMemberHours.textContent = Number(member.totalHours).toFixed(1);
  elements.dialogMemberTarget.textContent = member.targetHours;

  const percentage = Math.min(100, Math.round((member.totalHours / member.targetHours) * 100));
  elements.dialogProgressTrack.setAttribute('aria-valuenow', String(member.totalHours));
  elements.dialogProgressBar.style.width = `${percentage}%`;

  elements.dialogMemberSemester.textContent = member.semester;
  elements.dialogMemberEmail.textContent = member.email;
  elements.dialogMemberPhone.textContent = member.phone;

  // Render seguro de chips de materias
  elements.dialogMemberSubjects.innerHTML = '';
  member.subjects.forEach(sub => {
    const chip = document.createElement('span');
    chip.className = 'subject-chip';
    chip.setAttribute('role', 'listitem');
    chip.textContent = sub;
    elements.dialogMemberSubjects.appendChild(chip);
  });

  elements.dialogMemberBio.textContent = member.bio;

  if (elements.dialogViewCalendarBtn) {
    elements.dialogViewCalendarBtn.href = `dashboard.html?tutor=${encodeURIComponent(member.userId)}&chapter=${encodeURIComponent(activeChapterId)}`;
  }

  elements.memberModal.showModal();
};
```

- Busca el miembro por matrícula y **reutiliza el mismo modal** para todos.
- En la ficha se muestran **todas** las materias (en la tarjeta solo dos).
- `encodeURIComponent()` — escapa los valores antes de ponerlos en la URL.
- `showModal()` — abre el diálogo de forma modal.

### `closeMemberModal()`

```javascript
const closeMemberModal = () => {
  if (elements.memberModal && elements.memberModal.open) {
    elements.memberModal.close();
  }
};
```

- `.open` — propiedad booleana del `<dialog>`; evita cerrar algo ya cerrado.

---

## 13. Utilidades de horarios

### `minutesFromTime(value)`

Convierte `"HH:MM"` en minutos desde medianoche.

```javascript
const minutesFromTime = (value) => {
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};
```

- `.split(':')` separa horas y minutos; `.map(Number)` los convierte a número.
- Trabajar en minutos simplifica las comparaciones de solapamiento.

### `timeFromMinutes(value)`

Operación inversa: de minutos a `"HH:MM"`.

```javascript
const timeFromMinutes = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
```

- `Math.floor(value / 60)` — horas completas.
- `value % 60` — minutos restantes.
- `.padStart(2, '0')` — rellena con cero a la izquierda (`9` → `09`).

### `overlaps(candidate, existing)`

Detecta si una sesión candidata choca con alguna existente.

```javascript
const overlaps = (candidate, existing) => {
  const candidateStart = minutesFromTime(candidate.start_time);
  const candidateEnd = candidateStart + Math.round(Number(candidate.hours) * 60);
  return existing.some((session) => {
    if (session.id === candidate.id) return false;
    if (session.tutor_id !== candidate.tutor_id || session.session_date !== candidate.session_date) return false;
    const start = minutesFromTime(session.start_time);
    const end = start + Math.round(Number(session.hours) * 60);
    return candidateStart < end && candidateEnd > start;
  });
};
```

- `.some()` — devuelve `true` en cuanto encuentra un choque.
- Se ignora la propia sesión (`session.id === candidate.id`) al editar.
- Solo se comparan sesiones del **mismo tutor** y la **misma fecha**.
- `candidateStart < end && candidateEnd > start` — condición clásica de intersección de intervalos.

### `findNearestFreeTime(session, targetTutorId)`

Busca el hueco libre más cercano en la agenda del tutor destino.

```javascript
const findNearestFreeTime = (session, targetTutorId) => {
  const sourceMinutes = minutesFromTime(session.start_time);
  const candidates = [];
  for (let offset = 0; offset <= 600; offset += 30) {
    if (offset === 0) candidates.push(sourceMinutes);
    else candidates.push(sourceMinutes + offset, sourceMinutes - offset);
  }
  return candidates
    .filter(value => value >= 8 * 60 && value <= 18 * 60)
    .find(value => !overlaps({
      ...session,
      tutor_id: targetTutorId,
      start_time: timeFromMinutes(value)
    }, calendarSessions));
};
```

- `candidates` — horarios probados, alternando hacia adelante y hacia atrás en pasos de 30 minutos, hasta 10 horas.
- `.filter()` — limita la búsqueda a la ventana institucional de 08:00 a 18:00.
- `.find()` — devuelve el primer horario **sin** solapamiento; si no hay ninguno devuelve `undefined`.

---

## 14. Recarga y refresco

### `reloadRemoteData()`

```javascript
const reloadRemoteData = async () => {
  const remoteData = await getRemoteData();
  state.members = remoteData.members;
  state.records = remoteData.records;
  renderMembers();
  populateMemberFilter();
  renderRecords();
};
```

- Vuelve a consultar Supabase, actualiza `state` y repinta las tres vistas.

### `refreshAdmin()`

```javascript
const refreshAdmin = async () => {
  elements.refreshButton?.classList.add('is-loading');
  if (elements.refreshButton) elements.refreshButton.disabled = true;
  try {
    await reloadRemoteData();
    await loadAdminChapterOptions();
    showToast('Datos actualizados.');
  } catch (error) {
    console.error('Error al actualizar administración:', error);
    showToast('No se pudieron actualizar los datos.');
  } finally {
    elements.refreshButton?.classList.remove('is-loading');
    if (elements.refreshButton) elements.refreshButton.disabled = false;
  }
};
```

- Añade la clase `is-loading` y deshabilita el botón mientras carga.
- `finally` restaura el botón aunque ocurra un error.

---

## 15. `applySessionOperation()` — operaciones de calendario

Función central que ejecuta la operación elegida en el gestor. Lanza `Error` cuando la validación falla; el `catch` del formulario muestra el mensaje.

```javascript
const applySessionOperation = async () => {
  const operation = elements.managerOperation.value;
  const tutorId = elements.managerTutor.value;
  const selectedId = elements.managerSession.value;
  const selected = calendarSessions.find(session => session.id === selectedId);

  const requiresSelectedSession = operation === 'edit' || operation === 'delete' || operation === 'swap' || operation === 'send';
  if (requiresSelectedSession && !selected) throw new Error('Selecciona una sesión.');
```

- `operation`, `tutorId`, `selectedId` — valores leídos del formulario.
- `selected` — objeto de la sesión seleccionada.
- Validación previa común a las operaciones que necesitan una sesión.

### Operación `duplicate_week`

```javascript
  if (operation === 'duplicate_week') {
    const tutorSessions = calendarSessions.filter(session => session.tutor_id === tutorId);
    if (!tutorSessions.length) throw new Error('El tutor no tiene sesiones registradas para duplicar.');

    const newSessions = tutorSessions.map(session => {
      const origDate = new Date(session.session_date + 'T00:00:00');
      origDate.setDate(origDate.getDate() + 7);
      const yyyy = origDate.getFullYear();
      const mm = String(origDate.getMonth() + 1).padStart(2, '0');
      const dd = String(origDate.getDate()).padStart(2, '0');
      return {
        chapter_id: activeChapterId,
        tutor_id: tutorId,
        student_name: session.student_name,
        subject: session.subject,
        session_date: `${yyyy}-${mm}-${dd}`,
        start_time: session.start_time,
        hours: session.hours,
        status: 'PENDING'
      };
    });

    const { error } = await supabase.from('tutoring_sessions').insert(newSessions);
    if (error) throw error;
    return;
  }
```

- `+ 'T00:00:00'` — fuerza hora local y evita corrimientos de zona horaria.
- `setDate(getDate() + 7)` — suma siete días; el objeto `Date` ajusta mes y año automáticamente.
- `getMonth() + 1` — los meses de `Date` empiezan en `0`.
- Las copias se crean con estado `PENDING`.

### Operación `reassign_subject`

```javascript
  if (operation === 'reassign_subject') {
    const targetTutorId = elements.managerTargetTutor.value;
    if (!targetTutorId || targetTutorId === tutorId) throw new Error('Selecciona un tutor destino diferente.');
    const subjectToReassign = elements.managerSubject.value.trim();
    if (!subjectToReassign) throw new Error('Ingresa el nombre de la materia a reasignar.');

    const { error } = await supabase
      .from('tutoring_sessions')
      .update({ tutor_id: targetTutorId })
      .eq('chapter_id', activeChapterId)
      .eq('tutor_id', tutorId)
      .ilike('subject', subjectToReassign);
    if (error) throw error;
    return;
  }
```

- `.update({...})` combinado con varios `.eq()` actualiza **en lote**.
- `.ilike()` — comparación de texto insensible a mayúsculas.

### Operación `block_slot`

```javascript
  if (operation === 'block_slot') {
    const payload = {
      chapter_id: activeChapterId,
      tutor_id: tutorId,
      student_name: 'Horario Bloqueado',
      subject: 'BLOQUEADO / INDISPONIBLE',
      session_date: elements.managerDate.value,
      start_time: elements.managerTime.value,
      hours: Number(elements.managerHours.value) || 1,
      status: 'APPROVED'
    };
    if (!payload.session_date || !payload.start_time) {
      throw new Error('Ingresa la fecha y hora a bloquear.');
    }
    const { error } = await supabase.from('tutoring_sessions').insert(payload);
    if (error) throw error;
    return;
  }
```

- `payload` — objeto que se envía a la base de datos.
- El bloqueo se guarda como una sesión especial ya aprobada.
- `|| 1` — duración mínima de una hora por defecto.

### Operación `edit`

```javascript
  if (operation === 'edit') {
    const payload = {
      tutor_id: tutorId,
      student_name: elements.managerStudent.value.trim(),
      subject: elements.managerSubject.value.trim(),
      session_date: elements.managerDate.value,
      start_time: elements.managerTime.value,
      hours: Number(elements.managerHours.value)
    };
    if (!payload.student_name || !payload.subject || !payload.session_date || !payload.start_time) {
      throw new Error('Completa los datos de la sesión.');
    }
    if (overlaps({ ...payload, id: selected.id }, calendarSessions)) {
      throw new Error('El tutor ya tiene una sesión en ese horario.');
    }
    const { error } = await supabase.from('tutoring_sessions').update(payload).eq('id', selected.id);
    if (error) throw error;
  }
```

- Se incluye `id: selected.id` para que `overlaps` no compare la sesión consigo misma.
- `.eq('id', selected.id)` — restringe la actualización a esa fila.

### Operación `add`

```javascript
  if (operation === 'add') {
    const payload = {
      chapter_id: activeChapterId,
      tutor_id: tutorId,
      student_name: elements.managerStudent.value.trim(),
      subject: elements.managerSubject.value.trim(),
      session_date: elements.managerDate.value,
      start_time: elements.managerTime.value,
      hours: Number(elements.managerHours.value),
      status: 'PENDING'
    };
    if (!payload.student_name || !payload.subject || !payload.session_date || !payload.start_time) {
      throw new Error('Completa los datos de la nueva sesión.');
    }
    if (overlaps(payload, calendarSessions)) throw new Error('El tutor ya tiene una sesión en ese horario.');
    const { error } = await supabase.from('tutoring_sessions').insert(payload);
    if (error) throw error;
  }
```

- Idéntica a `edit`, pero con `insert` y estado inicial `PENDING`.

### Operación `delete`

```javascript
  if (operation === 'delete') {
    const { error } = await supabase.from('tutoring_sessions').delete().eq('id', selected.id);
    if (error) throw error;
  }
```

- `.delete()` — elimina la fila indicada por `.eq('id', ...)`.

### Operación `clear`

```javascript
  if (operation === 'clear') {
    const tutorName = state.members.find(member => member.userId === tutorId)?.name || 'este tutor';
    const sessionCount = calendarSessions.filter(session => session.tutor_id === tutorId).length;
    if (!sessionCount) throw new Error(`${tutorName} no tiene sesiones en este capítulo.`);
    if (!window.confirm(`Vas a eliminar ${sessionCount} sesión(es) de ${tutorName}. Esta acción no se puede deshacer. ¿Continuar?`)) {
      throw new Error('Operación cancelada.');
    }
    const { error } = await supabase
      .from('tutoring_sessions')
      .delete()
      .eq('chapter_id', activeChapterId)
      .eq('tutor_id', tutorId);
    if (error) throw error;
  }
```

- `window.confirm()` — confirmación obligatoria antes de un borrado masivo.
- El doble `.eq()` limita el borrado al tutor **dentro del capítulo activo**.

### Operación `swap`

```javascript
  if (operation === 'swap') {
    const target = calendarSessions.find(session => session.id === elements.managerTargetSession.value);
    if (!target || target.id === selected.id) throw new Error('Selecciona otra sesión para intercambiar.');
    const { error } = await supabase.rpc('swap_tutoring_sessions', {
      first_session_id: selected.id,
      second_session_id: target.id
    });
    if (error) throw error;
  }
```

- `supabase.rpc('nombre', params)` — invoca una función almacenada en PostgreSQL.
- El intercambio se hace en el servidor para que sea **atómico** (o se aplican ambos cambios, o ninguno).

### Operación `send`

```javascript
  if (operation === 'send') {
    const targetTutorId = elements.managerTargetTutor.value;
    if (!targetTutorId || targetTutorId === selected.tutor_id) throw new Error('Selecciona otro tutor.');
    const freeMinutes = findNearestFreeTime(selected, targetTutorId);
    if (freeMinutes === undefined) throw new Error('No hay un horario libre para ese tutor entre 08:00 y 18:00.');
    const { error } = await supabase.from('tutoring_sessions').update({
      tutor_id: targetTutorId,
      start_time: timeFromMinutes(freeMinutes)
    }).eq('id', selected.id);
    if (error) throw error;
  }
};
```

- Reasigna la sesión al tutor destino en el hueco libre más cercano.

---

## 16. Delegación de eventos y manejadores

La delegación consiste en escuchar en un contenedor padre en lugar de en cada botón; así los elementos creados dinámicamente funcionan sin volver a registrar oyentes.

### A) Cambio de pestañas

```javascript
if (elements.tabsNav) {
  elements.tabsNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.admin-tab-btn');
    if (!btn) return;

    const targetTab = btn.getAttribute('data-tab-target');
    state.activeTab = targetTab;

    // Botones
    elements.tabButtons.forEach(b => {
      const isActive = (b === btn);
      b.classList.toggle('is-active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Paneles
    elements.panels.forEach(panel => {
      const isTarget = panel.id === `panel-${targetTab}`;
      panel.classList.toggle('is-active', isTarget);
    });
  });
}
```

- `e.target.closest(selector)` — sube por el árbol DOM hasta encontrar el ancestro que coincide.
- `aria-selected` — indica la pestaña activa a lectores de pantalla.
- El panel visible se determina por convención de `id`: `panel-<nombre>`.

### B) Acciones del directorio

```javascript
if (elements.membersGrid) {
  elements.membersGrid.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action="view-member"]');
    if (actionBtn) {
      const memberId = actionBtn.getAttribute('data-member-id');
      openMemberModal(memberId);
      return;
    }

    const manageTutorButton = e.target.closest('[data-action="manage-tutor"]');
    if (manageTutorButton) {
      const tutorUserId = manageTutorButton.getAttribute('data-member-id');
      window.location.href = `dashboard.html?tutor=${encodeURIComponent(tutorUserId)}&chapter=${encodeURIComponent(activeChapterId)}`;
    }
  });
}
```

- Un solo oyente atiende ambos botones gracias a `data-action`.

### Acciones de la tabla

```javascript
if (elements.recordsTable) {
  elements.recordsTable.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="manage-session"]');
    if (button) openSessionManager('', button.getAttribute('data-session-id'));

    const evidenceBtn = event.target.closest('[data-action="view-evidence"]');
    if (evidenceBtn) {
      const path = evidenceBtn.getAttribute('data-path');
      if (path) {
        const { data } = supabase.storage.from('session-evidence').getPublicUrl(path);
        if (data?.publicUrl) {
          window.open(data.publicUrl, '_blank');
        } else {
          showToast('No se pudo obtener la URL de la evidencia.');
        }
      }
    }
  });
}
```

- `supabase.storage.from('bucket').getPublicUrl(ruta)` — genera la URL pública del archivo.
- `window.open(url, '_blank')` — abre la evidencia en una pestaña nueva.

### Eventos del gestor de sesiones

```javascript
elements.managerOperation?.addEventListener('change', refreshManagerVisibility);
elements.managerTutor?.addEventListener('change', refreshManagerSessions);
elements.managerSession?.addEventListener('change', loadSelectedSessionIntoForm);
elements.managerTargetTutor?.addEventListener('change', refreshManagerTargetSessions);
document.getElementById('sessionManagerClose')?.addEventListener('click', () => elements.sessionManagerModal.close());
document.getElementById('sessionManagerCancel')?.addEventListener('click', () => elements.sessionManagerModal.close());

elements.sessionManagerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await applySessionOperation();
    await reloadRemoteData();
    elements.sessionManagerModal.close();
    showToast('Calendario actualizado correctamente.');
  } catch (error) {
    console.error('Error en operación de calendario:', error);
    showToast(error.message || 'No se pudo actualizar el calendario.');
  }
});
```

- `?.addEventListener` — *optional chaining* para no fallar si el elemento no existe.
- `event.preventDefault()` — evita que el formulario recargue la página.
- Los errores lanzados por `applySessionOperation()` se traducen en un toast legible.

### C) Filtro por tutor

```javascript
if (elements.memberFilterSelect) {
  elements.memberFilterSelect.addEventListener('change', (e) => {
    state.filterMember = e.target.value;
    renderRecords();
  });
}
```

### D) Búsqueda en tiempo real

```javascript
if (elements.recordSearchInput) {
  elements.recordSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderRecords();
  });
}
```

- El evento `input` se dispara en cada tecla, a diferencia de `change`.

### E) Ordenamiento por columnas

```javascript
if (elements.recordsTable) {
  const thead = elements.recordsTable.querySelector('thead');
  if (thead) {
    thead.addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (!th) return;

      const sortKey = th.getAttribute('data-sort');
      if (!sortKey) return;

      if (state.sortKey === sortKey) {
        // Alternar dirección
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = sortKey;
        // Por defecto fechas y horas inician desc, texto inicia asc
        state.sortDirection = (sortKey === 'date' || sortKey === 'hours') ? 'desc' : 'asc';
      }

      renderRecords();
    });
  }
}
```

- Si se repite la columna se invierte la dirección; si cambia, se aplica un sentido inicial razonable.

### F) Exportación e importación CSV

```javascript
if (elements.btnExportCSV) elements.btnExportCSV.addEventListener('click', exportToCSV);
if (elements.btnImportCSV) elements.btnImportCSV.addEventListener('click', openCSVImportModal);
if (elements.csvImportClose) elements.csvImportClose.addEventListener('click', closeCSVImportModal);
if (elements.csvImportCancel) elements.csvImportCancel.addEventListener('click', closeCSVImportModal);
if (elements.csvFileInputDialog) elements.csvFileInputDialog.addEventListener('change', handleCSVFileSelection);
if (elements.csvImportConfirm) elements.csvImportConfirm.addEventListener('click', confirmCSVImport);

if (elements.csvImportModal) {
  elements.csvImportModal.addEventListener('click', (e) => {
    if (isImporting) return;
    const surface = elements.csvImportModal.querySelector('.admin-dialog__surface');
    if (surface && !surface.contains(e.target)) {
      closeCSVImportModal();
    }
  });

  elements.csvImportModal.addEventListener('cancel', (e) => {
    if (isImporting) {
      e.preventDefault();
    }
  });
}
```

- `surface.contains(e.target)` — determina si el clic ocurrió dentro del contenido; si fue fuera (backdrop), se cierra.
- El evento `cancel` del `<dialog>` se dispara con la tecla **Escape**; se bloquea durante la importación.

### G) Cierre del modal de ficha

```javascript
if (elements.dialogCloseBtn) elements.dialogCloseBtn.addEventListener('click', closeMemberModal);
if (elements.dialogCloseFooterBtn) elements.dialogCloseFooterBtn.addEventListener('click', closeMemberModal);

// Cierre al hacer clic en el backdrop fuera de la superficie del diálogo
if (elements.memberModal) {
  elements.memberModal.addEventListener('click', (e) => {
    const surface = elements.memberModal.querySelector('.admin-dialog__surface');
    if (surface && !surface.contains(e.target)) {
      closeMemberModal();
    }
  });
}
```

---

## 17. Inicialización de la aplicación

### `init()`

```javascript
const init = async () => {
  await loadAdminChapterOptions();
  const remoteData = await getRemoteData();
  state.members = remoteData.members;
  state.records = remoteData.records;
  renderMembers();
  populateMemberFilter();
  renderRecords();
};
```

Orden de arranque: opciones de capítulo → datos remotos → estado → render.

### Eventos globales

```javascript
elements.chapterSelect?.addEventListener('change', () => {
  const chapterId = elements.chapterSelect.value;
  if (chapterId) window.location.href = `admin.html?chapter=${encodeURIComponent(chapterId)}`;
});
elements.refreshButton?.addEventListener('click', refreshAdmin);

document.querySelectorAll('[data-action="logout"]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    signOut();
  });
});
```

- Cambiar de capítulo recarga la página con el nuevo parámetro en la URL.
- Todos los elementos con `data-action="logout"` cierran sesión con `signOut()`.

### Arranque y temporizador lógico

```javascript
let adminLogicalTimer = null;
try {
  await init();
  adminLogicalTimer = initLogicalTimer({
    checkIntervalMs: 60000,
    supabase,
    chapterId: activeChapterId
  });
  adminLogicalTimer.start();
} catch (error) {
  console.error('Error cargando administración desde Supabase:', error);
  showToast('No se pudieron cargar los datos del capítulo.');
}

window.addEventListener('beforeunload', () => {
  adminLogicalTimer?.stop();
});
```

- `adminLogicalTimer` — instancia del temporizador lógico del panel.
- `checkIntervalMs: 60000` — revisa cada 60 segundos.
- `.start()` / `.stop()` — inician y detienen el ciclo.
- `beforeunload` — libera el temporizador al abandonar la página, evitando fugas de memoria.

---

## 18. Resumen de funciones

### Autorización y datos

- `enforceAdminAuthorization()` — valida sesión y rol `ADMIN`.
- `getRemoteData()` — descarga y normaliza miembros y sesiones.
- `loadAdminChapterOptions()` — llena el selector de capítulos.
- `reloadRemoteData()` — recarga datos y repinta la interfaz.
- `refreshAdmin()` — recarga con indicador visual y avisos.

### Utilidades

- `showToast(message)` — notificación temporal.
- `getStatusBadgeClass(status)` — clase CSS del estado.
- `getInitials(name)` — iniciales del avatar.
- `formatSessionLabel(session)` — etiqueta legible de una sesión.
- `minutesFromTime(value)` / `timeFromMinutes(value)` — conversión hora ↔ minutos.
- `overlaps(candidate, existing)` — detección de choques de horario.
- `findNearestFreeTime(session, targetTutorId)` — busca hueco libre.

### Renderizado

- `renderMembers()` — tarjetas del directorio.
- `populateMemberFilter()` — opciones del filtro.
- `getProcessedRecords()` — filtra, busca y ordena.
- `updateSortIndicators()` — atributos `aria-sort`.
- `renderRecords()` — tabla de bitácora y KPI.

### Modales

- `openMemberModal(memberId)` / `closeMemberModal()` — ficha del mentor.
- `openSessionManager(tutorId, sessionId)` — gestor de calendario.
- `refreshManagerSessions()`, `refreshManagerTargetSessions()`, `refreshManagerVisibility()`, `loadSelectedSessionIntoForm()` — sincronización del formulario.
- `openCSVImportModal()` / `closeCSVImportModal()` — modal de importación.

### Operaciones

- `applySessionOperation()` — ejecuta `add`, `edit`, `delete`, `duplicate_week`, `reassign_subject`, `block_slot`, `clear`, `swap` y `send`.
- `exportToCSV()` — exporta lo filtrado.
- `handleCSVFileSelection(event)` — lee y valida el archivo.
- `confirmCSVImport()` — inserta las sesiones válidas.
- `init()` — arranque del módulo.

---

## 19. Variables principales

- `currentAdmin` — perfil del administrador en sesión.
- `activeChapterId` — capítulo activo.
- `calendarSessions` — sesiones crudas usadas por el gestor.
- `state` — estado central de la interfaz.
- `elements` — referencias al DOM.
- `toastTimeout` — temporizador del toast.
- `pendingImportSessions` — sesiones pendientes de importar.
- `isImporting` — bandera de importación en curso.
- `adminLogicalTimer` — temporizador lógico del panel.

---

## 20. Buenas prácticas presentes en el módulo

- **Renderizado seguro:** se usa `textContent` y `document.createElement` en lugar de `innerHTML` con datos del usuario, evitando XSS.
- **Rendimiento:** `DocumentFragment` para inserciones masivas, `Map` para búsquedas O(1) y `Promise.all` para consultas paralelas.
- **Accesibilidad:** `aria-hidden`, `aria-selected`, `aria-sort`, `role="progressbar"`, `aria-valuenow`, `<time datetime>`.
- **Delegación de eventos:** un oyente por contenedor, compatible con contenido dinámico.
- **Estado único:** todo el renderizado se deriva de `state`.
- **Manejo de errores:** `try / catch / finally`, mensajes al usuario vía toast y detalle técnico en consola.
- **Confirmación de acciones destructivas:** `window.confirm()` antes de borrados masivos.
