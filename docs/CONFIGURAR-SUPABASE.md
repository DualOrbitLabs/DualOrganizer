# Configurar Supabase para DualOrganizer

Esta guía está escrita para dos personas que nunca han usado SQL. No necesitan memorizar SQL: copiarán una migración preparada y aprenderán a reconocer qué está pasando.

## 1. Qué estamos construyendo

Supabase será el servidor de datos de DualOrganizer:

- **PostgreSQL** guarda usuarios, perfiles, capítulos y sesiones.
- **Auth** gestiona correos, contraseñas, sesiones y recuperación de acceso.
- **Storage** guarda evidencias PDF/JPG/PNG.
- **RLS** (Row Level Security) decide qué filas puede ver o cambiar cada usuario.

La aplicación usa Supabase como fuente de verdad para Auth, perfiles, capítulos, membresías y sesiones. El navegador solo conserva temporalmente la sesión interna que gestiona el cliente oficial de Supabase.

## 2. Crear el proyecto

1. Entren en [supabase.com](https://supabase.com) y creen una cuenta.
2. Pulsen **New project**.
3. Pongan un nombre como `dualorganizer-dev`.
4. Guarden la contraseña de la base de datos en un gestor de contraseñas. No la suban a Git.
5. Elijan la región más cercana a sus usuarios.
6. Esperen a que el proyecto termine de provisionarse.

Para trabajar en equipo, una persona crea el proyecto y añade a la otra desde **Project Settings > Members**. No compartan la contraseña principal.

## 3. Ejecutar la base de datos

1. Abran **SQL Editor > New query**.
2. Abran `supabase/migrations/001_initial_schema.sql` en VS Code.
3. Copien todo el contenido en el editor de Supabase.
4. Pulsen **Run**.
5. Si termina sin error, revisen **Table Editor**. Deben aparecer `profiles`, `chapters`, `chapter_members`, `tutoring_sessions` y `session_evidence`.

Si ya ejecutaron una versión anterior de `001_initial_schema.sql`, ejecuten también `supabase/migrations/002_complete_persistence.sql`. No borren las tablas: esa segunda migración actualiza las políticas de seguridad y el acceso al bucket.

Si ejecutaron la versión anterior de `002_complete_persistence.sql`, ejecuten además `supabase/migrations/003_new_database.sql`. Esta migración añade el intercambio atómico de sesiones y permite que administración cree sesiones para otros tutores del mismo capítulo. No borra datos.

Si ejecutaron `003_new_database.sql`, ejecuten también `supabase/migrations/004_security_hardening.sql`. Esta migración limita funciones privilegiadas a usuarios autenticados, fuerza el bucket de evidencias a privado y protege campos sensibles del perfil. El registro nuevo exige contraseñas de al menos 12 caracteres con mayúsculas, minúsculas, número y símbolo. Supabase Auth gestiona el hash de la contraseña en el servidor; la aplicación nunca guarda ni calcula hashes.

### SQL explicado sin drama

- Una **tabla** es una hoja de cálculo para un tipo de cosa.
- Una **fila** es un registro, por ejemplo una sesión.
- Una **columna** es un dato, por ejemplo `hours`.
- Una **clave primaria** identifica una fila sin repetirla.
- Una **clave foránea** conecta una fila con otra tabla.
- `select` lee, `insert` crea, `update` modifica y `delete` elimina.
- Una **política RLS** es una regla que se aplica en el servidor, incluso si alguien manipula el navegador.

No borren ni cambien políticas RLS sin entenderlas. Son parte de la seguridad, no solo configuración.

## 4. Crear el primer usuario administrador

También pueden usar el flujo normal de la aplicación: en `login.html`, pulsen **Crear cuenta de tutor**. Esa cuenta se crea como `TUTOR`. Después de confirmar el correo e iniciar sesión, creen un capítulo desde el hub; el trigger SQL convertirá automáticamente al creador en `ADMIN` y el enlace del capítulo abrirá el panel administrativo.

1. Vayan a **Authentication > Users > Add user**.
2. Creen su cuenta con un correo real y una contraseña temporal.
3. Confirmen el correo si el proyecto lo solicita.
4. En **SQL Editor**, ejecuten esto reemplazando el correo:

```sql
update public.profiles
set role = 'ADMIN'
where id = (
  select id from auth.users where email = 'admin@institucion.edu'
);
```

Este es el único paso inicial que cambia un rol directamente. Después, un administrador puede gestionar membresías, pero la app no permite que un usuario se convierta en admin editando el navegador.

Cuando un usuario cree un capítulo desde la app, el esquema lo añadirá automáticamente como administrador de ese capítulo. El rol global `ADMIN` sigue siendo necesario para entrar al panel administrativo global.

El registro público siempre crea un usuario `TUTOR`. Cuando ese tutor crea su primer capítulo, el trigger SQL cambia su perfil a `ADMIN` y lo añade como administrador del capítulo. Desde entonces puede abrir el panel de administración **y conserva todas las capacidades de tutor**: puede entrar al dashboard, registrar horas, editar sesiones y subir evidencias. Un tutor que solo se une a capítulos no obtiene permisos de administración.

## 5. Configurar la aplicación

1. Copien `.env.example` como `.env.local`.
2. En Supabase abran **Project Settings > API**.
3. Copien **Project URL** en `VITE_SUPABASE_URL`.
4. Copien la clave pública **Publishable key** o la clave antigua `anon` en `VITE_SUPABASE_ANON_KEY`.
5. Nunca copien `service_role` en `.env.local` usado por Vite. Esa clave ignora RLS y solo pertenece a un servidor privado.
6. Instalen dependencias:

```powershell
npm install
```

El cliente de Supabase ya está integrado en las páginas. No intenten usar consultas desde HTML directamente.

## 6. Crear el bucket de evidencias

1. Abran **Storage > New bucket**.
2. Usen exactamente el nombre `session-evidence`.
3. Dejen **Public bucket** desactivado.
4. Mantengan el límite de 5 MB y los tipos PDF, JPG y PNG en la interfaz.

La migración guarda la ruta del archivo en la tabla, no el archivo dentro de PostgreSQL. El bucket debe permanecer privado y la app pedirá URLs temporales cuando tenga la integración terminada.

## 7. Cómo trabajaremos con migraciones

Una migración es un archivo SQL que describe un cambio de la base de datos. No editen una migración que ya se ejecutó en el proyecto compartido. Para un cambio nuevo, creen otro archivo con el siguiente número:

```text
supabase/migrations/002_add_session_notes.sql
```

Flujo de trabajo:

1. Probar el SQL en un proyecto personal de desarrollo.
2. Revisar las políticas RLS con dos cuentas distintas.
3. Compartir el archivo y revisarlo entre ambos.
4. Ejecutarlo en el proyecto compartido.
5. Probar la interfaz después de la migración.

## 8. Prueba mínima de seguridad

Creen un tutor y un admin. Comprueben que:

- El tutor puede ver y editar sus propias sesiones.
- El tutor no puede leer sesiones de otro tutor.
- El admin puede consultar los datos de su capítulo.
- Cambiar `role` en DevTools no concede permisos.
- Cerrar sesión elimina el acceso a las consultas protegidas.

Si alguna prueba falla, detengan la integración y revisen las políticas antes de añadir más código.

## 9. Errores habituales

### `relation does not exist`

La migración no se ejecutó completa o se ejecutó en otro proyecto. Vuelvan a **Table Editor** y comprueben las tablas.

### `new row violates row-level security policy`

La sesión no está autenticada o la fila no cumple la política. Revisen que el usuario esté conectado y que `tutor_id` coincida con su usuario actual.

### La clave aparece en Git

Detengan el trabajo, eliminen el archivo del repositorio y roten la clave desde Supabase. `.env.local` debe estar ignorado por Git.

### Quieren empezar de cero

Solo en el proyecto de desarrollo: eliminen y vuelvan a crear el proyecto o borren las tablas desde SQL Editor. Nunca hagan esto en producción para “probar algo”.

## 10. Checklist antes de producción

- [ ] El proyecto de producción es distinto del proyecto de desarrollo.
- [ ] No hay contraseñas ni `service_role` en el repositorio.
- [ ] La política de contraseñas de Supabase Auth exige al menos 12 caracteres.
- [ ] Las funciones `SECURITY DEFINER` no son ejecutables por `anon`.
- [ ] Auth, recuperación de contraseña y logout funcionan.
- [ ] Todas las tablas tienen RLS activado.
- [ ] El bucket de evidencias es privado.
- [ ] Un tutor no puede consultar otro tutor.
- [ ] Un usuario no puede elevarse a admin desde el navegador.
- [x] Los datos de perfiles, capítulos y sesiones no dependen de `localStorage`.
- [ ] `npm run build` termina correctamente.

## 11. Configurar Correos (Verificación y Recuperación)

Para que el registro y la recuperación de contraseña funcionen, debes configurar los ajustes de correo en Supabase:

1. Ve a **Authentication > URL Configuration**.
2. En **Site URL**, escribe la URL base de tu aplicación. 
   - Durante desarrollo local con VS Code Live Server, esto suele ser `http://localhost:5500` o `http://127.0.0.1:5500`.
   - Cuando publiques la app, cámbialo a la URL real (ej. `https://tu-dominio.com`).
3. Ve a **Authentication > Providers** y asegúrate de que **Email** está habilitado.
   - Enciende **Confirm email** para obligar a los usuarios a confirmar su cuenta antes de iniciar sesión.
   - Enciende **Secure email change** si quieres que confirmen el cambio de correo.
4. En **Authentication > Email Templates**, puedes personalizar el mensaje que reciben los usuarios. Asegúrate de que las plantillas de **Confirm signup** y **Reset password** tengan un enlace claro y profesional. No cambies la variable `{{ .ConfirmationURL }}`, ya que es el enlace mágico que Supabase necesita.