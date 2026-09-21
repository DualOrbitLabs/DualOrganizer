# DualOrganizer: arquitectura y guia de mantenimiento

## 1. Proposito

DualOrganizer es una aplicacion web multipagina para gestionar tutorias academicas:

- autenticacion y recuperacion de acceso con Supabase Auth;
- perfiles de tutores y disponibilidad;
- capitulos o espacios institucionales;
- calendarios semanales de sesiones;
- bitacoras, evidencias y exportacion CSV;
- administracion de tutores y sesiones;
- terminos de uso y aviso de privacidad.

La interfaz usa HTML, CSS y JavaScript ES modules sin framework de frontend. Supabase es la fuente de verdad para usuarios, perfiles, capitulos, membresias, sesiones y evidencias.

## 2. Inicio rapido

Requisitos:

- Node.js compatible con las versiones instaladas de Vite y Supabase.
- Un proyecto Supabase configurado.
- Un archivo `.env.local` basado en `.env.example`.

Comandos:

```powershell
npm install
npm run dev
npm run build
```

`npm run dev` inicia Vite. Las paginas se abren directamente desde la raiz, por ejemplo `http://localhost:5173/login.html`. `npm run build` comprueba el entrypoint de Vite y los modulos que este importa.

No se debe publicar `.env.local` ni copiar una clave `service_role` al navegador. La configuracion detallada de Supabase esta en [CONFIGURAR-SUPABASE.md](CONFIGURAR-SUPABASE.md).

## 3. Mapa de paginas

| Pagina | Proposito | Modulo principal |
| --- | --- | --- |
| `index.html` | Pagina publica y presentacion del producto. | Ninguno |
| `login.html` | Inicio de sesion, registro y recuperacion de contrasena. | `js/login.js` |
| `terms.html` | Terminos y condiciones y aviso de privacidad. | Ninguno |
| `hub.html` | Lista, creacion y union a capitulos. | `js/hub.js` |
| `dashboard.html` | Calendario semanal, sesiones, KPIs y CSV. | `js/dashboard.js` |
| `profile.html` | Datos personales, materias, disponibilidad y progreso mensual. | `js/profile.js` |
| `admin.html` | Directorio, bitacora, filtros y operaciones administrativas. | `js/admin.js` |

Las paginas protegidas redirigen a `login.html` si no existe una sesion valida. La autorizacion real no depende del HTML ni de los controles del navegador: las politicas RLS de Supabase son la barrera principal.

## 4. Modulos JavaScript

### `js/config.js`

Es el punto central para parametros de producto:

- `branding`: nombre, organizacion y correo de soporte.
- `academic.monthlyTargetHours`: objetivo mensual mostrado en progreso y administracion.
- `academic.calendarStartHour` y `calendarEndHour`: limites de la cuadricula.
- `academic.calendarRowHeightPx`: altura base usada para que una sesion larga cubra sus horas.
- `uploads.maxBytes` y `allowedMimeTypes`: restricciones de evidencias.
- `legal.termsPath`: ruta de la pagina legal.

`isDateInCurrentMonth(dateValue, referenceDate)` realiza el reinicio mensual logico. No borra sesiones: solo identifica las fechas que pertenecen al mes actual.

### `js/supabaseClient.js`

Crea el cliente de Supabase con variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Exporta:

- `supabase`: cliente o `null` si faltan variables.
- `supabaseConfigError`: mensaje de configuracion ausente.
- `getAuthenticatedUser()`: usuario autenticado actual.
- `getCurrentProfile(userId)`: perfil de la tabla `profiles`.
- `signOut()`: cierra sesion y vuelve al login.

La sesion se persiste, renueva tokens automaticamente y acepta enlaces de recuperacion.

### `js/login.js`

Gestiona las pestañas de rol, validaciones de identificador y contrasena, visibilidad de contrasena, registro con `auth.signUp`, login con `auth.signInWithPassword` y recuperacion con `resetPasswordForEmail`.

El registro publico crea siempre un usuario `TUTOR`. La conversion a `ADMIN` al crear el primer capitulo ocurre en el trigger SQL, no en el navegador.

### `js/hub.js`

Carga las membresias del usuario y las relaciona con `chapters`. Permite:

- entrar al dashboard de un capitulo;
- crear un capitulo nuevo;
- unirse a un capitulo por codigo;
- elegir un capitulo principal;
- mostrar tarjetas y mensajes accesibles.

El catalogo `AVAILABLE_CATALOG` contiene codigos demo disponibles para unirse. Los capitulos creados por un usuario se guardan en Supabase y el trigger `add_chapter_creator_as_admin` crea su membresia administrativa.

### `js/dashboard.js`

Es el flujo principal de sesiones:

1. exige un usuario autenticado;
2. determina el capitulo activo;
3. carga `tutoring_sessions`;
4. transforma columnas SQL a nombres de interfaz con `mapSession`;
5. calcula KPIs del mes actual;
6. renderiza la cuadricula semanal;
7. crea, edita y elimina sesiones;
8. valida solapamientos por fecha, hora y duracion;
9. valida y sube evidencias;
10. exporta registros CSV con BOM UTF-8 y mitigacion de formula injection.

Una sesion se dibuja en su hora de inicio. Su elemento `.session-item` recibe `--session-duration` y CSS calcula una altura equivalente a varias filas. La duracion sigue siendo un dato numerico de Supabase; la representacion visual no duplica la sesion en cada hora.

Las horas acumuladas y el promedio semanal usan solamente sesiones del mes actual. La tabla de sesiones completa permanece disponible para navegacion y exportacion.

### `js/profile.js`

Carga el perfil y las sesiones del usuario. Muestra horas y sesiones del mes actual, usando `APP_CONFIG.academic.monthlyTargetHours` para el progreso. Tambien implementa:

- chips de materias;
- deteccion de cambios sin guardar;
- restauracion de cambios;
- validacion de enlaces HTTPS de Meet, Zoom, Teams y Webex;
- guardado de campos permitidos del perfil;
- navegacion por pestañas;
- cierre de sesion y acciones de interfaz.

### `js/admin.js`

Protege la pagina con el rol global `ADMIN` y carga el capitulo administrativo activo. Mantiene un estado local con `members` y `records` para renderizar:

- tarjetas de tutores y progreso mensual;
- KPIs institucionales;
- bitacora filtrable y ordenable;
- exportacion CSV;
- modal de gestion de sesiones;
- operaciones de agregar, editar, eliminar, limpiar, enviar e intercambiar sesiones.

Los registros historicos se conservan en la bitacora, pero `totalHours` por tutor y el KPI de horas se calculan con fechas del mes actual.

## 5. Flujo de datos

```text
login.html
  -> Supabase Auth
  -> hub.html
  -> chapter_members + chapters
  -> dashboard.html / admin.html
  -> tutoring_sessions
  -> profile.html
  -> profiles + tutoring_sessions
```

Para una sesion con evidencia:

```text
dashboard.js
  -> Storage bucket privado: session-evidence
  -> session_evidence.storage_path
  -> tutoring_sessions.evidence_path
```

El navegador solo mantiene el estado de pantalla y la sesion gestionada por Supabase. No existe una capa de `localStorage` como fuente de datos.

## 6. Modelo de datos

### `profiles`

Perfil asociado uno a uno con `auth.users`. Guarda nombre, rol, identificador institucional, telefono, semestre, materias, disponibilidad, horario, enlace de reunion y timestamps.

### `chapters`

Espacio institucional. Guarda codigo unico, nombre, institucion, departamento, descripcion y creador.

### `chapter_members`

Relacion muchos-a-muchos entre usuarios y capitulos. Guarda rol de membresia, indicador de capitulo principal y fecha de incorporacion.

### `tutoring_sessions`

Bitacora de sesiones. Guarda capitulo, tutor, alumno, materia, fecha, hora de inicio, horas, estado, evidencia y timestamps. `hours` debe ser mayor que cero y no superar 24.

### `session_evidence`

Metadatos de archivos asociados a sesiones. Guarda ruta de Storage, nombre, MIME, tamano y usuario que subio el archivo. El archivo real no se almacena en PostgreSQL.

## 7. Migraciones

Ejecutar en orden, una sola vez por entorno:

1. `001_initial_schema.sql`: tipos, tablas, indices, triggers, funciones RLS y politicas iniciales.
2. `002_complete_persistence.sql`: persistencia completa, politicas de insercion administrativa, bucket privado y funcion de intercambio.
3. `003_new_database.sql`: actualiza la insercion administrativa y reitera el intercambio atomico.
4. `004_security_hardening.sql`: limita ejecucion de funciones `SECURITY DEFINER`, fuerza Storage privado y protege campos sensibles del perfil.

No se deben editar migraciones ya ejecutadas. Cualquier cambio nuevo debe ser un archivo numerado posterior.

## 8. Seguridad

- Auth valida identidad y administra contrasenas.
- RLS limita perfiles, membresias, sesiones y evidencias.
- Un tutor solo puede trabajar con sus sesiones; un admin puede operar dentro de su capitulo segun las politicas.
- Cambiar `role` en DevTools no concede permisos.
- Las funciones con `SECURITY DEFINER` fijan `search_path` y la migracion final revoca acceso anonimo.
- El bucket `session-evidence` debe ser privado.
- Las evidencias se limitan a PDF, JPG y PNG y a 5 MB desde configuracion y SQL.
- Los nombres de archivo se sanitizan antes de construir rutas.
- Las exportaciones CSV escapan valores que podrian interpretarse como formulas.
- Los textos insertados como HTML pasan por funciones de escape en los renderizadores dinamicos.

## 9. Estilos y recursos

- `styles/navbar.css`: barra de navegacion compartida y fuentes.
- `styles/index.css`: pagina publica.
- `styles/login.css`: login y dialogos de autenticacion.
- `styles/hub.css`: portal de capitulos.
- `styles/dashboard.css`: calendario, sesiones, modal y KPIs.
- `styles/profile.css`: perfil, formularios, tabs y progreso.
- `styles/admin.css`: panel administrativo, tabla y dialogos.
- `styles/legal.css`: pagina de terminos y privacidad.
- `global/`: logos e instalaciones de Avenir.

Las paginas reutilizan la barra global y variables CSS locales. Los componentes dinamicos se crean con DOM APIs o plantillas HTML escapadas.

## 10. Cambios habituales

### Cambiar la meta mensual

Editar `academic.monthlyTargetHours` en `js/config.js`. Dashboard, perfil y admin consumen ese valor para calculos y progreso. Revisar tambien cualquier texto estatico de HTML si se cambia la cifra visible.

### Cambiar horario del calendario

Editar `calendarStartHour`, `calendarEndHour` y, si hace falta, `calendarRowHeightPx` en `js/config.js`. El dashboard aplica estos valores al renderizar la cuadricula.

### Cambiar limites de evidencias

Editar `uploads` en `js/config.js` y mantener sincronizados el limite/tipos del bucket de Supabase y la restriccion SQL de `session_evidence.file_size`.

### Agregar un campo de perfil

1. Crear una migracion SQL.
2. Añadir el control a `profile.html`.
3. Cargar y guardar el campo en `js/profile.js`.
4. Revisar la politica RLS de perfiles.
5. Probar con un tutor y un admin.

### Agregar una operacion administrativa

Mantener la operacion en `js/admin.js`, validar permisos en Supabase y actualizar el formulario de `admin.html`. Las operaciones que afecten a dos sesiones deben usar una funcion SQL transaccional, como `swap_tutoring_sessions`.

## 11. Checklist de prueba

- [ ] `npm install` termina sin errores.
- [ ] `npm run build` termina correctamente.
- [ ] Un visitante sin sesion vuelve a `login.html`.
- [ ] Login, registro y recuperacion muestran errores utiles.
- [ ] Un tutor puede crear, editar y eliminar sus sesiones.
- [ ] Una sesion de 1.5 o 2 horas cubre visualmente sus filas.
- [ ] Una sesion antigua no incrementa el KPI del mes actual.
- [ ] El perfil y admin muestran el mismo objetivo mensual configurado.
- [ ] Un tutor no puede leer sesiones de otro tutor.
- [ ] Un admin puede gestionar solo su capitulo.
- [ ] La evidencia supera las validaciones de tipo y tamano.
- [ ] CSV abre correctamente y no ejecuta formulas introducidas como texto.
- [ ] La pagina legal es accesible desde inicio y login.
