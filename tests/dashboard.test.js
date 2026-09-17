import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Importar funciones del dashboard
import {
    timeToMinutes,
    getSlotSessionMatches,
    hasTimeOverlapConflict,
    createSessionAutoRefresher,
    getUIPreferences
} from '../js/dashboard.js';

describe('Dashboard Multi-Hour Booking & 1-Hour Auto-Refresh Suite (Milestone 2)', () => {

    describe('1. Conversión de Tiempo y Detección de Conflictos (hasTimeOverlapConflict)', () => {
        it('timeToMinutes debe convertir cadenas de hora HH:MM a minutos con exactitud', () => {
            assert.equal(timeToMinutes('00:00'), 0);
            assert.equal(timeToMinutes('08:00'), 480);
            assert.equal(timeToMinutes('10:30'), 630);
            assert.equal(timeToMinutes('18:00'), 1080);
            assert.equal(timeToMinutes(''), 0);
        });

        it('debe detectar conflicto cuando una sesión candidata se solapa con una sesión de 1 hora', () => {
            const existing = [{
                id: 's-1',
                date: '2026-09-20',
                time: '10:00',
                hours: 1
            }];

            const collision = {
                id: 'cand-1',
                date: '2026-09-20',
                time: '10:00',
                hours: 1
            };

            assert.equal(hasTimeOverlapConflict(collision, existing), true);
        });

        it('debe detectar conflicto cuando una sesión candidata cae en el segundo bloque de una sesión multi-hora', () => {
            const existing = [{
                id: 's-multi',
                date: '2026-09-20',
                time: '10:00',
                hours: 2 // Ocupa de 10:00 a 12:00
            }];

            // Intento de agendar a las 11:00 (en el segundo bloque de la sesión existente)
            const collisionAt11 = {
                id: 'cand-2',
                date: '2026-09-20',
                time: '11:00',
                hours: 1
            };

            assert.equal(hasTimeOverlapConflict(collisionAt11, existing), true, 'Debe detectar conflicto a las 11:00');
        });

        it('no debe marcar conflicto para sesiones contiguas sin solapamiento', () => {
            const existing = [{
                id: 's-1',
                date: '2026-09-20',
                time: '10:00',
                hours: 2 // Ocupa 10:00 - 12:00
            }];

            // Sesión inmediatamente después (12:00 a 13:00)
            const adjacentAfter = {
                id: 'cand-3',
                date: '2026-09-20',
                time: '12:00',
                hours: 1
            };

            // Sesión inmediatamente antes (09:00 a 10:00)
            const adjacentBefore = {
                id: 'cand-4',
                date: '2026-09-20',
                time: '09:00',
                hours: 1
            };

            assert.equal(hasTimeOverlapConflict(adjacentAfter, existing), false, '12:00 es adyacente, no solapado');
            assert.equal(hasTimeOverlapConflict(adjacentBefore, existing), false, '09:00 a 10:00 no se solapa');
        });

        it('debe permitir editar la misma sesión sin autocombatirse por ID', () => {
            const existing = [{
                id: 's-edit',
                date: '2026-09-20',
                time: '10:00',
                hours: 2
            }];

            const selfUpdate = {
                id: 's-edit',
                date: '2026-09-20',
                time: '10:00',
                hours: 2
            };

            assert.equal(hasTimeOverlapConflict(selfUpdate, existing), false);
        });
    });

    describe('2. Renderizado Visual Multi-Hora en Calendario (getSlotSessionMatches)', () => {
        const testSession1Hour = {
            id: 'ses-1h',
            date: '2026-09-20',
            time: '10:00',
            hours: 1,
            subject: 'Álgebra Lineal',
            studentName: 'Ana Gómez'
        };

        const testSession2Hours = {
            id: 'ses-2h',
            date: '2026-09-20',
            time: '10:00',
            hours: 2,
            subject: 'Cálculo Diferencial',
            studentName: 'Carlos López'
        };

        const testSession3Hours = {
            id: 'ses-3h',
            date: '2026-09-21',
            time: '14:00',
            hours: 3,
            subject: 'Física Universitaria',
            studentName: 'Diana Martínez'
        };

        it('para sesión de 1 hora: slot de inicio tiene role "start" y horas posteriores están libres', () => {
            const matches10 = getSlotSessionMatches([testSession1Hour], '2026-09-20', 10);
            assert.equal(matches10.length, 1);
            assert.equal(matches10[0].role, 'start');
            assert.equal(matches10[0].slotIndex, 1);
            assert.equal(matches10[0].totalSlots, 1);
            assert.equal(matches10[0].isLast, true);

            const matches11 = getSlotSessionMatches([testSession1Hour], '2026-09-20', 11);
            assert.equal(matches11.length, 0, 'La hora 11:00 debe estar disponible');

            const matches9 = getSlotSessionMatches([testSession1Hour], '2026-09-20', 9);
            assert.equal(matches9.length, 0, 'La hora 09:00 debe estar disponible');
        });

        it('para sesión de 2 horas (10:00 - 12:00): ocupa 10:00 (start) y 11:00 (continuation)', () => {
            const sessions = [testSession2Hours];

            // Slot de inicio (10:00)
            const matches10 = getSlotSessionMatches(sessions, '2026-09-20', 10);
            assert.equal(matches10.length, 1);
            assert.equal(matches10[0].role, 'start');
            assert.equal(matches10[0].slotIndex, 1);
            assert.equal(matches10[0].totalSlots, 2);
            assert.equal(matches10[0].isLast, false);

            // Slot de continuación (11:00)
            const matches11 = getSlotSessionMatches(sessions, '2026-09-20', 11);
            assert.equal(matches11.length, 1, '11:00 debe contener el bloque de continuación');
            assert.equal(matches11[0].role, 'continuation');
            assert.equal(matches11[0].slotIndex, 2);
            assert.equal(matches11[0].totalSlots, 2);
            assert.equal(matches11[0].isLast, true);
            assert.equal(matches11[0].session.id, 'ses-2h');

            // Slot posterior (12:00) debe estar libre
            const matches12 = getSlotSessionMatches(sessions, '2026-09-20', 12);
            assert.equal(matches12.length, 0, '12:00 debe quedar libre');
        });

        it('para sesión de 3 horas (14:00 - 17:00): ocupa 14:00 (start), 15:00 (cont 2/3), 16:00 (cont 3/3)', () => {
            const sessions = [testSession3Hours];

            const matches14 = getSlotSessionMatches(sessions, '2026-09-21', 14);
            assert.equal(matches14.length, 1);
            assert.equal(matches14[0].role, 'start');
            assert.equal(matches14[0].slotIndex, 1);
            assert.equal(matches14[0].totalSlots, 3);
            assert.equal(matches14[0].isLast, false);

            const matches15 = getSlotSessionMatches(sessions, '2026-09-21', 15);
            assert.equal(matches15.length, 1);
            assert.equal(matches15[0].role, 'continuation');
            assert.equal(matches15[0].slotIndex, 2);
            assert.equal(matches15[0].totalSlots, 3);
            assert.equal(matches15[0].isLast, false);

            const matches16 = getSlotSessionMatches(sessions, '2026-09-21', 16);
            assert.equal(matches16.length, 1);
            assert.equal(matches16[0].role, 'continuation');
            assert.equal(matches16[0].slotIndex, 3);
            assert.equal(matches16[0].totalSlots, 3);
            assert.equal(matches16[0].isLast, true);

            const matches17 = getSlotSessionMatches(sessions, '2026-09-21', 17);
            assert.equal(matches17.length, 0, '17:00 debe estar disponible');
        });

        it('sesión en fecha distinta no debe coincidir en el slot evaluado', () => {
            const matchesOtherDate = getSlotSessionMatches([testSession2Hours], '2026-09-22', 10);
            assert.equal(matchesOtherDate.length, 0);
        });

        it('soporta duraciones fraccionarias como 1.5 horas adecuadamente', () => {
            const session1p5 = {
                id: 'ses-1.5h',
                date: '2026-09-20',
                time: '10:00',
                hours: 1.5
            };

            const matches10 = getSlotSessionMatches([session1p5], '2026-09-20', 10);
            assert.equal(matches10.length, 1);
            assert.equal(matches10[0].role, 'start');

            const matches11 = getSlotSessionMatches([session1p5], '2026-09-20', 11);
            assert.equal(matches11.length, 1);
            assert.equal(matches11[0].role, 'continuation');
            assert.equal(matches11[0].isLast, true);
        });

        it('calcula slotIndex adecuadamente para inicios fraccionarios (ej. 10:30)', () => {
            const sessionHalfStart = {
                id: 'ses-half',
                date: '2026-09-20',
                time: '10:30',
                hours: 1.5
            };

            const matches10 = getSlotSessionMatches([sessionHalfStart], '2026-09-20', 10);
            assert.equal(matches10.length, 1);
            assert.equal(matches10[0].role, 'start');
            assert.equal(matches10[0].slotIndex, 1);

            const matches11 = getSlotSessionMatches([sessionHalfStart], '2026-09-20', 11);
            assert.equal(matches11.length, 1);
            assert.equal(matches11[0].role, 'continuation');
            assert.equal(matches11[0].slotIndex, 2);
        });
    });

    describe('3. Controlador de Auto-Refresco de Sesión de 1 Hora (createSessionAutoRefresher)', () => {
        const ONE_HOUR = 3600000;

        it('inicia y detiene el temporizador sin pérdidas de memoria', () => {
            let nowTime = 1000000;
            const refresher = createSessionAutoRefresher({
                intervalMs: ONE_HOUR,
                now: () => nowTime
            });

            refresher.start();
            assert.equal(refresher.isRunning(), true);
            assert.equal(refresher.getLastRefreshTime(), 1000000);

            refresher.stop();
            assert.equal(refresher.isRunning(), false);
        });

        it('ejecuta refresco en visibilitychange si ha transcurrido 1 hora o más', async () => {
            let currentTime = 0;
            let refreshCalls = 0;
            let authRevalidations = 0;

            const refresher = createSessionAutoRefresher({
                intervalMs: ONE_HOUR,
                now: () => currentTime,
                revalidateAuth: async () => { authRevalidations++; return true; },
                refreshData: async () => { refreshCalls++; }
            });

            refresher.start();

            // Pasan 30 minutos (menos de 1 hora): no debe refrescar al cambiar visibilidad
            currentTime = 1800000;
            refresher.handleVisibilityChange('visible');
            await new Promise(r => setTimeout(r, 10));
            assert.equal(refreshCalls, 0, 'No debe refrescar antes de 1 hora');

            // Pasa 1 hora y 10 segundos: debe refrescar inmediatamente
            currentTime = 3610000;
            refresher.handleVisibilityChange('visible');
            await new Promise(r => setTimeout(r, 10));

            assert.equal(authRevalidations, 1, 'Debe revalidar la sesión');
            assert.equal(refreshCalls, 1, 'Debe refrescar los datos del dashboard');
            assert.equal(refresher.getLastRefreshTime(), 3610000, 'Debe actualizar lastRefreshTime');

            refresher.stop();
        });

        it('pospone el auto-refresco si el diálogo modal está abierto y lo ejecuta al cerrarlo', async () => {
            let currentTime = 0;
            let isModalOpen = true;
            let refreshCalls = 0;

            const refresher = createSessionAutoRefresher({
                intervalMs: ONE_HOUR,
                now: () => currentTime,
                isModalOpen: () => isModalOpen,
                revalidateAuth: async () => true,
                refreshData: async () => { refreshCalls++; }
            });

            refresher.start();

            // Ha pasado 1 hora, pero el modal está abierto
            currentTime = 3600000;
            refresher.handleVisibilityChange('visible');
            await new Promise(r => setTimeout(r, 10));

            assert.equal(refreshCalls, 0, 'No debe ejecutar refresco con modal abierto');
            assert.equal(refresher.isPending(), true, 'Debe marcar refresco pendiente');

            // El usuario cierra el modal
            isModalOpen = false;
            refresher.handleModalClosed();
            await new Promise(r => setTimeout(r, 10));

            assert.equal(refreshCalls, 1, 'Debe ejecutar el refresco diferido al cerrar el modal');
            assert.equal(refresher.isPending(), false);

            refresher.stop();
        });

        it('pospone el auto-refresco si una petición de guardado está en curso', async () => {
            let currentTime = 3600000;
            let isSubmitting = true;
            let refreshCalls = 0;

            const refresher = createSessionAutoRefresher({
                intervalMs: ONE_HOUR,
                now: () => currentTime,
                isSubmitting: () => isSubmitting,
                revalidateAuth: async () => true,
                refreshData: async () => { refreshCalls++; }
            });

            const success = await refresher.triggerRefresh('timer');
            assert.equal(success, false, 'No debe interrumpir guardado en curso');
            assert.equal(refresher.isPending(), true);
        });

        it('invoca callback onSessionExpired si la revalidación de credenciales falla', async () => {
            let expiredCalled = false;

            const refresher = createSessionAutoRefresher({
                intervalMs: ONE_HOUR,
                revalidateAuth: async () => false, // Sesión expirada o revocada
                onSessionExpired: () => { expiredCalled = true; }
            });

            const result = await refresher.triggerRefresh('interval');
            assert.equal(result, false);
            assert.equal(expiredCalled, true, 'Debe llamar a onSessionExpired');
        });
    });

    describe('4. Estilos y Fusión en styles/dashboard.css', () => {
        const dashboardCssPath = path.join(rootDir, 'styles/dashboard.css');

        it('styles/dashboard.css debe incluir clases de continuidad de slots', () => {
            const css = fs.readFileSync(dashboardCssPath, 'utf8');
            assert.ok(css.includes('.grid-cell.slot.slot--occupied'), 'Debe existir .slot--occupied');
            assert.ok(css.includes('.grid-cell.slot.slot--span-start'), 'Debe existir .slot--span-start');
            assert.ok(css.includes('.grid-cell.slot.slot--span-cont'), 'Debe existir .slot--span-cont');
        });

        it('debe incluir estilos para bloques de continuación .session-item--continuation y .is-continuation', () => {
            const css = fs.readFileSync(dashboardCssPath, 'utf8');
            assert.ok(css.includes('.session-item.session-item--continuation'), 'Debe existir .session-item--continuation');
            assert.ok(css.includes('.session-item.is-continuation'), 'Debe existir .is-continuation');
            assert.ok(css.includes('.session-continuation-arrow'), 'Debe contener flecha de continuidad ↳');
        });

        it('no debe contener el hack de altura con desbordamiento no contenido calc(var(--session-duration, 1) * ... - 8px)', () => {
            const css = fs.readFileSync(dashboardCssPath, 'utf8');
            assert.ok(!css.includes('calc(var(--session-duration, 1) * var(--calendar-row-height, 54px) - 8px)'), 'El hack de desbordamiento debe haber sido eliminado');
        });
    });

    describe('5. Consumo de Preferencias de Usuario (getUIPreferences)', () => {
        function createMockStorage(initialData = {}) {
            const store = new Map(Object.entries(initialData));
            return {
                getItem: (k) => (store.has(k) ? store.get(k) : null),
                setItem: (k, v) => store.set(k, String(v)),
                removeItem: (k) => store.delete(k),
                clear: () => store.clear()
            };
        }

        it('debe retornar valores por defecto cuando no hay almacenamiento o claves configuradas', () => {
            const prefs = getUIPreferences(null);
            assert.equal(prefs.defaultSessionHours, '1.0');
            assert.equal(prefs.sessionAutoRefresh, true);

            const emptyStorage = createMockStorage();
            const prefsEmpty = getUIPreferences(emptyStorage);
            assert.equal(prefsEmpty.defaultSessionHours, '1.0');
            assert.equal(prefsEmpty.sessionAutoRefresh, true);
        });

        it('debe leer defaultSessionHours y sessionAutoRefresh desde dualorganizer_ui_config', () => {
            const storage = createMockStorage({
                dualorganizer_ui_config: JSON.stringify({
                    defaultSessionHours: '2.0',
                    sessionAutoRefresh: false
                })
            });
            const prefs = getUIPreferences(storage);
            assert.equal(prefs.defaultSessionHours, '2.0');
            assert.equal(prefs.sessionAutoRefresh, false);
        });

        it('debe soportar clave heredada dualorganizer_preferences', () => {
            const storage = createMockStorage({
                dualorganizer_preferences: JSON.stringify({
                    defaultSessionHours: '3.0',
                    sessionAutoRefresh: true
                })
            });
            const prefs = getUIPreferences(storage);
            assert.equal(prefs.defaultSessionHours, '3.0');
            assert.equal(prefs.sessionAutoRefresh, true);
        });

        it('debe normalizar valores no válidos de defaultSessionHours a 1.0', () => {
            const storage = createMockStorage({
                dualorganizer_ui_config: JSON.stringify({
                    defaultSessionHours: '99.9',
                    sessionAutoRefresh: 'not-a-bool'
                })
            });
            const prefs = getUIPreferences(storage);
            assert.equal(prefs.defaultSessionHours, '1.0');
            assert.equal(prefs.sessionAutoRefresh, true);
        });
    });
});
