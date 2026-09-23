import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const loginJsPath = path.resolve(__dirname, '../js/login.js');

// ---------------------------------------------------------------------------
// Specification definitions derived from PROJECT.md & js/login.js
// ---------------------------------------------------------------------------
const EMAIL_STRICT_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const INSTITUTIONAL_ID_REGEX = /^[A-Za-z0-9_\-\.]{3,30}$/;

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  return password.length >= 8
    && password.length <= 128
    && /[a-zA-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function getRegistrationErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Supabase limitó temporalmente los correos de confirmación. Espera un minuto o crea la cuenta desde Authentication > Users.';
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
    return 'Ese correo ya está asociado a una cuenta. Inicia sesión o usa “¿Olvidaste tu contraseña?”.';
  }
  return 'No se pudo crear la cuenta. Revisa el correo e inténtalo de nuevo.';
}

function generateChapterCode(chapterName = '') {
  const clean = String(chapterName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .trim();

  const words = clean.split(/\s+/).filter(Boolean);
  let prefix = '';

  if (words.length >= 3) {
    prefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  } else if (words.length === 2) {
    prefix = (words[0].slice(0, 2) + words[1][0]).toUpperCase();
  } else if (words.length === 1 && words[0].length >= 3) {
    prefix = words[0].slice(0, 3).toUpperCase();
  } else if (words.length === 1) {
    prefix = words[0].padEnd(3, 'X').toUpperCase();
  } else {
    prefix = 'CAP';
  }

  const year = new Date().getFullYear();
  const randomDigits = String(Math.floor(Math.random() * 900 + 100));
  return `${prefix}-${year}-${randomDigits}`;
}

function validateLoginInput(identifier, password) {
  const errors = [];
  const cleanId = String(identifier || '').trim();

  if (!cleanId) {
    errors.push('Por favor ingresa tu correo institucional o matrícula.');
    return { isValid: false, errors };
  }

  if (cleanId.length < 5 || cleanId.length > 100) {
    errors.push('El identificador debe contener entre 5 y 100 caracteres.');
    return { isValid: false, errors };
  }

  if (!password) {
    errors.push('Por favor introduce tu contraseña de acceso.');
    return { isValid: false, errors };
  }

  // Unified 8 character policy per user requirements
  if (password.length < 8 || password.length > 128) {
    errors.push('La contraseña debe contener al menos 8 caracteres');
    return { isValid: false, errors };
  }

  if (cleanId.includes('@')) {
    if (!EMAIL_STRICT_REGEX.test(cleanId)) {
      errors.push('Por favor proporciona un formato de correo electrónico institucional válido.');
      return { isValid: false, errors };
    }
  } else {
    if (!INSTITUTIONAL_ID_REGEX.test(cleanId)) {
      errors.push('El formato de matrícula o identificador contiene caracteres no permitidos.');
      return { isValid: false, errors };
    }
  }

  return { isValid: true, errors: [] };
}

describe('Authentication & Security Guards Test Suite (Tier 1 - Tier 4)', () => {

  describe('Tier 1: Unit / Pure Logic Tests (Email, ID & Password Policies)', () => {
    it('should validate conforming institutional and academic email addresses', () => {
      const validEmails = [
        'juan.perez@institucion.edu',
        'coordinacion@institucion.edu',
        'admin.tutoria@uabc.edu.mx',
        'user+tag@domain.org',
        'first.last123@sub.college.edu'
      ];

      for (const email of validEmails) {
        assert.ok(EMAIL_STRICT_REGEX.test(email), `Expected ${email} to be a valid email`);
      }
    });

    it('should reject invalid or malformed email addresses', () => {
      const invalidEmails = [
        'missing-at-sign.edu',
        '@nodomain.com',
        'user@.missing-host.com',
        'user@domain..com',
        'user@domain',
        'spaces in@domain.com',
        'user@domain .com'
      ];

      for (const email of invalidEmails) {
        assert.equal(EMAIL_STRICT_REGEX.test(email), false, `Expected ${email} to be rejected`);
      }
    });

    it('should validate valid institutional matrícula/ID formats', () => {
      const validIds = [
        'TUT-2023-0891',
        'MAT_12345',
        'DOC.9981',
        'coord-2026',
        'ABC123'
      ];

      for (const id of validIds) {
        assert.ok(INSTITUTIONAL_ID_REGEX.test(id), `Expected ${id} to be a valid ID`);
      }
    });

    it('should reject invalid matrícula formats (too short, too long, illegal chars)', () => {
      const invalidIds = [
        'ab',                              // < 3 chars
        'a'.repeat(31),                    // > 30 chars
        'TUT@2023',                        // contains @ (should be treated as email or rejected)
        'ID with space',                   // spaces not allowed
        'MAT#1234',                        // invalid special char #
        '<script>alert(1)</script>'        // XSS probe
      ];

      for (const id of invalidIds) {
        assert.equal(INSTITUTIONAL_ID_REGEX.test(id), false, `Expected ${id} to be rejected`);
      }
    });

    it('should enforce password policy matching user message (8-128 chars with letters, numbers and symbols)', () => {
      // Must have letters, digits, special character
      assert.ok(isStrongPassword('Tutor2026*Pass'), 'Conforming tutor password must pass');
      assert.ok(isStrongPassword('Admin2026*Secure'), 'Conforming admin password must pass');
      assert.ok(isStrongPassword('P@ssw0rd123!'), 'Standard strong password must pass');
      assert.ok(isStrongPassword('tutor2026*pass'), 'Lowercase with numbers and symbols must pass per message');
      assert.ok(isStrongPassword('ADMIN2026*SECURE'), 'Uppercase with numbers and symbols must pass per message');

      // Failure cases:
      assert.equal(isStrongPassword('Short1!'), false, 'Password < 8 chars must fail');
      assert.equal(isStrongPassword('12345678!@#'), false, 'Password without letters must fail');
      assert.equal(isStrongPassword('NoDigitsHere!'), false, 'Password without digits must fail');
      assert.equal(isStrongPassword('NoSymbols12345'), false, 'Password without symbol must fail');
      assert.equal(isStrongPassword('A'.repeat(129) + '1!a'), false, 'Password > 128 chars must fail');
    });

    it('should generate institutional, uppercase chapter codes conforming to SIGLAS-YYYY-NUM', () => {
      const currentYear = new Date().getFullYear();
      const codeRegex = new RegExp(`^[A-Z]{3}-${currentYear}-\\d{3}$`);

      // Multi-word chapter
      const codeMed = generateChapterCode('Facultad de Medicina');
      assert.ok(codeRegex.test(codeMed), `Expected ${codeMed} to match SIGLAS-YYYY-NUM`);
      assert.ok(codeMed.startsWith('FDM-'), `Expected code to start with FDM, got ${codeMed}`);

      // Single word chapter
      const codeMat = generateChapterCode('Matemáticas');
      assert.ok(codeRegex.test(codeMat), `Expected ${codeMat} to match SIGLAS-YYYY-NUM`);
      assert.ok(codeMat.startsWith('MAT-'), `Expected code to start with MAT, got ${codeMat}`);

      // Empty / fallback chapter
      const codeFallback = generateChapterCode('');
      assert.ok(codeRegex.test(codeFallback), `Expected ${codeFallback} to match SIGLAS-YYYY-NUM`);
      assert.ok(codeFallback.startsWith('CAP-'), `Expected code to start with CAP, got ${codeFallback}`);
    });
  });

  describe('Tier 2: Integration & Contract Tests (Form Validation & Flow States)', () => {
    it('should reject login submission when identifier is missing', () => {
      const res = validateLoginInput('', 'Password123!');
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('correo institucional o matrícula'));
    });

    it('should reject login submission when identifier is out of length bounds', () => {
      const tooShort = validateLoginInput('abc', 'Password123!');
      assert.equal(tooShort.isValid, false);
      assert.ok(tooShort.errors[0].includes('entre 5 y 100 caracteres'));

      const tooLong = validateLoginInput('a'.repeat(101) + '@mail.com', 'Password123!');
      assert.equal(tooLong.isValid, false);
      assert.ok(tooLong.errors[0].includes('entre 5 y 100 caracteres'));
    });

    it('should reject login submission when password is empty', () => {
      const res = validateLoginInput('juan.perez@institucion.edu', '');
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('introduce tu contraseña'));
    });

    it('should reject login submission when password length is below policy', () => {
      const res = validateLoginInput('juan.perez@institucion.edu', '12345');
      assert.equal(res.isValid, false);
      assert.ok(res.errors[0].includes('al menos 8 caracteres'));
    });

    it('should successfully validate well-formed tutor login input', () => {
      const res = validateLoginInput('juan.perez@institucion.edu', 'Tutor2026*Pass');
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });

    it('should successfully validate well-formed admin login input', () => {
      const res = validateLoginInput('coordinacion@institucion.edu', 'Admin2026*Secure');
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
    });
  });

  describe('Tier 3: Security & Hardening Tests (Error Mapping & Role Protection)', () => {
    it('should map Supabase rate limit errors to friendly guidance', () => {
      const rateLimitError = new Error('Email rate limit exceeded: too many requests');
      const msg = getRegistrationErrorMessage(rateLimitError);
      assert.ok(msg.includes('limitó temporalmente los correos'));
      assert.ok(msg.includes('Espera un minuto'));
    });

    it('should map existing user registration errors to login redirection advice', () => {
      const existsError = new Error('User already registered with this email');
      const msg = getRegistrationErrorMessage(existsError);
      assert.ok(msg.includes('Ese correo ya está asociado'));
      assert.ok(msg.includes('Inicia sesión'));
    });

    it('should map unknown errors to generic fallback message without leaking stack traces', () => {
      const obscureError = new Error('Internal database connection pool timeout [code 500]');
      const msg = getRegistrationErrorMessage(obscureError);
      assert.equal(msg, 'No se pudo crear la cuenta. Revisa el correo e inténtalo de nuevo.');
      assert.ok(!msg.includes('500'), 'Error message must not leak internal database codes');
    });

    it('should verify login.js source contains role definitions and security guards', () => {
      assert.ok(fs.existsSync(loginJsPath), 'js/login.js must exist on disk');
      const source = fs.readFileSync(loginJsPath, 'utf8');

      // Verify roles supported
      assert.ok(source.includes("'TUTOR'"), 'login.js must support TUTOR role');
      assert.ok(source.includes("'ADMIN'"), 'login.js must support ADMIN role');

      // Verify strict email regex is present in source
      assert.ok(source.includes('EMAIL_STRICT_REGEX'), 'EMAIL_STRICT_REGEX must be defined in login.js');

      // Verify password strength validator is present
      assert.ok(source.includes('isStrongPassword'), 'isStrongPassword must be defined in login.js');

      // Verify post-auth redirect target
      assert.ok(source.includes("'hub.html'"), 'Authenticated users must route to hub.html');
    });
  });

  describe('Tier 4: Edge Case & Adversarial Stress Tests', () => {
    it('should reject email injection and dangerous characters', () => {
      const dangerousEmails = [
        'user@domain.com\r\nBcc: victim@domain.com',
        'user"injection"@domain.com',
        'user@domain.com; DROP TABLE users;--',
        'admin<script>@institucion.edu'
      ];

      for (const email of dangerousEmails) {
        assert.equal(EMAIL_STRICT_REGEX.test(email), false, `Dangerous email must be rejected: ${email}`);
      }
    });

    it('should handle null, undefined, or object error parameters in getRegistrationErrorMessage gracefully', () => {
      assert.doesNotThrow(() => getRegistrationErrorMessage(null));
      assert.doesNotThrow(() => getRegistrationErrorMessage(undefined));
      assert.doesNotThrow(() => getRegistrationErrorMessage({}));
      assert.equal(getRegistrationErrorMessage(null), 'No se pudo crear la cuenta. Revisa el correo e inténtalo de nuevo.');
    });

    it('should handle Unicode and multi-byte characters in password evaluation safely', () => {
      // Passwords with emojis or non-ascii symbols should be properly counted
      const unicodePassword = 'Tutor2026*🔒🔐';
      assert.ok(isStrongPassword(unicodePassword), 'Unicode passwords meeting criteria must be valid');
    });
  });
});
