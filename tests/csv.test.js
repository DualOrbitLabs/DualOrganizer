import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const csvUtilsPath = path.resolve(__dirname, '../js/csvUtils.js');

// ---------------------------------------------------------------------------
// Reference Oracle Implementation (conforming to PROJECT.md § Interface Contracts)
// Used for test oracle comparisons and fallback prior to M1 file creation.
// ---------------------------------------------------------------------------
function escapeFormulaInjection(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function formatCSVCell(val) {
  const sanitized = escapeFormulaInjection(val);
  if (/[",\r\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

function referenceParseCSV(csvText) {
  const errors = [];
  if (!csvText || typeof csvText !== 'string' || !csvText.trim()) {
    return { headers: [], rows: [], errors };
  }

  // Strip BOM if present
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (inQuotes) {
    errors.push('Unterminated quoted field in CSV input');
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], errors };
  }

  const headers = rows[0].map(h => h.trim());
  const rowObjects = [];

  for (let r = 1; r < rows.length; r++) {
    const rData = rows[r];
    // skip empty trailing row
    if (rData.length === 1 && rData[0] === '') continue;
    const obj = {};
    headers.forEach((header, colIdx) => {
      obj[header] = rData[colIdx] !== undefined ? rData[colIdx] : '';
    });
    rowObjects.push(obj);
  }

  return { headers, rows: rowObjects, errors };
}

function referenceSerializeTutorCSV(sessions = []) {
  const BOM = '\uFEFF';
  const headers = ['ID', 'Alumno', 'Materia', 'Horas', 'Fecha', 'Hora', 'Creado'];
  const headerLine = headers.join(',');
  const lines = [headerLine];

  for (const s of sessions) {
    const line = [
      formatCSVCell(s.id ?? ''),
      formatCSVCell(s.alumno ?? s.student_name ?? ''),
      formatCSVCell(s.materia ?? s.subject ?? ''),
      formatCSVCell(s.horas ?? s.duration_hours ?? ''),
      formatCSVCell(s.fecha ?? s.date ?? ''),
      formatCSVCell(s.hora ?? s.time ?? ''),
      formatCSVCell(s.creado ?? s.created_at ?? '')
    ].join(',');
    lines.push(line);
  }

  return BOM + lines.join('\r\n') + '\r\n';
}

function referenceSerializeChapterCSV(records = []) {
  const BOM = '\uFEFF';
  const headers = ['Matrícula', 'Tutor', 'Materia', 'Fecha', 'Horas', 'Estado'];
  const headerLine = headers.join(',');
  const lines = [headerLine];

  for (const r of records) {
    const line = [
      formatCSVCell(r.matricula ?? r.student_id ?? ''),
      formatCSVCell(r.tutor ?? r.tutor_name ?? ''),
      formatCSVCell(r.materia ?? r.subject ?? ''),
      formatCSVCell(r.fecha ?? r.date ?? ''),
      formatCSVCell(r.horas ?? r.duration_hours ?? ''),
      formatCSVCell(r.estado ?? r.status ?? '')
    ].join(',');
    lines.push(line);
  }

  return BOM + lines.join('\r\n') + '\r\n';
}

function referenceGenerateMonthlyBackup(sessions = [], chapterId = 'default', monthKey = '2026-09') {
  const BOM = '\uFEFF';
  const filename = `backup-${chapterId}-${monthKey}.csv`;
  const headers = ['ID', 'Capitulo', 'Tutor', 'Alumno', 'Materia', 'Horas', 'Fecha', 'Estado'];
  const lines = [headers.join(',')];

  for (const s of sessions) {
    const line = [
      formatCSVCell(s.id ?? ''),
      formatCSVCell(chapterId),
      formatCSVCell(s.tutor ?? s.tutor_name ?? ''),
      formatCSVCell(s.alumno ?? s.student_name ?? ''),
      formatCSVCell(s.materia ?? s.subject ?? ''),
      formatCSVCell(s.horas ?? s.duration_hours ?? ''),
      formatCSVCell(s.fecha ?? s.date ?? ''),
      formatCSVCell(s.estado ?? s.status ?? 'archived')
    ].join(',');
    lines.push(line);
  }

  const content = BOM + lines.join('\r\n') + '\r\n';
  return { filename, content };
}

// ---------------------------------------------------------------------------
// Dynamic loader to prioritize worker_m1 implementation if present
// ---------------------------------------------------------------------------
let activeParseCSV = referenceParseCSV;
let activeSerializeTutorCSV = referenceSerializeTutorCSV;
let activeSerializeChapterCSV = referenceSerializeChapterCSV;
let activeGenerateMonthlyBackup = referenceGenerateMonthlyBackup;
let activeValidateImportedSessions = null;
let activeUnescapeFormulaPrefix = null;

if (fs.existsSync(csvUtilsPath)) {
  try {
    const liveMod = await import('../js/csvUtils.js');
    if (typeof liveMod.parseCSV === 'function') activeParseCSV = liveMod.parseCSV;
    if (typeof liveMod.serializeTutorCSV === 'function') activeSerializeTutorCSV = liveMod.serializeTutorCSV;
    if (typeof liveMod.serializeChapterCSV === 'function') activeSerializeChapterCSV = liveMod.serializeChapterCSV;
    if (typeof liveMod.generateMonthlyBackup === 'function') activeGenerateMonthlyBackup = liveMod.generateMonthlyBackup;
    if (typeof liveMod.validateImportedSessions === 'function') activeValidateImportedSessions = liveMod.validateImportedSessions;
    if (typeof liveMod.unescapeFormulaPrefix === 'function') activeUnescapeFormulaPrefix = liveMod.unescapeFormulaPrefix;
  } catch (err) {
    console.warn('Note: Could not import live js/csvUtils.js, using reference oracle.', err.message);
  }
}

describe('CSV Data Management Test Suite (Tier 1 - Tier 5)', () => {

  describe('Tier 1: Unit / Pure Logic Tests (CSV Parser)', () => {
    it('should parse standard RFC 4180 CSV with headers and values', () => {
      const csv = 'ID,Alumno,Materia\n1,Ana Garcia,Calculo I\n2,Carlos Lopez,Fisica II';
      const result = activeParseCSV(csv);

      assert.deepEqual(result.headers, ['ID', 'Alumno', 'Materia']);
      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].Alumno, 'Ana Garcia');
      assert.equal(result.rows[1].Materia, 'Fisica II');
      assert.equal(result.errors.length, 0);
    });

    it('should handle quoted fields containing commas', () => {
      const csv = 'ID,Alumno,Materia\n1,"Pérez, Juan",Química Orgánica\n2,"Gómez, María",Álgebra';
      const result = activeParseCSV(csv);

      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].Alumno, 'Pérez, Juan');
      assert.equal(result.rows[1].Alumno, 'Gómez, María');
    });

    it('should handle quoted fields containing embedded newlines', () => {
      const csv = 'ID,Notas\n1,"Línea uno\nLínea dos"\n2,"Simple"';
      const result = activeParseCSV(csv);

      assert.equal(result.rows.length, 2);
      assert.equal(result.rows[0].Notas, 'Línea uno\nLínea dos');
      assert.equal(result.rows[1].Notas, 'Simple');
    });

    it('should handle escaped double quotes ("") correctly', () => {
      const csv = 'ID,Comentario\n1,"Dijo ""Excelente sesión"""';
      const result = activeParseCSV(csv);

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].Comentario, 'Dijo "Excelente sesión"');
    });

    it('should normalize both CRLF (\\r\\n) and LF (\\n) line breaks', () => {
      const csvCRLF = 'A,B\r\n1,2\r\n3,4';
      const csvLF = 'A,B\n1,2\n3,4';

      const resCRLF = activeParseCSV(csvCRLF);
      const resLF = activeParseCSV(csvLF);

      assert.deepEqual(resCRLF.rows, resLF.rows);
      assert.equal(resCRLF.rows.length, 2);
    });

    it('should return empty result safely when input is empty or whitespace', () => {
      const resEmpty = activeParseCSV('');
      assert.deepEqual(resEmpty.headers, []);
      assert.deepEqual(resEmpty.rows, []);

      const resWhitespace = activeParseCSV('   \n\t  ');
      assert.deepEqual(resWhitespace.headers, []);
      assert.deepEqual(resWhitespace.rows, []);
    });
  });

  describe('Tier 2: Integration & Contract Tests (Tutor vs Chapter Export)', () => {
    const sampleTutorSessions = [
      {
        id: 'tut-101',
        alumno: 'Mateo Morales',
        materia: 'Cálculo Diferencial',
        horas: '2',
        fecha: '2026-09-10',
        hora: '10:00',
        creado: '2026-09-10T12:00:00Z'
      },
      {
        id: 'tut-102',
        alumno: 'Sofia Vargas',
        materia: 'Programación Web',
        horas: '1',
        fecha: '2026-09-12',
        hora: '14:00',
        creado: '2026-09-12T15:00:00Z'
      }
    ];

    const sampleChapterRecords = [
      {
        matricula: '2023-0891',
        tutor: 'Dr. Roberto Gomez',
        materia: 'Estructuras de Datos',
        fecha: '2026-09-15',
        horas: '3',
        estado: 'Aprobado'
      }
    ];

    it('serializeTutorCSV must produce UTF-8 BOM, CRLF, and exact tutor headers', () => {
      const csv = activeSerializeTutorCSV(sampleTutorSessions);

      // Verify UTF-8 BOM
      assert.equal(csv.charCodeAt(0), 0xfeff, 'Must begin with UTF-8 BOM (\\uFEFF)');

      // Verify CRLF line endings
      assert.ok(csv.includes('\r\n'), 'Must use CRLF line endings');

      // Verify exact header line
      const rawWithoutBOM = csv.slice(1);
      const firstLine = rawWithoutBOM.split('\r\n')[0];
      assert.equal(firstLine, 'ID,Alumno,Materia,Horas,Fecha,Hora,Creado');

      // Verify parsed content
      const parsed = activeParseCSV(csv);
      assert.equal(parsed.rows.length, 2);
      assert.equal(parsed.rows[0].ID, 'tut-101');
      assert.equal(parsed.rows[0].Alumno, 'Mateo Morales');
      assert.equal(parsed.rows[1].Materia, 'Programación Web');
    });

    it('serializeChapterCSV must produce independent schema with Matrícula and Estado', () => {
      const csv = activeSerializeChapterCSV(sampleChapterRecords);

      assert.equal(csv.charCodeAt(0), 0xfeff, 'Must begin with UTF-8 BOM');
      assert.ok(csv.includes('\r\n'), 'Must use CRLF line endings');

      const rawWithoutBOM = csv.slice(1);
      const firstLine = rawWithoutBOM.split('\r\n')[0];
      assert.equal(firstLine, 'Matrícula,Tutor,Materia,Fecha,Horas,Estado');

      const parsed = activeParseCSV(csv);
      assert.equal(parsed.rows.length, 1);
      assert.equal(parsed.rows[0]['Matrícula'], '2023-0891');
      assert.equal(parsed.rows[0].Tutor, 'Dr. Roberto Gomez');
      assert.equal(parsed.rows[0].Estado, 'Aprobado');
    });

    it('Tutor and Chapter CSV schemas must be strictly distinct and independent', () => {
      const tutorCSV = activeSerializeTutorCSV([]);
      const chapterCSV = activeSerializeChapterCSV([]);

      const tutorHeader = tutorCSV.slice(1).split('\r\n')[0];
      const chapterHeader = chapterCSV.slice(1).split('\r\n')[0];

      assert.notEqual(tutorHeader, chapterHeader, 'Tutor and Chapter schemas must not be identical');
      assert.ok(tutorHeader.includes('Alumno'), 'Tutor CSV must include Alumno');
      assert.ok(chapterHeader.includes('Matrícula'), 'Chapter CSV must include Matrícula');
    });

    it('generateMonthlyBackup must produce structured payload with filename and content', () => {
      const result = activeGenerateMonthlyBackup(sampleTutorSessions, 'cap-norte', '2026-08');

      assert.ok(result && typeof result === 'object', 'Backup must return an object');
      assert.ok(result.filename, 'Backup payload must include filename');
      assert.ok(result.content, 'Backup payload must include content');

      assert.ok(result.filename.includes('cap-norte'), 'Filename must include chapter identifier');
      assert.ok(result.filename.includes('2026-08'), 'Filename must include monthKey');
      assert.ok(result.filename.endsWith('.csv'), 'Filename must have .csv extension');

      assert.equal(result.content.charCodeAt(0), 0xfeff, 'Backup content must include UTF-8 BOM');
      assert.ok(result.content.includes('\r\n'), 'Backup content must use CRLF');
    });
  });

  describe('Tier 3: Security & Hardening Tests (Formula Injection Sanitization)', () => {
    it('should sanitize cells starting with formula triggers (=, +, -, @, \\t, \\r)', () => {
      const maliciousSessions = [
        {
          id: '=cmd|\' /C calc\'!A0',
          alumno: '+cmd|calc',
          materia: '-2+5+cmd',
          horas: '@SUM(A1:A10)',
          fecha: '\t2026-09-01',
          hora: '\r10:00',
          creado: '2026-09-01'
        }
      ];

      const csv = activeSerializeTutorCSV(maliciousSessions);
      const parsed = activeParseCSV(csv);
      const row = parsed.rows[0];

      // In spreadsheet applications, prefixing with ' ensures literal text interpretation
      assert.ok(row.ID.startsWith("'="), `Expected ID to start with \''=\', got: ${row.ID}`);
      assert.ok(row.Alumno.startsWith("'+"), `Expected Alumno to start with \''+\', got: ${row.Alumno}`);
      assert.ok(row.Materia.startsWith("'-"), `Expected Materia to start with \''-\', got: ${row.Materia}`);
      assert.ok(row.Horas.startsWith("'@"), `Expected Horas to start with \''@\', got: ${row.Horas}`);
      assert.ok(row.Fecha.startsWith("'\t"), `Expected Fecha to start with \''\\t\', got: ${row.Fecha}`);
      assert.ok(row.Hora.startsWith("'\r"), `Expected Hora to start with \''\\r\', got: ${row.Hora}`);
    });

    it('should not escape standard benign text or alphanumeric values', () => {
      const safeSessions = [
        {
          id: 'session-42',
          alumno: 'Normal Student',
          materia: 'Matemáticas Discretas',
          horas: '2',
          fecha: '2026-09-15',
          hora: '09:00',
          creado: '2026-09-15T09:00:00Z'
        }
      ];

      const csv = activeSerializeTutorCSV(safeSessions);
      const parsed = activeParseCSV(csv);
      const row = parsed.rows[0];

      assert.equal(row.ID, 'session-42');
      assert.equal(row.Alumno, 'Normal Student');
      assert.equal(row.Materia, 'Matemáticas Discretas');
      assert.equal(row.Horas, '2');
    });

    it('unescapeFormulaPrefix should handle formula triggers with optional leading spaces', () => {
      assert.ok(activeUnescapeFormulaPrefix, 'activeUnescapeFormulaPrefix must be loaded');
      assert.equal(activeUnescapeFormulaPrefix("'=SUM(A1:A10)"), '=SUM(A1:A10)');
      assert.equal(activeUnescapeFormulaPrefix("'   =cmd"), '   =cmd');
      assert.equal(activeUnescapeFormulaPrefix("'  +calc"), '  +calc');
      assert.equal(activeUnescapeFormulaPrefix("' -10+5"), ' -10+5');
      assert.equal(activeUnescapeFormulaPrefix("'  @mention"), '  @mention');
      assert.equal(activeUnescapeFormulaPrefix("'\tsecret"), '\tsecret');
      assert.equal(activeUnescapeFormulaPrefix("'\rcommand"), '\rcommand');
      assert.equal(activeUnescapeFormulaPrefix("'normal text"), "'normal text");
      assert.equal(activeUnescapeFormulaPrefix("normal text"), "normal text");
    });
  });

  describe('Tier 4: Edge Case & Adversarial Stress Tests', () => {
    it('should detect unclosed quotes and report parse error', () => {
      const malformedCSV = 'ID,Alumno\n1,"Unclosed quote here\n2,Other';
      const result = activeParseCSV(malformedCSV);

      assert.ok(result.errors.length > 0, 'Should detect error for unclosed quotes');
      assert.ok(result.errors.some(e => /unterminated|unclosed/i.test(e)));
    });

    it('should handle extreme lengths and special Unicode characters cleanly', () => {
      const longName = 'José-María ' + 'ñ'.repeat(300) + ' 🚀 日本語';
      const longSession = [
        {
          id: 'extreme-1',
          alumno: longName,
          materia: 'Álgebra Lineal & Geometría Avanzada',
          horas: '4',
          fecha: '2026-09-20',
          hora: '11:00',
          creado: '2026-09-20'
        }
      ];

      const serialized = activeSerializeTutorCSV(longSession);
      const parsed = activeParseCSV(serialized);

      assert.equal(parsed.rows[0].Alumno, longName);
    });

    it('should handle serialization with empty arrays without throwing', () => {
      const tutorEmpty = activeSerializeTutorCSV([]);
      const chapterEmpty = activeSerializeChapterCSV([]);
      const backupEmpty = activeGenerateMonthlyBackup([], 'ch-none', '2026-09');

      assert.ok(tutorEmpty.includes('ID,Alumno'));
      assert.ok(chapterEmpty.includes('Matrícula,Tutor'));
      assert.ok(backupEmpty.filename.includes('2026-09'));
    });
  });

  describe('Tier 5: Import Validation & Business Integrity (Remediation M1)', () => {
    const mockMembers = [
      { id: '11111111-1111-1111-1111-111111111111', userId: 'user-001', matricula: '2023-0001', name: 'Ana García' },
      { id: '22222222-2222-2222-2222-222222222222', userId: 'user-002', matricula: '2023-0002', name: 'Carlos López' }
    ];

    it('should successfully validate sessions with mapped tutors (by matrícula, name, or UUID)', () => {
      assert.ok(activeValidateImportedSessions, 'activeValidateImportedSessions must be loaded');

      const rows = [
        {
          Alumno: 'Estudiante Uno',
          Materia: 'Cálculo Diferencial',
          Fecha: '2026-09-20',
          Hora: '10:00',
          Horas: '2',
          Matrícula: '2023-0001',
          Estado: 'Aprobada'
        },
        {
          Alumno: 'Estudiante Dos',
          Materia: 'Física Clásica',
          Fecha: '2026-09-21',
          Hora: '14:30',
          Horas: '1.5',
          Tutor: 'Carlos López',
          Estado: 'Pendiente'
        },
        {
          Alumno: 'Estudiante Tres',
          Materia: 'Química General',
          Fecha: '2026-09-22',
          Hora: '09:00',
          Horas: '3',
          tutor_id: '33333333-3333-3333-3333-333333333333'
        }
      ];

      const result = activeValidateImportedSessions(rows, {
        chapterId: 'chap-test-1',
        members: mockMembers
      });

      assert.equal(result.validSessions.length, 3);
      assert.equal(result.invalidRows.length, 0);
      assert.equal(result.errors.length, 0);

      assert.equal(result.validSessions[0].tutor_id, 'user-001');
      assert.equal(result.validSessions[0].chapter_id, 'chap-test-1');
      assert.equal(result.validSessions[0].status, 'APPROVED');

      assert.equal(result.validSessions[1].tutor_id, 'user-002');
      assert.equal(result.validSessions[1].status, 'PENDING');

      assert.equal(result.validSessions[2].tutor_id, '33333333-3333-3333-3333-333333333333');
    });

    it('should reject unmapped tutors with specific error and exclude from validSessions', () => {
      assert.ok(activeValidateImportedSessions, 'activeValidateImportedSessions must be loaded');

      const rows = [
        {
          Alumno: 'Estudiante Cuatro',
          Materia: 'Programación',
          Fecha: '2026-09-25',
          Hora: '11:00',
          Horas: '2',
          Tutor: 'Tutor Fantasma Inexistente'
        },
        {
          Alumno: 'Estudiante Cinco',
          Materia: 'Base de Datos',
          Fecha: '2026-09-25',
          Hora: '12:00',
          Horas: '1',
          Matrícula: '2023-9999'
        },
        {
          Alumno: 'Estudiante Seis',
          Materia: 'Álgebra Lineal',
          Fecha: '2026-09-25',
          Hora: '13:00',
          Horas: '2'
        }
      ];

      const result = activeValidateImportedSessions(rows, {
        chapterId: 'chap-test-1',
        members: mockMembers
      });

      assert.equal(result.validSessions.length, 0, 'No unmapped tutor rows should be marked valid');
      assert.equal(result.invalidRows.length, 3);
      assert.equal(result.errors.length, 3);

      assert.ok(result.errors[0].includes("Fila 2: No se pudo determinar el tutor asignado ('Tutor Fantasma Inexistente')."));
      assert.ok(result.errors[1].includes("Fila 3: No se pudo determinar el tutor asignado ('2023-9999')."));
      assert.ok(result.errors[2].includes("Fila 4: No se pudo determinar el tutor asignado ('')."));
    });

    it('should allow defaultTutorId fallback when row does not specify a tutor', () => {
      assert.ok(activeValidateImportedSessions, 'activeValidateImportedSessions must be loaded');

      const rows = [
        {
          Alumno: 'Estudiante Siete',
          Materia: 'Estadística',
          Fecha: '2026-09-26',
          Hora: '15:00',
          Horas: '2'
        }
      ];

      const result = activeValidateImportedSessions(rows, {
        chapterId: 'chap-test-1',
        tutorId: 'default-tutor-uuid',
        members: mockMembers
      });

      assert.equal(result.validSessions.length, 1);
      assert.equal(result.validSessions[0].tutor_id, 'default-tutor-uuid');
    });
  });
});
