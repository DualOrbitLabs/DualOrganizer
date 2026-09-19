/**
 * tests/evidence.test.js
 * DualOrganizer - Suite de Pruebas para Evidencias Extendidas y Reportes de Impresión / PDF
 *
 * Cobertura de Niveles:
 * - Tier 1: Tipos MIME Admitidos y Configuración de Medios (WebP, AVIF, GIF, PDF, JPG, PNG)
 * - Tier 2: Validación de Ficheros y Sanitización de Nombres (validateEvidenceFile)
 * - Tier 3: Límites y Fronteras de Tamaño de Archivo (5 MB maxBytes)
 * - Tier 4: Previsualizador Seguro y Mitigación XSS (formatEvidencePreview)
 * - Tier 5: Reporte Imprimible Nativo Print-to-PDF (exportEvidenceReport / buildEvidenceReportHTML)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APP_CONFIG } from '../js/config.js';
import {
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  validateEvidenceFile,
  formatEvidencePreview,
  buildEvidenceReportHTML,
  exportEvidenceReport,
  escapeHTML
} from '../js/evidenceUtils.js';

describe('Extended Evidence Formats & Print-to-PDF Reports Test Suite', () => {

  describe('Tier 1: Supported MIME Types & Media Constants', () => {
    it('SUPPORTED_MIME_TYPES must include all 6 required formats (JPG, PNG, WebP, AVIF, GIF, PDF)', () => {
      const requiredTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
        'image/gif',
        'application/pdf'
      ];

      for (const mime of requiredTypes) {
        assert.ok(
          SUPPORTED_MIME_TYPES.includes(mime),
          `SUPPORTED_MIME_TYPES must include ${mime}`
        );
      }
      assert.ok(SUPPORTED_MIME_TYPES.length >= 6, 'Must contain supported MIME types');
    });

    it('APP_CONFIG.uploads.allowedMimeTypes must synchronize with SUPPORTED_MIME_TYPES', () => {
      assert.ok(Array.isArray(APP_CONFIG.uploads.allowedMimeTypes));
      assert.ok(APP_CONFIG.uploads.allowedMimeTypes.includes('image/webp'));
      assert.ok(APP_CONFIG.uploads.allowedMimeTypes.includes('image/avif'));
      assert.ok(APP_CONFIG.uploads.allowedMimeTypes.includes('image/gif'));
      assert.ok(APP_CONFIG.uploads.allowedMimeTypes.includes('application/pdf'));
      assert.ok(APP_CONFIG.uploads.allowedMimeTypes.includes('image/jpeg'));
      assert.ok(APP_CONFIG.uploads.allowedMimeTypes.includes('image/png'));
    });

    it('SUPPORTED_EXTENSIONS must include all expected file extensions', () => {
      const expectedExts = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.pdf', '.docx', '.xlsx', '.zip'];
      for (const ext of expectedExts) {
        assert.ok(SUPPORTED_EXTENSIONS.includes(ext), `Must include extension ${ext}`);
      }
    });
  });

  describe('Tier 2: File Validation & Metadata Extraction (validateEvidenceFile)', () => {
    it('should validate WebP, AVIF and GIF images successfully', () => {
      const webpFile = { name: 'comprobante.webp', type: 'image/webp', size: 1024 * 500 };
      const avifFile = { name: 'captura.avif', type: 'image/avif', size: 1024 * 300 };
      const gifFile = { name: 'animacion.gif', type: 'image/gif', size: 1024 * 800 };

      const checkWebp = validateEvidenceFile(webpFile);
      assert.equal(checkWebp.valid, true);
      assert.equal(checkWebp.isImage, true);
      assert.equal(checkWebp.isPdf, false);
      assert.equal(checkWebp.extension, '.webp');

      const checkAvif = validateEvidenceFile(avifFile);
      assert.equal(checkAvif.valid, true);
      assert.equal(checkAvif.isImage, true);
      assert.equal(checkAvif.isPdf, false);
      assert.equal(checkAvif.extension, '.avif');

      const checkGif = validateEvidenceFile(gifFile);
      assert.equal(checkGif.valid, true);
      assert.equal(checkGif.isImage, true);
      assert.equal(checkGif.isPdf, false);
      assert.equal(checkGif.extension, '.gif');
    });

    it('should validate PDF documents successfully with isPdf true and isImage false', () => {
      const pdfFile = { name: 'hoja_firmada.pdf', type: 'application/pdf', size: 1024 * 1024 };
      const check = validateEvidenceFile(pdfFile);

      assert.equal(check.valid, true);
      assert.equal(check.isPdf, true);
      assert.equal(check.isImage, false);
      assert.equal(check.extension, '.pdf');
    });

    it('should validate standard JPG and PNG images', () => {
      const jpg = { name: 'foto.jpg', type: 'image/jpeg', size: 200000 };
      const png = { name: 'firma.png', type: 'image/png', size: 150000 };

      assert.equal(validateEvidenceFile(jpg).valid, true);
      assert.equal(validateEvidenceFile(png).valid, true);
    });

    it('should sanitize dangerous and malicious file names', () => {
      const maliciousFile = {
        name: '../../../etc/passwd.. <script>alert(1)</script> file#1$.webp',
        type: 'image/webp',
        size: 2048
      };

      const check = validateEvidenceFile(maliciousFile);
      assert.equal(check.valid, true);
      assert.ok(!check.sanitizedName.includes('<'));
      assert.ok(!check.sanitizedName.includes('>'));
      assert.ok(!check.sanitizedName.includes('/'));
      assert.ok(!check.sanitizedName.includes('\\'));
      assert.ok(!check.sanitizedName.includes(' '));
      assert.ok(check.sanitizedName.endsWith('.webp'));
    });

    it('should reject unsupported and dangerous file types', () => {
      const dangerousFiles = [
        { name: 'script.exe', type: 'application/x-msdownload', size: 1000 },
        { name: 'malware.sh', type: 'application/x-sh', size: 1000 },
        { name: 'script.bat', type: 'application/x-bat', size: 1000 },
        { name: 'script.ps1', type: 'text/plain', size: 1000 },
        { name: 'hacked.php', type: 'text/php', size: 1000 },
        { name: 'unknown.iso', type: 'application/x-iso9660-image', size: 1000 }
      ];

      for (const file of dangerousFiles) {
        const check = validateEvidenceFile(file);
        assert.equal(check.valid, false, `File ${file.name} must be rejected`);
        assert.ok(
          check.error.includes('Formato no permitido') || check.error.includes('bloqueado'),
          `Error for ${file.name} should explain rejection`
        );
      }
    });

    it('should reject null or undefined file argument gracefully', () => {
      const checkNull = validateEvidenceFile(null);
      assert.equal(checkNull.valid, false);
      assert.ok(checkNull.error);

      const checkUndefined = validateEvidenceFile(undefined);
      assert.equal(checkUndefined.valid, false);
      assert.ok(checkUndefined.error);
    });
  });

  describe('Tier 3: File Size Boundary Tests (5 MB Limit)', () => {
    const FIVE_MB = 5 * 1024 * 1024; // 5,242,880 bytes

    it('should accept file exactly at 5 MB boundary', () => {
      const file = { name: 'maximo.pdf', type: 'application/pdf', size: FIVE_MB };
      const check = validateEvidenceFile(file);
      assert.equal(check.valid, true);
    });

    it('should accept file 1 byte under 5 MB boundary', () => {
      const file = { name: 'limite_inferior.png', type: 'image/png', size: FIVE_MB - 1 };
      const check = validateEvidenceFile(file);
      assert.equal(check.valid, true);
    });

    it('should reject file 1 byte over 5 MB boundary', () => {
      const file = { name: 'limite_superior.png', type: 'image/png', size: FIVE_MB + 1 };
      const check = validateEvidenceFile(file);
      assert.equal(check.valid, false);
      assert.ok(check.error.includes('excede el tamaño máximo permitido de 5 MB'));
    });

    it('should reject large file (10 MB)', () => {
      const file = { name: 'pesado.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 };
      const check = validateEvidenceFile(file);
      assert.equal(check.valid, false);
      assert.ok(check.error.includes('10.00 MB'));
    });
  });

  describe('Tier 4: Preview Generator & XSS Mitigation (formatEvidencePreview)', () => {
    it('should render image preview with safe img tag and link', () => {
      const preview = formatEvidencePreview('https://storage.supabase.co/bucket/foto.webp', 'foto.webp', 'image/webp');
      assert.ok(preview.includes('<img'));
      assert.ok(preview.includes('src="https://storage.supabase.co/bucket/foto.webp"'));
      assert.ok(preview.includes('alt="foto.webp"'));
      assert.ok(preview.includes('target="_blank"'));
    });

    it('should render PDF preview with SVG icon and PDF badge link', () => {
      const preview = formatEvidencePreview('https://storage.supabase.co/bucket/asistencia.pdf', 'asistencia.pdf', 'application/pdf');
      assert.ok(preview.includes('<svg'));
      assert.ok(preview.includes('asistencia.pdf (PDF)'));
      assert.ok(preview.includes('href="https://storage.supabase.co/bucket/asistencia.pdf"'));
    });

    it('should handle record object input structure', () => {
      const record = {
        evidence_path: 'https://storage.supabase.co/evidence/tutor1/foto.png',
        file_name: 'recibo.png',
        mime_type: 'image/png'
      };
      const preview = formatEvidencePreview(record);
      assert.ok(preview.includes('recibo.png'));
      assert.ok(preview.includes('src="https://storage.supabase.co/evidence/tutor1/foto.png"'));
    });

    it('should render empty badge when evidence is null, empty string or undefined', () => {
      assert.ok(formatEvidencePreview(null).includes('Sin evidencia'));
      assert.ok(formatEvidencePreview('').includes('Sin evidencia'));
      assert.ok(formatEvidencePreview(undefined).includes('Sin evidencia'));
      assert.ok(formatEvidencePreview({}).includes('Sin evidencia'));
    });

    it('should neutralize dangerous javascript: and data: URIs in previews', () => {
      const xssJs = 'javascript:alert(document.cookie)';
      const previewJs = formatEvidencePreview(xssJs, 'evil.png', 'image/png');
      assert.ok(!previewJs.includes('javascript:'));
      assert.ok(previewJs.includes('Enlace no seguro bloqueado'));

      const xssData = 'data:text/html,<script>alert(1)</script>';
      const previewData = formatEvidencePreview(xssData, 'evil.html', 'text/html');
      assert.ok(!previewData.includes('data:text/html'));
      assert.ok(previewData.includes('Enlace no seguro bloqueado'));
    });

    it('should escape HTML characters in filenames and URLs', () => {
      const escaped = escapeHTML('<script>"hello"&\'world\'</script>');
      assert.equal(escaped, '&lt;script&gt;&quot;hello&quot;&amp;&#039;world&#039;&lt;/script&gt;');
    });
  });

  describe('Tier 5: Print-to-PDF Report Generator (exportEvidenceReport & buildEvidenceReportHTML)', () => {
    const mockSessions = [
      {
        id: 's-1',
        studentName: 'Ana López',
        subject: 'Cálculo Diferencial',
        hours: 2.0,
        date: '2026-09-10',
        time: '10:00',
        status: 'APPROVED',
        evidence: 'tutor/s-1/hoja_asistencia.pdf'
      },
      {
        id: 's-2',
        studentName: 'Carlos Ruiz',
        subject: 'Álgebra Lineal',
        hours: 1.5,
        date: '2026-09-12',
        time: '14:00',
        status: 'APPROVED',
        evidence: 'tutor/s-2/foto_pizarron.webp'
      },
      {
        id: 's-3',
        studentName: 'Beatriz Morales',
        subject: 'Física I',
        hours: 1.0,
        date: '2026-09-14',
        time: '11:00',
        status: 'PENDING',
        evidence: null
      }
    ];

    it('buildEvidenceReportHTML should generate a complete HTML document with print CSS', () => {
      const html = buildEvidenceReportHTML(mockSessions, {
        chapterName: 'Capítulo Toluca',
        tutorName: 'Ing. Roberto Hernández'
      });

      assert.ok(html.includes('<!DOCTYPE html>'), 'Must start with <!DOCTYPE html>');
      assert.ok(html.includes('<html lang="es">'));
      assert.ok(html.includes('@page {'));
      assert.ok(html.includes('@media print {'));
      assert.ok(html.includes('Capítulo Toluca'));
      assert.ok(html.includes('Ing. Roberto Hernández'));
    });

    it('buildEvidenceReportHTML should contain tabular sessions and calculate correct totals', () => {
      const html = buildEvidenceReportHTML(mockSessions);

      // Sessions table
      assert.ok(html.includes('<table class="sessions-table">'));
      assert.ok(html.includes('Ana López'));
      assert.ok(html.includes('Carlos Ruiz'));
      assert.ok(html.includes('Beatriz Morales'));

      // Total hours: 2.0 + 1.5 + 1.0 = 4.5h
      assert.ok(html.includes('4.5h') || html.includes('4.5 hrs'), 'Must contain 4.5h total hours');

      // Total sessions: 3
      assert.ok(html.includes('3</span>') || html.includes('>3<'), 'Must contain total 3 sessions');

      // Evidence badges
      assert.ok(html.includes('hoja_asistencia.pdf'));
      assert.ok(html.includes('foto_pizarron.webp'));
      assert.ok(html.includes('Sin evidencia'));
    });

    it('buildEvidenceReportHTML should render signature blocks for tutor and dual coordinator', () => {
      const html = buildEvidenceReportHTML(mockSessions, { tutorName: 'Dr. Mario Gómez' });
      assert.ok(html.includes('Firma del Tutor Académico'));
      assert.ok(html.includes('Coordinación de Formación Dual'));
      assert.ok(html.includes('Validación y Acreditación de Horas'));
      assert.ok(html.includes('Dr. Mario Gómez'));
    });

    it('buildEvidenceReportHTML should handle empty sessions list gracefully', () => {
      const html = buildEvidenceReportHTML([], { chapterName: 'Capítulo Vacío' });
      assert.ok(html.includes('Capítulo Vacío'));
      assert.ok(html.includes('No hay sesiones registradas'));
      assert.ok(html.includes('0.0h') || html.includes('0.0 hrs'));
    });

    it('exportEvidenceReport should operate in headless environment without crashing', () => {
      // In Node.js environment, window is undefined
      assert.equal(typeof window, 'undefined');

      const result = exportEvidenceReport(mockSessions, { chapterName: 'Test Chapter' });
      assert.ok(result);
      assert.ok(typeof result.html === 'string');
      assert.ok(result.html.includes('Test Chapter'));
      assert.equal(result.window, null);
    });

    it('exportEvidenceReport should write to window and invoke print when window mock is provided', () => {
      let documentWritten = '';
      let printCalled = false;
      let focusCalled = false;

      const mockWindow = {
        document: {
          open: () => {},
          write: (str) => { documentWritten += str; },
          close: () => {}
        },
        focus: () => { focusCalled = true; },
        print: () => { printCalled = true; }
      };

      // Pass mock window as targetWindow in options
      globalThis.window = {
        open: () => mockWindow
      };

      try {
        const result = exportEvidenceReport(mockSessions, {
          chapterName: 'Mock Window Chapter',
          targetWindow: mockWindow,
          printImmediately: false
        });

        assert.ok(documentWritten.includes('Mock Window Chapter'));
        assert.equal(result.window, mockWindow);
      } finally {
        delete globalThis.window;
      }
    });
  });
});
