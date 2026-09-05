Actúa como un desarrollador web frontend senior y experto en arquitectura de software.

Tu tarea es generar el código fuente completo, modular y listo para producción (HTML5 semántico, CSS3 moderno y Vanilla JavaScript) para un dashboard de gestión y registro de sesiones académicas.

---

### Requisitos del Sistema y Arquitectura

1. **Estructura y Tecnologías:**
   - Exclusivamente **HTML5, CSS3 y JavaScript plano (Vanilla JS)**, sin dependencias ni librerías externas.
   - Código dividido limpiamente en 3 archivos: `index.html`, `styles.css` y `app.js`.
   - Código extensamente comentado explicando la función de cada bloque, variable y método.

2. **Modelo de Datos (Persistencia y Enfoque NoSQL / CSV):**
   - El estado local debe manejarse mediante una colección de objetos en memoria (simulando documentos NoSQL) con la siguiente estructura base:
     `{ id: string, studentName: string, subject: string, hours: number, date: string, createdAt: string }`
   - Implementar un módulo específico para serializar esta colección y permitir la exportación directa a un archivo descargable en formato **CSV**.
   - Modularizar las funciones de almacenamiento para que a futuro puedan desacoplarse hacia un backend o base de datos documental (Firestore/MongoDB).

3. **Componentes de Interfaz (UI):**
   - **Navbar superior:** Fija, con el nombre/marca del sistema, espacio reservado para extensiones/navegación futura y un botón para disparar la exportación del CSV.
   - **Sidebar colapsable (Panel lateral):** 
     - Contiene un widget o selector de calendario/fecha.
     - Debe incluir un botón toggle para ocultar o mostrar el sidebar suavemente con transiciones CSS (`collapse`/`expand`).
     - Al interactuar con el calendario, debe filtrar reactivamente las sesiones visibles en la tabla principal por fecha.
   - **Métricas rápidas (KPIs):** Bloque superior de tarjetas que muestre en tiempo real: total de horas acumuladas y número total de sesiones registradas.
   - **Formulario de Registro:** Campos para Alumno, Materia, Horas (admite decimales) y Fecha, con validaciones estándar de formulario.
   - **Tabla de Visualización (Extensión del registro):** Tabla dinámica que refleje las sesiones en tiempo real al registrarse, con columnas legibles e identificador único.

---

### Entregables Esperados:
1. **Resumen de la solución:** Breve explicación de cómo interactúa el script entre el estado NoSQL en memoria, el DOM y la exportación de datos.
2. **Archivos de código:**
   - `index.html`: Estructura semántica completa.
   - `styles.css`: Estilos modernos (Flexbox/CSS Grid), variables CSS y clases de animación/colapso.
   - `app.js`: Manejadores de eventos, manipulación del DOM, lógica de filtrado del calendario y función generadora de CSV usando `Blob`.
3. **Instrucciones de integración:** Pasos detallados para ejecutar y probar la aplicación localmente.