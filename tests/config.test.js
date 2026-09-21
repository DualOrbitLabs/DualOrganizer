import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar módulo de lógica de configuración
import {
    DEFAULT_PREFERENCES,
    PREFERENCES_STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    readPreferencesFromStorage,
    writePreferencesToStorage,
    arePreferencesEqual,
    getPreferencesDiff,
    applyPreferencesToDOM
} from '../js/configPage.js';

describe('Centralized UI Configuration Suite (Milestone 2)', () => {

    describe('1. Estructura y Semántica de config.html', () => {
        const configHtmlPath = path.join(rootDir, 'config.html');

        it('config.html debe existir en la raíz del proyecto', () => {
            assert.ok(fs.existsSync(configHtmlPath), 'config.html debe existir');
        });

        it('debe incluir elementos semánticos HTML5 estrictos (<header>, <nav>, <main>, <section>, <form>, <footer>)', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('<header>'), 'Debe incluir elemento semántico <header>');
            assert.ok(html.includes('<nav class="navbar-global"'), 'Debe incluir elemento semántico <nav>');
            assert.ok(html.includes('<main class="config-container"'), 'Debe incluir elemento semántico <main>');
            assert.ok(html.includes('<form id="configForm"'), 'Debe incluir formulario semántico <form>');
            assert.ok(html.includes('<section'), 'Debe incluir secciones semánticas <section>');
            assert.ok(html.includes('<footer class="unsaved-changes-bar"'), 'Debe incluir barra flotante semántica <footer>');
        });

        it('debe contener script anti-FOUC en el <head> para carga instantánea de temas', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('data-theme'), 'Anti-FOUC script debe asignar data-theme');
            assert.ok(html.includes('data-density'), 'Anti-FOUC script debe asignar data-density');
            assert.ok(html.includes('data-animations'), 'Anti-FOUC script debe asignar data-animations');
        });

        it('debe contener los radio buttons para temas default-zinc y cool-slate', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('value="default-zinc"'), 'Debe existir opción default-zinc');
            assert.ok(html.includes('value="cool-slate"'), 'Debe existir opción cool-slate');
        });

        it('debe contener los controles de densidad comfortable y compact', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('value="comfortable"'), 'Debe existir opción comfortable');
            assert.ok(html.includes('value="compact"'), 'Debe existir opción compact');
        });

        it('debe contener los controles de animación standard y reduced', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('value="standard"'), 'Debe existir opción standard');
            assert.ok(html.includes('value="reduced"'), 'Debe existir opción reduced');
        });

        it('debe contener barra flotante de cambios sin guardar con botones de Guardar y Descartar', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('id="unsavedChangesBar"'), 'Debe incluir contenedor #unsavedChangesBar');
            assert.ok(html.includes('id="btnDiscardConfig"'), 'Debe incluir botón #btnDiscardConfig');
            assert.ok(html.includes('id="btnSaveConfig"'), 'Debe incluir botón #btnSaveConfig');
            assert.ok(html.includes('dirty-badge-dot'), 'Debe incluir micro-indicador pulsante de estado sucio');
        });

        it('debe contener componente de previsualización en vivo #themeLivePreview', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8');
            assert.ok(html.includes('id="themeLivePreview"'), 'Debe incluir tarjeta de previsualización en vivo');
            assert.ok(html.includes('tabular-nums'), 'Debe emplear números tabulares');
        });

        it('no debe incluir frameworks externos como Tailwind, Bootstrap o FontAwesome en el HTML', () => {
            const html = fs.readFileSync(configHtmlPath, 'utf8').toLowerCase();
            assert.ok(!html.includes('bootstrap'), 'No debe haber referencias a Bootstrap');
            assert.ok(!html.includes('tailwind'), 'No debe haber referencias a Tailwind');
            assert.ok(!html.includes('font-awesome'), 'No debe haber dependencias externas de iconos');
        });
    });

    describe('2. Reglas de Estilo en styles/config.css', () => {
        const configCssPath = path.join(rootDir, 'styles/config.css');

        it('styles/config.css debe existir', () => {
            assert.ok(fs.existsSync(configCssPath), 'styles/config.css debe existir');
        });

        it('debe definir tokens CSS para default-zinc y cool-slate', () => {
            const css = fs.readFileSync(configCssPath, 'utf8');
            assert.ok(css.includes('html[data-theme="default-zinc"]'), 'Debe definir selector default-zinc');
            assert.ok(css.includes('html[data-theme="cool-slate"]'), 'Debe definir selector cool-slate');
        });

        it('debe definir tokens CSS para densidades comfortable y compact', () => {
            const css = fs.readFileSync(configCssPath, 'utf8');
            assert.ok(css.includes('html[data-density="comfortable"]'), 'Debe definir densidad comfortable');
            assert.ok(css.includes('html[data-density="compact"]'), 'Debe definir densidad compact');
        });

        it('debe definir tokens CSS para animaciones standard y reduced', () => {
            const css = fs.readFileSync(configCssPath, 'utf8');
            assert.ok(css.includes('html[data-animations="standard"]'), 'Debe definir animaciones standard');
            assert.ok(css.includes('html[data-animations="reduced"]'), 'Debe definir animaciones reduced');
        });

        it('debe prohibir estrictamente el uso de morados o violetas en la paleta de colores', () => {
            const css = fs.readFileSync(configCssPath, 'utf8').toLowerCase();
            assert.ok(!css.includes('#800080'), 'Prohibido color morado/purple');
            assert.ok(!css.includes('#8a2be2'), 'Prohibido blueviolet');
            assert.ok(!css.includes('#9333ea'), 'Prohibido morado genérico de IA');
            assert.ok(!css.includes('#a855f7'), 'Prohibido violeta de IA');
            assert.ok(!css.includes('purple'), 'No debe contener palabras clave de morado');
            assert.ok(!css.includes('violet'), 'No debe contener palabras clave de violeta');
        });

        it('debe incluir estilos para la barra flotante .unsaved-changes-bar con transición 150-200ms', () => {
            const css = fs.readFileSync(configCssPath, 'utf8');
            assert.ok(css.includes('.unsaved-changes-bar'), 'Debe incluir estilos para .unsaved-changes-bar');
            assert.ok(css.includes('.unsaved-changes-bar.visible'), 'Debe incluir estado .visible');
            assert.ok(css.includes('indicatorPulse'), 'Debe incluir animación pulsante para el micro-indicador');
        });

        it('debe utilizar font-variant-numeric: tabular-nums', () => {
            const css = fs.readFileSync(configCssPath, 'utf8');
            assert.ok(css.includes('tabular-nums'), 'Debe soportar cifras tabulares');
        });
    });

    describe('3. Lógica de Persistencia y Dirty-State en js/configPage.js', () => {
        function createMockStorage(initialData = {}) {
            const store = new Map(Object.entries(initialData));
            return {
                getItem: (k) => (store.has(k) ? store.get(k) : null),
                setItem: (k, v) => store.set(k, String(v)),
                removeItem: (k) => store.delete(k),
                clear: () => store.clear()
            };
        }

        it('debe exportar DEFAULT_PREFERENCES con valores por defecto válidos', () => {
            assert.equal(DEFAULT_PREFERENCES.theme, 'default-zinc');
            assert.equal(DEFAULT_PREFERENCES.density, 'comfortable');
            assert.equal(DEFAULT_PREFERENCES.animations, 'standard');
            assert.equal(DEFAULT_PREFERENCES.defaultSessionHours, '1.0');
            assert.equal(DEFAULT_PREFERENCES.timeFormat, '24h');
            assert.equal(DEFAULT_PREFERENCES.weekStart, 'monday');
            assert.equal(DEFAULT_PREFERENCES.sessionAutoRefresh, true);
        });

        it('debe leer valores predeterminados cuando el almacenamiento está vacío', () => {
            const mock = createMockStorage();
            const prefs = readPreferencesFromStorage(mock);
            assert.deepEqual(prefs, DEFAULT_PREFERENCES);
        });

        it('debe escribir y recuperar preferencias personalizadas en localStorage', () => {
            const mock = createMockStorage();
            const custom = {
                theme: 'cool-slate',
                density: 'compact',
                animations: 'reduced',
                defaultSessionHours: '2.0',
                timeFormat: '12h',
                weekStart: 'sunday',
                sessionAutoRefresh: false
            };

            writePreferencesToStorage(custom, mock);

            assert.ok(mock.getItem(PREFERENCES_STORAGE_KEY), 'Debe persistir en clave primaria');
            assert.ok(mock.getItem(LEGACY_STORAGE_KEY), 'Debe persistir en clave de respaldo');

            const loaded = readPreferencesFromStorage(mock);
            assert.deepEqual(loaded, custom);
        });

        it('arePreferencesEqual debe comparar correctamente dos estados', () => {
            const stateA = { ...DEFAULT_PREFERENCES };
            const stateB = { ...DEFAULT_PREFERENCES };
            assert.equal(arePreferencesEqual(stateA, stateB), true);

            const modified = { ...DEFAULT_PREFERENCES, theme: 'cool-slate' };
            assert.equal(arePreferencesEqual(stateA, modified), false);
        });

        it('getPreferencesDiff debe detectar con precisión los campos modificados', () => {
            const initial = { ...DEFAULT_PREFERENCES };
            const changed = {
                ...DEFAULT_PREFERENCES,
                theme: 'cool-slate',
                density: 'compact'
            };

            const diff = getPreferencesDiff(initial, changed);
            assert.deepEqual(Object.keys(diff).sort(), ['density', 'theme']);
            assert.equal(diff.theme.from, 'default-zinc');
            assert.equal(diff.theme.to, 'cool-slate');
            assert.equal(diff.density.from, 'comfortable');
            assert.equal(diff.density.to, 'compact');
        });

        it('applyPreferencesToDOM debe asignar los atributos data-* en documentElement', () => {
            const mockRoot = {
                attrs: {},
                setAttribute(k, v) { this.attrs[k] = v; }
            };
            const mockDoc = { documentElement: mockRoot };

            applyPreferencesToDOM({
                theme: 'cool-slate',
                density: 'compact',
                animations: 'reduced'
            }, mockDoc);

            assert.equal(mockRoot.attrs['data-theme'], 'cool-slate');
            assert.equal(mockRoot.attrs['data-density'], 'compact');
            assert.equal(mockRoot.attrs['data-animations'], 'reduced');
        });
    });

    describe('4. Integración Global de Navegación', () => {
        it('styles/navbar.css debe incluir estilos para .btn-config', () => {
            const navbarCss = fs.readFileSync(path.join(rootDir, 'styles/navbar.css'), 'utf8');
            assert.ok(navbarCss.includes('.btn-config'), 'styles/navbar.css debe estilizar .btn-config');
            assert.ok(navbarCss.includes('rotate(25deg)'), 'Debe incluir micro-interacción de rotación en hover');
        });

        it('dashboard.html debe contener el enlace hacia config.html', () => {
            const dashboardHtml = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
            assert.ok(dashboardHtml.includes('href="config.html"'), 'dashboard.html debe enlazar a config.html');
            assert.ok(dashboardHtml.includes('class="btn-config"'), 'dashboard.html debe incluir botón .btn-config');
        });

        it('hub.html debe contener el enlace hacia config.html', () => {
            const hubHtml = fs.readFileSync(path.join(rootDir, 'hub.html'), 'utf8');
            assert.ok(hubHtml.includes('href="config.html"'), 'hub.html debe enlazar a config.html');
            assert.ok(hubHtml.includes('class="btn-config"'), 'hub.html debe incluir botón .btn-config');
        });
    });
});
