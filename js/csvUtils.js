/**
 * js/csvUtils.js
 * DualOrganizer - Módulo de Utilidades CSV para Importación, Exportación y Respaldos
 *
 * Cumple con:
 * - RFC 4180 (manejo de comillas dobles, comas, saltos de línea internos, CRLF)
 * - Protección contra CSV Formula Injection (DDE) sanitizando prefijos =, +, -, @, \t, \r con '
 * - Codificación UTF-8 con BOM (\uFEFF) para compatibilidad nativa con Microsoft Excel y hojas de cálculo
 * - Exportaciones independientes para Tutores (personal) y Capítulos (administración)
 * - Generador de respaldos mensuales completos
 * - Validador de esquemas de importación de sesiones
 */

/** Prefijo UTF-8 Byte Order Mark para compatibilidad con Excel */
export const UTF8_BOM = '\uFEFF';

/**
 * Sanitiza una celda CSV mitigando ataques de Formula Injection (CSV Injection / DDE).
 * Si el contenido comienza con '=', '+', '-', '@', '\t' o '\r', se antepone un apóstrofe (').
 * Además, dobla las comillas internas y envuelve la celda en comillas dobles según RFC 4180.
 *
 * @param {*} val - Valor a sanitizar
 * @returns {string} Celda formateada y protegida
 */
export function sanitizeCSVCell(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str) || /^\s*[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Deshace el prefijo de escape de fórmula si la celda fue protegida previamente.
 * Útil para recuperar el valor original al importar.
 *
 * @param {string} val
 * @returns {string}
 */
export function unescapeFormulaPrefix(val) {
  if (typeof val !== 'string') return val;
  if (val.startsWith("'") && /^\s*[=+\-@\t\r]/.test(val.slice(1))) {
    return val.slice(1);
  }
  return val;
}

/**
 * Valida si un string representa una fecha de calendario válida (YYYY-MM-DD).
 * Rechaza fechas imposibles como 2026-02-31.
 *
 * @param {string} dateStr
 * @returns {boolean}
 */
export function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return false;
  }
  const [year, month, day] = dateStr.trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Valida si un string representa una hora válida en formato HH:MM o HH:MM:SS.
 *
 * @param {string} timeStr
 * @returns {boolean}
 */
export function isValidTime(timeStr) {
  if (typeof timeStr !== 'string') return false;
  const trimmed = timeStr.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return false;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] !== undefined ? Number(match[3]) : 0;
  return h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60;
}

/**
 * Analizador sintáctico nativo de texto CSV conforme a RFC 4180.
 * Soporta celdas entrecomilladas, comas dentro de comillas, comillas escapadas (""),
 * saltos de línea (CRLF o LF) dentro y fuera de celdas, y BOM inicial.
 *
 * @param {string} csvText - Contenido del archivo CSV
 * @returns {{ headers: string[], rows: Array<Record<string, string>>, errors: string[] }}
 */
export function parseCSV(csvText) {
  const errors = [];
  if (typeof csvText !== 'string' || !csvText.trim()) {
    return {
      headers: [],
      rows: [],
      errors: []
    };
  }

  let text = csvText;
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rawRows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  let currentLine = 1;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Comilla escapada ("") dentro de comillas
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Fin del campo entrecomillado
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        if (char === '\n') {
          currentLine++;
        }
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        // Inicio de campo entrecomillado
        if (currentField.trim() === '') {
          currentField = '';
        }
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Avanzar sobre \r en secuencia \r\n
        }
        currentRow.push(currentField);
        rawRows.push({ lineNum: currentLine, fields: currentRow });
        currentRow = [];
        currentField = '';
        currentLine++;
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rawRows.push({ lineNum: currentLine, fields: currentRow });
        currentRow = [];
        currentField = '';
        currentLine++;
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (inQuotes) {
    errors.push(`Error de sintaxis en línea ${currentLine}: comilla de cierre faltante (unterminated / unclosed quote).`);
  }

  // Si quedó contenido al final sin salto de línea
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rawRows.push({ lineNum: currentLine, fields: currentRow });
  }

  // Filtrar líneas totalmente vacías (ej. salto de línea al final del archivo)
  const nonBlankRows = rawRows.filter(r => {
    return !(r.fields.length === 1 && r.fields[0].trim() === '');
  });

  if (nonBlankRows.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: errors.length > 0 ? errors : ['El archivo CSV no contiene registros.']
    };
  }

  // La primera fila representa los encabezados
  const headers = nonBlankRows[0].fields.map(h => h.trim());
  const rows = [];

  for (let r = 1; r < nonBlankRows.length; r++) {
    const { lineNum, fields } = nonBlankRows[r];
    if (fields.length !== headers.length) {
      errors.push(`Línea ${lineNum}: número de columnas incorrecto (esperadas ${headers.length}, encontradas ${fields.length}).`);
      continue;
    }

    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c];
      rowObj[headerKey] = fields[c];
    }
    rows.push(rowObj);
  }

  return { headers, rows, errors };
}

/**
 * Serializa sesiones en el formato CSV independiente para Tutores.
 * Encabezados: ID,Alumno,Materia,Horas,Fecha,Hora,Creado
 * Incluye BOM UTF-8, terminaciones CRLF y protección contra Formula Injection.
 *
 * @param {Array<object>} sessions - Lista de sesiones del tutor
 * @returns {string} Contenido CSV completo
 */
export function serializeTutorCSV(sessions = []) {
  const headers = ['ID', 'Alumno', 'Materia', 'Horas', 'Fecha', 'Hora', 'Creado'];
  const headerRow = headers.join(',');

  const rows = (sessions || []).map(s => {
    const id = s.id ?? '';
    const student = s.alumno ?? s.studentName ?? s.student_name ?? s.student ?? s.Alumno ?? '';
    const subject = s.materia ?? s.subject ?? s.Materia ?? '';
    const hours = s.horas ?? s.duration_hours ?? (s.hours != null
      ? (typeof s.hours === 'number' ? s.hours.toFixed(1) : String(s.hours))
      : (s.Horas ?? ''));
    const date = s.fecha ?? s.date ?? s.session_date ?? s.Fecha ?? '';
    const time = s.hora ?? s.time ?? s.start_time ?? s.Hora ?? '';
    const created = s.creado ?? s.createdAt ?? s.created_at ?? s.Creado ?? '';

    return [
      sanitizeCSVCell(id),
      sanitizeCSVCell(student),
      sanitizeCSVCell(subject),
      sanitizeCSVCell(hours),
      sanitizeCSVCell(date),
      sanitizeCSVCell(time),
      sanitizeCSVCell(created)
    ].join(',');
  });

  return UTF8_BOM + [headerRow, ...rows].join('\r\n') + (rows.length ? '\r\n' : '\r\n');
}

/**
 * Serializa registros en el formato CSV independiente para Capítulo / Administrador.
 * Encabezados: Matrícula,Tutor,Materia,Fecha,Horas,Estado
 * Incluye BOM UTF-8, terminaciones CRLF y protección contra Formula Injection.
 *
 * @param {Array<object>} records - Lista de registros de tutoría del capítulo
 * @returns {string} Contenido CSV completo
 */
export function serializeChapterCSV(records = []) {
  const headers = ['Matrícula', 'Tutor', 'Materia', 'Fecha', 'Horas', 'Estado'];
  const headerRow = headers.join(',');

  const rows = (records || []).map(rec => {
    const matricula = rec.matricula ?? rec.student_id ?? rec.institutional_id ?? rec.tutor_matricula ?? rec.tutorId ?? rec.tutor_id ?? '';
    const tutor = rec.tutor ?? rec.tutorName ?? rec.tutor_name ?? '';
    const subject = rec.materia ?? rec.subject ?? rec.Materia ?? '';
    const date = rec.fecha ?? rec.date ?? rec.session_date ?? rec.Fecha ?? '';
    const hours = rec.horas ?? rec.duration_hours ?? (rec.hours != null
      ? (typeof rec.hours === 'number' ? rec.hours.toFixed(1) : String(rec.hours))
      : (rec.Horas ?? ''));
    const status = rec.estado ?? rec.status ?? rec.Estado ?? '';

    return [
      sanitizeCSVCell(matricula),
      sanitizeCSVCell(tutor),
      sanitizeCSVCell(subject),
      sanitizeCSVCell(date),
      sanitizeCSVCell(hours),
      sanitizeCSVCell(status)
    ].join(',');
  });

  return UTF8_BOM + [headerRow, ...rows].join('\r\n') + (rows.length ? '\r\n' : '\r\n');
}

/**
 * Genera el paquete completo de respaldo mensual en CSV de las sesiones de un capítulo.
 * Contiene todos los campos de auditoría necesarios para preservación a largo plazo.
 *
 * @param {Array<object>} sessions - Sesiones a respaldar
 * @param {string} [chapterId='general'] - Identificador o código del capítulo
 * @param {string} [monthKey=''] - Llave de mes en formato YYYY-MM (ej. '2026-03')
 * @returns {{ filename: string, content: string }}
 */
export function generateMonthlyBackup(sessions = [], chapterId = 'general', monthKey = '') {
  const key = monthKey || new Date().toISOString().slice(0, 7);
  const safeChapter = String(chapterId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `backup_capitulo_${safeChapter}_${key}.csv`;

  const headers = [
    'ID',
    'Capítulo',
    'Tutor_ID',
    'Matrícula',
    'Tutor',
    'Alumno',
    'Materia',
    'Fecha',
    'Hora_Inicio',
    'Horas',
    'Estado',
    'Evidencia',
    'Creado'
  ];
  const headerRow = headers.join(',');

  const rows = (sessions || []).map(s => {
    const id = s.id ?? '';
    const chap = s.chapter_id ?? s.chapterId ?? safeChapter;
    const tutorId = s.tutor_id ?? s.tutorId ?? '';
    const matricula = s.matricula ?? s.institutional_id ?? '';
    const tutor = s.tutorName ?? s.tutor_name ?? s.tutor ?? '';
    const student = s.student_name ?? s.studentName ?? s.student ?? s.Alumno ?? '';
    const subject = s.subject ?? s.Materia ?? '';
    const date = s.session_date ?? s.date ?? s.Fecha ?? '';
    const time = s.start_time ?? s.time ?? s.Hora ?? '';
    const hours = s.hours != null
      ? (typeof s.hours === 'number' ? s.hours.toFixed(1) : String(s.hours))
      : (s.Horas ?? '');
    const status = s.status ?? s.Estado ?? '';
    const evidence = s.evidence_path ?? s.evidencePath ?? (s.evidence ? 'SI' : 'NO');
    const created = s.created_at ?? s.createdAt ?? s.Creado ?? '';

    return [
      sanitizeCSVCell(id),
      sanitizeCSVCell(chap),
      sanitizeCSVCell(tutorId),
      sanitizeCSVCell(matricula),
      sanitizeCSVCell(tutor),
      sanitizeCSVCell(student),
      sanitizeCSVCell(subject),
      sanitizeCSVCell(date),
      sanitizeCSVCell(time),
      sanitizeCSVCell(hours),
      sanitizeCSVCell(status),
      sanitizeCSVCell(evidence),
      sanitizeCSVCell(created)
    ].join(',');
  });

  const content = UTF8_BOM + [headerRow, ...rows].join('\r\n') + (rows.length ? '\r\n' : '\r\n');
  return { filename, content };
}

/**
 * Disparador para descargar un archivo CSV en el navegador utilizando un Blob nativo.
 * Maneja adecuadamente la revocación de la URL del objeto en memoria.
 *
 * @param {string} filename - Nombre del archivo a descargar
 * @param {string} csvContent - Contenido CSV (con o sin BOM)
 */
export function downloadCSV(filename, csvContent) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = window.URL.createObjectURL(blob);

  const downloadLink = document.createElement('a');
  downloadLink.href = objectUrl;
  downloadLink.setAttribute('download', filename);
  downloadLink.style.display = 'none';
  document.body.appendChild(downloadLink);

  downloadLink.click();

  setTimeout(() => {
    if (downloadLink.parentNode) {
      document.body.removeChild(downloadLink);
    }
    window.URL.revokeObjectURL(objectUrl);
  }, 1500);
}

/**
 * Valida un arreglo de filas parseadas desde un CSV para inserción en la base de datos.
 * Aplica reglas estrictas de negocio:
 * - Nombre de alumno no vacío (máx 255 caracteres)
 * - Materia no vacía (máx 255 caracteres)
 * - Fecha válida en calendario gregoriano (YYYY-MM-DD)
 * - Hora válida (HH:MM o HH:MM:SS)
 * - Horas de sesión numéricas entre 0.5 y 24
 * - Tutor asignado obligatorio y determinable (por matrícula, nombre, UUID o contexto)
 *
 * @param {Array<Record<string, string>>} rows - Filas generadas por parseCSV
 * @param {object} [context={}] - Contexto adicional ({ chapterId, tutorId, members })
 * @returns {{ validSessions: Array<object>, invalidRows: Array<object>, errors: string[] }}
 */
export function validateImportedSessions(rows = [], context = {}) {
  const validSessions = [];
  const invalidRows = [];
  const errors = [];

  const defaultChapterId = context.chapterId || null;
  const defaultTutorId = context.tutorId || null;

  // Mapa de miembros para resolver matrícula o nombre a tutor_id
  const memberMap = new Map();
  if (Array.isArray(context.members)) {
    context.members.forEach(m => {
      if (m.id) memberMap.set(String(m.id).toLowerCase(), m);
      if (m.userId) memberMap.set(String(m.userId).toLowerCase(), m);
      if (m.matricula) memberMap.set(String(m.matricula).toLowerCase(), m);
      if (m.name) memberMap.set(String(m.name).toLowerCase(), m);
    });
  }

  rows.forEach((row, index) => {
    const lineNum = index + 2; // +1 base 0, +1 fila de encabezado
    const rowErrors = [];

    // Alumno
    const rawStudent = row.Alumno || row.student_name || row.student || row.Nombre_Alumno || row['Nombre Alumno'] || '';
    const studentName = unescapeFormulaPrefix(String(rawStudent).trim());
    if (!studentName) {
      rowErrors.push(`Fila ${lineNum}: El nombre del alumno es obligatorio.`);
    } else if (studentName.length > 255) {
      rowErrors.push(`Fila ${lineNum}: El nombre del alumno excede 255 caracteres.`);
    }

    // Materia
    const rawSubject = row.Materia || row.subject || row.Asignatura || '';
    const subject = unescapeFormulaPrefix(String(rawSubject).trim());
    if (!subject) {
      rowErrors.push(`Fila ${lineNum}: La materia es obligatoria.`);
    } else if (subject.length > 255) {
      rowErrors.push(`Fila ${lineNum}: La materia excede 255 caracteres.`);
    }

    // Fecha
    const rawDate = row.Fecha || row.session_date || row.date || '';
    const sessionDate = String(rawDate).trim();
    if (!sessionDate) {
      rowErrors.push(`Fila ${lineNum}: La fecha es obligatoria.`);
    } else if (!isValidDate(sessionDate)) {
      rowErrors.push(`Fila ${lineNum}: Fecha inválida '${sessionDate}' (formato esperado YYYY-MM-DD).`);
    }

    // Hora
    const rawTime = row.Hora || row.Hora_Inicio || row.start_time || row.time || row['Hora Inicio'] || '';
    let startTime = String(rawTime).trim();
    if (startTime && /^\d{1,2}:\d{2}$/.test(startTime)) {
      if (startTime.length === 4) startTime = '0' + startTime;
      startTime = `${startTime}:00`;
    }
    if (!startTime) {
      rowErrors.push(`Fila ${lineNum}: La hora de inicio es obligatoria.`);
    } else if (!isValidTime(startTime)) {
      rowErrors.push(`Fila ${lineNum}: Hora inválida '${rawTime}' (formato esperado HH:MM).`);
    }

    // Horas
    const rawHours = row.Horas || row.hours || row.Duracion || row.duracion || '';
    const hours = Number(rawHours);
    if (rawHours === '' || isNaN(hours)) {
      rowErrors.push(`Fila ${lineNum}: Las horas deben ser un número válido.`);
    } else if (hours < 0.5 || hours > 24) {
      rowErrors.push(`Fila ${lineNum}: Las horas (${hours}) deben estar entre 0.5 y 24.`);
    }

    // Tutor
    const rawTutor = row.Matrícula || row.Matricula || row.Tutor || row.tutor_id || row.tutorId || '';
    let tutorId = defaultTutorId;
    if (rawTutor) {
      const match = memberMap.get(String(rawTutor).trim().toLowerCase());
      if (match) {
        tutorId = match.userId || match.id;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTutor.trim())) {
        tutorId = rawTutor.trim();
      } else {
        tutorId = null;
      }
    }

    if (!tutorId) {
      rowErrors.push(`Fila ${lineNum}: No se pudo determinar el tutor asignado ('${rawTutor}').`);
    }

    // Estado
    let status = 'PENDING';
    const rawStatus = (row.Estado || row.status || '').trim().toUpperCase();
    if (rawStatus === 'APROBADA' || rawStatus === 'APPROVED') status = 'APPROVED';
    else if (rawStatus === 'RECHAZADA' || rawStatus === 'REJECTED') status = 'REJECTED';

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      invalidRows.push({ row, lineNum, errors: rowErrors });
    } else {
      validSessions.push({
        chapter_id: defaultChapterId,
        tutor_id: tutorId,
        student_name: studentName,
        subject: subject,
        session_date: sessionDate,
        start_time: startTime.slice(0, 5) + (startTime.length === 5 ? ':00' : ''),
        hours: Number(hours.toFixed(2)),
        status: status
      });
    }
  });

  return { validSessions, invalidRows, errors };
}
