# Plantillas para reportar bugs

Usa la plantilla corta si solo necesitas avisar de un problema. Usa la plantilla detallada si el error impide trabajar o se puede reproducir.

## Plantilla rápida para usuarios

**Título:** [Qué salió mal]

**Página:** login / hub / dashboard / perfil / administración

**Qué intentaba hacer:**

> Ejemplo: Registrar una sesión de 2 horas para el martes.

**Qué ocurrió:**

> Ejemplo: Después de guardar, la sesión no apareció en el calendario.

**Qué esperaba:**

> Ejemplo: Que la sesión apareciera y conservara las 2 horas.

**Cuándo ocurrió:**

> Fecha y hora aproximadas:

**Captura de pantalla o mensaje visible:**

> No incluyas contraseñas, tokens, claves de Supabase ni datos personales innecesarios.

## Plantilla detallada para soporte

**Título:** [Área] Descripción breve del problema

**Severidad:**

- [ ] Bloquea el acceso o borra datos.
- [ ] Impide una tarea importante.
- [ ] Funciona, pero muestra un resultado incorrecto.
- [ ] Problema visual o de texto.

**Usuario afectado:** tutor / admin / todos

**Página y URL:**

> Ejemplo: `dashboard.html?chapter=...`

**Entorno:**

- Navegador y versión:
- Sistema operativo:
- Escritorio o móvil:
- Fecha y hora:

**Pasos para reproducir:**

1.
2.
3.

**Resultado actual:**

**Resultado esperado:**

**Datos de prueba relevantes:**

> Usa identificadores ficticios. No pegues contraseñas, claves API, tokens ni información privada de alumnos.

**Mensaje de consola o red:**

```text
Pega aquí únicamente el error relevante.
```

**Capturas o vídeo:**

**¿Ocurre siempre?:** sí / no / a veces

**¿Qué cambió recientemente?:**

## Plantilla específica para sesiones y horas

**Tutor afectado:**

**Capítulo:**

**Operación:** agregar / editar / eliminar / limpiar / intercambiar / enviar

**Sesión o sesiones afectadas:**

- Fecha:
- Hora:
- Materia:
- Duración:

**Problema:**

> Ejemplo: El tutor tiene 9 horas en la base de datos, pero el perfil muestra 45.

**Comprobación en Supabase, si está disponible:**

```sql
select id, tutor_id, session_date, start_time, hours
from public.tutoring_sessions
where tutor_id = 'UUID_DEL_TUTOR'
order by session_date desc, start_time desc;
```

## Checklist antes de enviar

- [ ] Expliqué qué intentaba hacer.
- [ ] Escribí los pasos exactos.
- [ ] Incluí lo esperado y lo observado.
- [ ] Indiqué usuario, página y navegador.
- [ ] Quité contraseñas, tokens, claves y datos privados.
- [ ] Adjunté el mensaje de error o una captura cuando fue posible.
