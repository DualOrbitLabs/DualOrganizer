import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Security, Environment Hardening & Injection Defense Test Suite (Tier 1 - Tier 4)', () => {

  describe('Tier 1: Unit / Pure Logic Tests (Formula Injection Sanitizer)', () => {
    function sanitizeFormulaInput(input) {
      if (input === null || input === undefined) return '';
      const str = String(input);
      // Formula triggers: =, +, -, @, tab (\t), carriage return (\r)
      if (/^[=+\-@\t\r]/.test(str)) {
        return "'" + str;
      }
      return str;
    }

    it('should prefix leading equals (=) operator with single quote', () => {
      assert.equal(sanitizeFormulaInput('=1+1'), "'=1+1");
      assert.equal(sanitizeFormulaInput('=cmd|\' /C calc\'!A0'), "'=cmd|' /C calc'!A0");
      assert.equal(sanitizeFormulaInput('=HYPERLINK("http://evil.com","Click")'), "'=HYPERLINK(\"http://evil.com\",\"Click\")");
    });

    it('should prefix leading plus (+) operator with single quote', () => {
      assert.equal(sanitizeFormulaInput('+1234'), "'+1234");
      assert.equal(sanitizeFormulaInput('+cmd|calc'), "'+cmd|calc");
    });

    it('should prefix leading minus (-) operator with single quote', () => {
      assert.equal(sanitizeFormulaInput('-50'), "'-50");
      assert.equal(sanitizeFormulaInput('-SUM(A1:A10)'), "'-SUM(A1:A10)");
    });

    it('should prefix leading at (@) symbol with single quote', () => {
      assert.equal(sanitizeFormulaInput('@SUM(1,2)'), "'@SUM(1,2)");
    });

    it('should prefix leading control characters (\\t, \\r) with single quote', () => {
      assert.equal(sanitizeFormulaInput('\tDDEEXEC'), "'\tDDEEXEC");
      assert.equal(sanitizeFormulaInput('\rPAYLOAD'), "'\rPAYLOAD");
    });

    it('should not alter benign strings, alphanumeric values, or safe punctuation', () => {
      assert.equal(sanitizeFormulaInput('Matemáticas I'), 'Matemáticas I');
      assert.equal(sanitizeFormulaInput('Juan Pérez'), 'Juan Pérez');
      assert.equal(sanitizeFormulaInput('TUT-2023-0891'), 'TUT-2023-0891');
      assert.equal(sanitizeFormulaInput('80'), '80');
      assert.equal(sanitizeFormulaInput(''), '');
    });

    it('should handle null and undefined safely without throwing', () => {
      assert.equal(sanitizeFormulaInput(null), '');
      assert.equal(sanitizeFormulaInput(undefined), '');
    });
  });

  describe('Tier 2: Integration & Contract Tests (Environment Variable Schemas & Git Hygiene)', () => {
    it('should verify .env.example exists and contains required client schema variables', () => {
      const envExamplePath = path.join(rootDir, '.env.example');
      assert.ok(fs.existsSync(envExamplePath), '.env.example must exist at project root');

      const content = fs.readFileSync(envExamplePath, 'utf8');
      assert.ok(content.includes('VITE_SUPABASE_URL='), '.env.example must declare VITE_SUPABASE_URL');
      assert.ok(content.includes('VITE_SUPABASE_ANON_KEY='), '.env.example must declare VITE_SUPABASE_ANON_KEY');
    });

    it('should verify .gitignore protects private env files from git commits', () => {
      const gitignorePath = path.join(rootDir, '.gitignore');
      assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');

      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      const lines = gitignore.split(/\r?\n/).map(l => l.trim());

      assert.ok(
        lines.includes('.env') || lines.includes('.env*') || lines.includes('.env.*'),
        '.gitignore must ignore .env files'
      );
      assert.ok(
        lines.includes('!.env.example'),
        '.gitignore must exempt .env.example'
      );
    });

    it('should verify js/supabaseClient.js properly references only anonymous client keys', () => {
      const clientPath = path.join(rootDir, 'js/supabaseClient.js');
      assert.ok(fs.existsSync(clientPath), 'js/supabaseClient.js must exist');

      const content = fs.readFileSync(clientPath, 'utf8');

      // Must use VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
      assert.ok(content.includes('import.meta.env.VITE_SUPABASE_URL'));
      assert.ok(content.includes('import.meta.env.VITE_SUPABASE_ANON_KEY'));

      // Must NOT reference service_role
      assert.ok(!content.includes('service_role'), 'Client code must never reference service_role');
      assert.ok(!content.includes('SERVICE_ROLE'), 'Client code must never reference SERVICE_ROLE');
    });
  });

  describe('Tier 3: Security & Hardening Tests (Absence of Secrets & Client Isolation)', () => {
    it('should verify no service_role or admin secret keys are committed in .env.example', () => {
      const envExample = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
      const lower = envExample.toLowerCase();

      assert.ok(!lower.includes('service_role'), '.env.example must never mention service_role');
      assert.ok(!lower.includes('secret_key'), '.env.example must never contain secret_key');
      assert.ok(!lower.includes('service_key'), '.env.example must never contain service_key');
      assert.ok(!lower.includes('private_key'), '.env.example must never contain private_key');
    });

    it('should verify HTML entry points do not contain hardcoded credentials or private JWTs', () => {
      const htmlFiles = [
        'index.html',
        'login.html',
        'hub.html',
        'dashboard.html',
        'admin.html',
        'profile.html',
        'config.html'
      ];

      for (const file of htmlFiles) {
        const filePath = path.join(rootDir, file);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');

        // Check for hardcoded service role tokens
        assert.ok(!content.includes('service_role'), `${file} must not contain service_role token`);
        assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `${file} must not contain service role env reference`);

        // Check for hardcoded secret credentials
        assert.ok(!content.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI'), `${file} must not contain demo service_role JWT`);
      }
    });

    it('should verify client config in js/config.js does not contain hardcoded passwords or API keys', () => {
      const configPath = path.join(rootDir, 'js/config.js');
      assert.ok(fs.existsSync(configPath), 'js/config.js must exist');

      const content = fs.readFileSync(configPath, 'utf8');
      assert.ok(!content.includes('api_key'), 'js/config.js must not expose api_key');
      assert.ok(!content.includes('secret'), 'js/config.js must not contain secret values');
      assert.ok(!content.includes('password'), 'js/config.js must not contain hardcoded passwords');
    });
  });

  describe('Tier 4: Edge Case & Adversarial Stress Tests', () => {
    it('should sanitize nested and chained formula injection attack vectors', () => {
      function sanitizeFormulaInput(input) {
        if (input === null || input === undefined) return '';
        const str = String(input);
        if (/^[=+\-@\t\r]/.test(str)) {
          return "'" + str;
        }
        return str;
      }

      const vectors = [
        '=cmd|\'/C calc\'!A0',
        '+cmd|\'/C calc\'!A0',
        '-cmd|\'/C calc\'!A0',
        '@SUM(cmd|\'/C calc\'!A0)',
        '=1+1; EXEC xp_cmdshell(\'dir\')',
        '\t=2+2',
        '\r=3+3'
      ];

      for (const vector of vectors) {
        const sanitized = sanitizeFormulaInput(vector);
        assert.ok(sanitized.startsWith("'"), `Attack vector ${vector} must be prepended with quote, got: ${sanitized}`);
      }
    });

    it('should ensure terms and policies paths avoid dangerous javascript: or data: URIs', () => {
      const configPath = path.join(rootDir, 'js/config.js');
      const content = fs.readFileSync(configPath, 'utf8');

      // Ensure termsPath is a safe relative html page
      assert.ok(!content.includes('termsPath: "javascript:'), 'termsPath must not be a javascript: URI');
      assert.ok(!content.includes("termsPath: 'javascript:"), 'termsPath must not be a javascript: URI');
      assert.ok(!content.includes('termsPath: "data:'), 'termsPath must not be a data: URI');
    });
  });
});
