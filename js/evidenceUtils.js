/**
 * js/evidenceUtils.js
 * DualOrganizer - Utilidades para Gestión de Evidencias y Reportes de Impresión / PDF
 *
 * Cumple con:
 * - Soporte extendido de formatos: WebP, AVIF, GIF, PDF además de JPEG y PNG.
 * - Validación estricta de archivos (tipos MIME, extensiones y límite de 5 MB según APP_CONFIG).
 * - Sanitización robusta contra XSS para nombres de archivo, URLs y fragmentos HTML.
 * - Previsualizador seguro de evidencias en navegador (imágenes y PDFs).
 * - Generador de reporte imprimible nativo (Print-to-PDF) con tipografía tabular y paleta Slate/Zinc.
 */

import { APP_CONFIG } from './config.js';

/** Formatos MIME admitidos para carga de evidencias */
export const SUPPORTED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet'
]);

/** Extensiones admitidas para validación por extensión */
export const SUPPORTED_EXTENSIONS = Object.freeze([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
  '.svg',
  '.bmp',
  '.tif',
  '.tiff',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.rtf',
  '.zip',
  '.rar',
  '.7z',
  '.odt',
  '.ods'
]);

/** Extensiones estrictamente prohibidas por seguridad */
export const DANGEROUS_EXTENSIONS = Object.freeze([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.php',
  '.js',
  '.vbs',
  '.py',
  '.ps1',
  '.msi',
  '.dll',
  '.com',
  '.scr',
  '.htm',
  '.html'
]);

/**
 * Escapa caracteres especiales en cadenas para prevenir Cross-Site Scripting (XSS).
 *
 * @param {*} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Valida un archivo candidato a evidencia contra restricciones de tamaño y tipo de medio.
 *
 * @param {File|object} file - Archivo del DOM o mock en pruebas
 * @param {number} [maxBytes] - Límite en bytes (por defecto toma APP_CONFIG.uploads.maxBytes)
 * @returns {{ valid: boolean, error?: string, sanitizedName?: string, isImage: boolean, isPdf: boolean, extension?: string }}
 */
export function validateEvidenceFile(file, maxBytes = APP_CONFIG?.uploads?.maxBytes || 5 * 1024 * 1024) {
  if (!file) {
    return {
      valid: false,
      error: 'No se ha proporcionado ningún archivo para validar.',
      isImage: false,
      isPdf: false
    };
  }

  const fileName = String(file.name || '');
  const lastDot = fileName.lastIndexOf('.');
  const extension = lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : '';
  const fileType = String(file.type || '').toLowerCase();

  // Validación de tamaño (máx 5 MB)
  if (typeof file.size === 'number' && file.size > maxBytes) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `El archivo (${sizeInMB} MB) excede el tamaño máximo permitido de 5 MB.`,
      isImage: false,
      isPdf: false,
      extension
    };
  }

  // Rechazo explícito de ejecutables y scripts peligrosos
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Formato peligroso bloqueado (${extension}). No se admiten ejecutables ni scripts por razones de seguridad.`,
      isImage: false,
      isPdf: false,
      extension
    };
  }

  // Validación de tipo MIME o extensión
  const mimeAllowed = SUPPORTED_MIME_TYPES.includes(fileType);
  const extAllowed = SUPPORTED_EXTENSIONS.includes(extension);

  if (!mimeAllowed && !extAllowed) {
    return {
      valid: false,
      error: 'Formato no permitido. Se aceptan imágenes, documentos PDF/Office, texto y archivos comprimidos seguros.',
      isImage: false,
      isPdf: false,
      extension
    };
  }

  const isPdf = fileType === 'application/pdf' || extension === '.pdf';
  const isImage = fileType.startsWith('image/') || (extAllowed && !isPdf);
  const sanitizedName = (fileName || 'evidencia').replace(/[^a-zA-Z0-9_.\-]/g, '_');

  return {
    valid: true,
    sanitizedName,
    isImage,
    isPdf,
    extension
  };
}

/**
 * Genera un fragmento HTML seguro para visualizar la previsualización de una evidencia.
 *
 * @param {string|object} evidenceUrlOrRecord - URL o registro con metadatos de evidencia
 * @param {string} [fileName='Evidencia'] - Nombre descriptivo del archivo
 * @param {string} [mimeType=''] - Tipo MIME de la evidencia
 * @returns {string} Fragmento HTML seguro
 */
export function formatEvidencePreview(evidenceUrlOrRecord, fileName = 'Evidencia', mimeType = '') {
  let url = '';
  let name = fileName;
  let mime = mimeType;

  if (typeof evidenceUrlOrRecord === 'object' && evidenceUrlOrRecord !== null) {
    url = evidenceUrlOrRecord.url || evidenceUrlOrRecord.evidence_path || evidenceUrlOrRecord.evidencePath || evidenceUrlOrRecord.storage_path || evidenceUrlOrRecord.evidence || '';
    name = evidenceUrlOrRecord.file_name || evidenceUrlOrRecord.fileName || fileName || 'Evidencia';
    mime = evidenceUrlOrRecord.mime_type || evidenceUrlOrRecord.mimeType || mimeType || '';
  } else if (typeof evidenceUrlOrRecord === 'string') {
    url = evidenceUrlOrRecord;
  }

  if (!url || !url.trim()) {
    return '<span class="evidence-empty tabular-nums" style="color: var(--slate-400, #94a3b8); font-size: 0.8rem;">Sin evidencia</span>';
  }

  const trimmedUrl = url.trim();

  // Prevención de vectores XSS basados en esquemas peligrosos
  if (/^(javascript|data|vbscript):/i.test(trimmedUrl)) {
    return '<span class="evidence-empty" style="color: #dc2626; font-size: 0.8rem;">Enlace no seguro bloqueado</span>';
  }

  const safeUrl = escapeHTML(trimmedUrl);
  const safeName = escapeHTML(name || 'Evidencia');
  const lowerUrl = trimmedUrl.toLowerCase();
  const lowerName = String(name || '').toLowerCase();

  const isPdf = mime === 'application/pdf' || lowerUrl.endsWith('.pdf') || lowerName.endsWith('.pdf');
  const isImage = mime.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif)$/i.test(lowerUrl) || /\.(jpe?g|png|webp|avif|gif)$/i.test(lowerName);

  if (isImage) {
    return `
      <div class="evidence-preview-container evidence-preview--image" style="display: inline-flex; align-items: center; gap: 6px;">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="evidence-preview-link" title="Ver imagen: ${safeName}" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: #1e293b;">
          <img src="${safeUrl}" alt="${safeName}" class="evidence-preview-thumb" loading="lazy" style="width: 24px; height: 24px; object-fit: cover; border-radius: 4px; border: 1px solid #e2e8f0;" />
          <span class="evidence-preview-text" style="font-size: 0.775rem; text-decoration: underline;">${safeName}</span>
        </a>
      </div>
    `.trim();
  }

  if (isPdf) {
    return `
      <div class="evidence-preview-container evidence-preview--pdf" style="display: inline-flex; align-items: center; gap: 6px;">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="evidence-preview-link" title="Abrir PDF: ${safeName}" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: #0f172a;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span class="evidence-preview-text" style="font-size: 0.775rem; text-decoration: underline;">${safeName} (PDF)</span>
        </a>
      </div>
    `.trim();
  }

  return `
    <div class="evidence-preview-container evidence-preview--file" style="display: inline-flex; align-items: center;">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="evidence-preview-link" title="Descargar: ${safeName}" style="font-size: 0.775rem; color: #334155; text-decoration: underline;">
        ${safeName}
      </a>
    </div>
  `.trim();
}

/**
 * Genera el documento HTML completo formateado para impresión (Print-to-PDF).
 *
 * @param {Array<object>} sessions - Lista de sesiones registradas
 * @param {object} [options={}] - Parámetros de personalización
 * @returns {string} Código HTML del reporte
 */
export function buildEvidenceReportHTML(sessions = [], options = {}) {
  const chapterName = options.chapterName || 'Capítulo DualOrganizer';
  const tutorName = options.tutorName || 'Tutor Académico';
  const reportDate = options.generatedDate instanceof Date ? options.generatedDate : new Date();
  const dateFormatted = reportDate.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const sessionList = Array.isArray(sessions) ? sessions : [];
  const totalHours = sessionList.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);
  const totalSessions = sessionList.length;

  const rowsHTML = sessionList.map((session, index) => {
    const num = index + 1;
    const date = session.date || session.session_date || session.Fecha || '--';
    const time = session.time || session.start_time || session.Hora || '--';
    const student = session.studentName || session.student_name || session.student || session.Alumno || '--';
    const subject = session.subject || session.materia || session.Materia || '--';
    const hours = Number(session.hours || session.horas || 1).toFixed(1);
    const status = (session.status || session.estado || 'REGISTRADA').toUpperCase();
    const evidencePath = session.evidence || session.evidence_path || session.evidencePath || '';

    const evidenceCell = evidencePath
      ? `<span class="badge-evidence">Adjunta (${escapeHTML(evidencePath.split('/').pop() || 'Archivo')})</span>`
      : '<span class="text-muted">Sin evidencia</span>';

    return `
      <tr>
        <td class="tabular-nums text-center">${num}</td>
        <td class="tabular-nums">${escapeHTML(date)}</td>
        <td class="tabular-nums">${escapeHTML(time)}</td>
        <td><strong>${escapeHTML(student)}</strong></td>
        <td>${escapeHTML(subject)}</td>
        <td class="tabular-nums text-right font-bold">${hours}h</td>
        <td class="text-center"><span class="badge-status">${escapeHTML(status)}</span></td>
        <td class="text-center">${evidenceCell}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Sesiones y Evidencias - ${escapeHTML(chapterName)}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 14mm 12mm 14mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 20px;
      font-size: 11pt;
      line-height: 1.4;
    }
    .tabular-nums {
      font-variant-numeric: tabular-nums;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .report-title-group h1 {
      margin: 0 0 4px 0;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .report-title-group p {
      margin: 0;
      color: #475569;
      font-size: 9pt;
    }
    .report-meta {
      text-align: right;
      font-size: 9pt;
      color: #475569;
    }
    .report-summary-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary-card {
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 10px 14px;
      background-color: #f8fafc;
    }
    .summary-card .label {
      display: block;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .summary-card .val {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
    }
    table.sessions-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 9pt;
    }
    table.sessions-table th {
      background-color: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid #94a3b8;
      border-top: 1px solid #cbd5e1;
    }
    table.sessions-table td {
      padding: 7px 6px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    table.sessions-table tbody tr:nth-child(even) {
      background-color: #fafbfc;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .text-muted { color: #94a3b8; font-size: 8pt; }
    .badge-status {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      background-color: #f1f5f9;
      color: #334155;
      font-size: 7.5pt;
      font-weight: 600;
    }
    .badge-evidence {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      background-color: #ecfdf5;
      color: #047857;
      font-size: 7.5pt;
      font-weight: 600;
      border: 1px solid #a7f3d0;
    }
    .report-signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
      padding-top: 20px;
      page-break-inside: avoid;
    }
    .signature-block {
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #475569;
      margin-bottom: 8px;
    }
    .signature-role {
      font-size: 8.5pt;
      color: #64748b;
      margin: 0;
    }
    .signature-name {
      font-size: 9.5pt;
      font-weight: 600;
      margin: 0 0 2px 0;
    }
    @media print {
      body {
        padding: 0;
        background: transparent;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 9pt; color: #334155;">Vista previa de impresión generada por <strong>DualOrganizer</strong>.</span>
    <button onclick="window.print()" style="background: #0f172a; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-size: 9pt; font-weight: 600; cursor: pointer;">Imprimir / Guardar como PDF</button>
  </div>

  <header class="report-header">
    <div class="report-title-group">
      <h1>Reporte Oficial de Tutorías y Evidencias</h1>
      <p>Capítulo: <strong>${escapeHTML(chapterName)}</strong> &bull; Sistema DualOrganizer</p>
    </div>
    <div class="report-meta">
      <div>Fecha de emisión: <span class="tabular-nums">${escapeHTML(dateFormatted)}</span></div>
      <div>Tutor responsable: <strong>${escapeHTML(tutorName)}</strong></div>
    </div>
  </header>

  <section class="report-summary-cards">
    <div class="summary-card">
      <span class="label">Total de Sesiones</span>
      <span class="val tabular-nums">${totalSessions}</span>
    </div>
    <div class="summary-card">
      <span class="label">Horas Totales Impartidas</span>
      <span class="val tabular-nums">${totalHours.toFixed(1)} hrs</span>
    </div>
    <div class="summary-card">
      <span class="label">Sesiones con Evidencia</span>
      <span class="val tabular-nums">${sessionList.filter(s => Boolean(s.evidence || s.evidence_path || s.evidencePath)).length}</span>
    </div>
  </section>

  <main>
    <table class="sessions-table">
      <thead>
        <tr>
          <th style="width: 30px;" class="text-center">#</th>
          <th style="width: 80px;">Fecha</th>
          <th style="width: 60px;">Hora</th>
          <th>Alumno</th>
          <th>Materia</th>
          <th style="width: 55px;" class="text-right">Horas</th>
          <th style="width: 85px;" class="text-center">Estado</th>
          <th style="width: 120px;" class="text-center">Evidencia</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML || '<tr><td colspan="8" class="text-center text-muted" style="padding: 24px;">No hay sesiones registradas en este período.</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="font-bold text-right" style="padding-top: 10px; border-top: 1px solid #94a3b8;">Total acumulado:</td>
          <td class="font-bold text-right tabular-nums" style="padding-top: 10px; border-top: 1px solid #94a3b8;">${totalHours.toFixed(1)}h</td>
          <td colspan="2" style="border-top: 1px solid #94a3b8;"></td>
        </tr>
      </tfoot>
    </table>
  </main>

  <footer class="report-signatures">
    <div class="signature-block">
      <div class="signature-line"></div>
      <p class="signature-name">${escapeHTML(tutorName)}</p>
      <p class="signature-role">Firma del Tutor Académico</p>
    </div>
    <div class="signature-block">
      <div class="signature-line"></div>
      <p class="signature-name">Coordinación de Formación Dual</p>
      <p class="signature-role">Validación y Acreditación de Horas</p>
    </div>
  </footer>
</body>
</html>`;
}

/**
 * Crea una ventana de documento imprimible con el reporte de evidencias y dispara window.print().
 *
 * @param {Array<object>} sessions - Lista de sesiones registradas
 * @param {object} [options={}] - Opciones de configuración
 * @returns {{ html: string, window: Window|null }}
 */
export function exportEvidenceReport(sessions = [], options = {}) {
  const htmlContent = buildEvidenceReportHTML(sessions, options);

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      const printWindow = options.targetWindow || window.open('', '_blank', 'width=960,height=800');
      if (printWindow && printWindow.document) {
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        if (options.printImmediately !== false) {
          setTimeout(() => {
            try {
              printWindow.focus();
              printWindow.print();
            } catch (err) {
              console.warn('[exportEvidenceReport] Error al invocar print():', err);
            }
          }, 350);
        }
      }
      return { html: htmlContent, window: printWindow };
    } catch (winErr) {
      console.warn('[exportEvidenceReport] No se pudo abrir ventana de impresión:', winErr);
      return { html: htmlContent, window: null };
    }
  }

  return { html: htmlContent, window: null };
}
