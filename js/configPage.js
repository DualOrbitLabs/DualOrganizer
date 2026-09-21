// ==========================================================================
// DualOrganizer - Controlador de Configuración y Preferencias de UI
// Vanilla JS ES6+ Puro: Dirty-State Management, Live Preview, Multi-Storage Sync
// ==========================================================================

import { getAuthenticatedUser, signOut, supabase } from './supabaseClient.js';

export const DEFAULT_PREFERENCES = Object.freeze({
    theme: 'default-zinc',
    density: 'comfortable',
    animations: 'standard',
    defaultSessionHours: '1.0',
    timeFormat: '24h',
    weekStart: 'monday',
    sessionAutoRefresh: true
});

export const PREFERENCES_STORAGE_KEY = 'dualorganizer_ui_config';
export const LEGACY_STORAGE_KEY = 'dualorganizer_preferences';

/**
 * Lee y normaliza las preferencias desde el almacenamiento local o suministrado.
 * @param {Storage} storage - Instancia de almacenamiento (localStorage por defecto).
 * @returns {object} Objeto validado con todas las claves de DEFAULT_PREFERENCES.
 */
export function readPreferencesFromStorage(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!storage) return { ...DEFAULT_PREFERENCES };

    try {
        const raw = storage.getItem(PREFERENCES_STORAGE_KEY) || storage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_PREFERENCES };

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PREFERENCES };

        return {
            theme: parsed.theme === 'cool-slate' ? 'cool-slate' : DEFAULT_PREFERENCES.theme,
            density: parsed.density === 'compact' ? 'compact' : DEFAULT_PREFERENCES.density,
            animations: parsed.animations === 'reduced' ? 'reduced' : DEFAULT_PREFERENCES.animations,
            defaultSessionHours: ['1.0', '1.5', '2.0', '3.0'].includes(String(parsed.defaultSessionHours))
                ? String(parsed.defaultSessionHours)
                : DEFAULT_PREFERENCES.defaultSessionHours,
            timeFormat: parsed.timeFormat === '12h' ? '12h' : DEFAULT_PREFERENCES.timeFormat,
            weekStart: parsed.weekStart === 'sunday' ? 'sunday' : DEFAULT_PREFERENCES.weekStart,
            sessionAutoRefresh: typeof parsed.sessionAutoRefresh === 'boolean'
                ? parsed.sessionAutoRefresh
                : (typeof parsed.sessionRefreshAlert === 'boolean' ? parsed.sessionRefreshAlert : DEFAULT_PREFERENCES.sessionAutoRefresh)
        };
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
}

/**
 * Serializa y persiste las preferencias en el almacenamiento local.
 * @param {object} prefs - Objeto de preferencias a guardar.
 * @param {Storage} storage - Instancia de almacenamiento.
 */
export function writePreferencesToStorage(prefs, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!storage || !prefs) return;
    const jsonStr = JSON.stringify(prefs);
    storage.setItem(PREFERENCES_STORAGE_KEY, jsonStr);
    storage.setItem(LEGACY_STORAGE_KEY, jsonStr);
}

/**
 * Compara dos objetos de preferencias campo por campo.
 * @param {object} a
 * @param {object} b
 * @returns {boolean} true si son idénticos.
 */
export function arePreferencesEqual(a, b) {
    if (!a || !b) return false;
    const keys = Object.keys(DEFAULT_PREFERENCES);
    return keys.every(key => a[key] === b[key]);
}

/**
 * Devuelve un diccionario con las claves que han cambiado entre dos snapshots.
 * @param {object} initial
 * @param {object} current
 * @returns {object} Diferencias encontradas.
 */
export function getPreferencesDiff(initial, current) {
    const diff = {};
    if (!initial || !current) return diff;
    const keys = Object.keys(DEFAULT_PREFERENCES);
    for (const key of keys) {
        if (initial[key] !== current[key]) {
            diff[key] = { from: initial[key], to: current[key] };
        }
    }
    return diff;
}

/**
 * Aplica los atributos data-* al elemento raíz del documento.
 * @param {object} prefs - Objeto de preferencias.
 * @param {Document} doc - Objeto document.
 */
export function applyPreferencesToDOM(prefs, doc = (typeof document !== 'undefined' ? document : null)) {
    if (!doc || !prefs) return;
    const root = doc.documentElement;
    if (prefs.theme) root.setAttribute('data-theme', prefs.theme);
    if (prefs.density) root.setAttribute('data-density', prefs.density);
    if (prefs.animations) root.setAttribute('data-animations', prefs.animations);
}

// --------------------------------------------------------------------------
// Ciclo de Vida de la Página (Solo en entorno del navegador con DOM)
// --------------------------------------------------------------------------
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        'use strict';

        let currentUser = null;
        try {
            currentUser = await getAuthenticatedUser();
        } catch {
            currentUser = null;
        }

        // Elementos del DOM
        const form = document.getElementById('configForm');
        const unsavedBar = document.getElementById('unsavedChangesBar');
        const btnSave = document.getElementById('btnSaveConfig');
        const btnDiscard = document.getElementById('btnDiscardConfig');
        const btnResetDefaults = document.getElementById('btnResetDefaults');
        const toast = document.getElementById('configToast');
        const toastMessage = document.getElementById('configToastMessage');

        // Diagnóstico
        const diagTheme = document.getElementById('diagTheme');
        const diagDensity = document.getElementById('diagDensity');
        const diagAnim = document.getElementById('diagAnim');
        const diagRefresh = document.getElementById('diagRefresh');

        let initialSnapshot = readPreferencesFromStorage();

        // Si el usuario tiene preferencias en la nube (Supabase Auth metadata), reconciliar
        if (currentUser?.user_metadata?.preferences) {
            const cloudPrefs = currentUser.user_metadata.preferences;
            initialSnapshot = {
                ...initialSnapshot,
                ...cloudPrefs
            };
            writePreferencesToStorage(initialSnapshot);
        }

        let isDirty = false;
        let toastTimeout = null;

        /**
         * Muestra una notificación accesible tipo toast.
         * @param {string} msg
         */
        function showToast(msg) {
            if (!toast) return;
            if (toastMessage) toastMessage.textContent = msg;
            toast.classList.add('visible');
            if (toastTimeout) clearTimeout(toastTimeout);
            toastTimeout = setTimeout(() => {
                toast.classList.remove('visible');
            }, 3000);
        }

        /**
         * Lee el estado actual de los controles del formulario.
         * @returns {object}
         */
        function getFormSnapshot() {
            if (!form) return { ...initialSnapshot };

            const themeEl = form.querySelector('input[name="theme"]:checked');
            const densityEl = form.querySelector('input[name="density"]:checked');
            const animEl = form.querySelector('input[name="animations"]:checked');
            const hoursEl = document.getElementById('defaultSessionHours');
            const timeFormatEl = document.getElementById('timeFormat');
            const weekStartEl = document.getElementById('weekStart');
            const refreshEl = document.getElementById('sessionAutoRefresh');

            return {
                theme: themeEl ? themeEl.value : initialSnapshot.theme,
                density: densityEl ? densityEl.value : initialSnapshot.density,
                animations: animEl ? animEl.value : initialSnapshot.animations,
                defaultSessionHours: hoursEl ? hoursEl.value : initialSnapshot.defaultSessionHours,
                timeFormat: timeFormatEl ? timeFormatEl.value : initialSnapshot.timeFormat,
                weekStart: weekStartEl ? weekStartEl.value : initialSnapshot.weekStart,
                sessionAutoRefresh: refreshEl ? Boolean(refreshEl.checked) : initialSnapshot.sessionAutoRefresh
            };
        }

        /**
         * Actualiza el panel de diagnóstico de tokens.
         * @param {object} prefs
         */
        function updateDiagnostics(prefs) {
            if (diagTheme) diagTheme.textContent = prefs.theme;
            if (diagDensity) diagDensity.textContent = prefs.density;
            if (diagAnim) diagAnim.textContent = prefs.animations;
            if (diagRefresh) {
                diagRefresh.textContent = prefs.sessionAutoRefresh ? 'Activo (3600s)' : 'Desactivado';
            }
        }

        /**
         * Rellena los controles del formulario según un snapshot dado.
         * @param {object} prefs
         */
        function populateForm(prefs) {
            if (!form) return;

            const themeRadio = form.querySelector(`input[name="theme"][value="${prefs.theme}"]`);
            if (themeRadio) themeRadio.checked = true;

            const densityRadio = form.querySelector(`input[name="density"][value="${prefs.density}"]`);
            if (densityRadio) densityRadio.checked = true;

            const animRadio = form.querySelector(`input[name="animations"][value="${prefs.animations}"]`);
            if (animRadio) animRadio.checked = true;

            const hoursSelect = document.getElementById('defaultSessionHours');
            if (hoursSelect) hoursSelect.value = prefs.defaultSessionHours;

            const timeSelect = document.getElementById('timeFormat');
            if (timeSelect) timeSelect.value = prefs.timeFormat;

            const weekSelect = document.getElementById('weekStart');
            if (weekSelect) weekSelect.value = prefs.weekStart;

            const refreshToggle = document.getElementById('sessionAutoRefresh');
            if (refreshToggle) refreshToggle.checked = Boolean(prefs.sessionAutoRefresh);
        }

        /**
         * Manejador de advertencia antes de abandonar con cambios sin guardar.
         */
        function handleBeforeUnload(e) {
            if (!isDirty) return;
            e.preventDefault();
            e.returnValue = 'Tiene cambios de configuración sin guardar. ¿Desea salir?';
            return e.returnValue;
        }

        /**
         * Evalúa el estado sucio (dirty-state) comparando el formulario contra initialSnapshot.
         */
        function evaluateDirtyState() {
            const current = getFormSnapshot();
            const equal = arePreferencesEqual(initialSnapshot, current);

            isDirty = !equal;

            // Live preview permanente de los tokens seleccionados
            applyPreferencesToDOM(current);
            updateDiagnostics(current);

            if (isDirty) {
                unsavedBar?.classList.add('visible');
                if (unsavedBar) unsavedBar.setAttribute('aria-hidden', 'false');
                if (btnSave) btnSave.disabled = false;
                if (btnDiscard) btnDiscard.disabled = false;
                window.addEventListener('beforeunload', handleBeforeUnload);
            } else {
                unsavedBar?.classList.remove('visible');
                if (unsavedBar) unsavedBar.setAttribute('aria-hidden', 'true');
                if (btnSave) btnSave.disabled = true;
                if (btnDiscard) btnDiscard.disabled = true;
                window.removeEventListener('beforeunload', handleBeforeUnload);
            }
        }

        /**
         * Restaura los valores al snapshot inicial y oculta el dock.
         */
        function discardChanges() {
            populateForm(initialSnapshot);
            applyPreferencesToDOM(initialSnapshot);
            updateDiagnostics(initialSnapshot);
            isDirty = false;

            unsavedBar?.classList.remove('visible');
            if (unsavedBar) unsavedBar.setAttribute('aria-hidden', 'true');
            if (btnSave) btnSave.disabled = true;
            if (btnDiscard) btnDiscard.disabled = true;
            window.removeEventListener('beforeunload', handleBeforeUnload);

            showToast('Modificaciones descartadas.');
        }

        /**
         * Guarda los cambios en LocalStorage y sincroniza con Supabase si hay sesión activa.
         */
        async function saveChanges(e) {
            if (e) e.preventDefault();
            const currentSnapshot = getFormSnapshot();

            // 1. Guardar localmente
            writePreferencesToStorage(currentSnapshot);

            // 2. Sincronizar en la nube si hay usuario activo
            if (supabase && currentUser) {
                try {
                    await supabase.auth.updateUser({
                        data: { preferences: currentSnapshot }
                    });
                } catch (err) {
                    console.warn('[Config] Error al sincronizar preferencias en Supabase:', err);
                }
            }

            // 3. Fijar nuevo snapshot base
            initialSnapshot = { ...currentSnapshot };
            isDirty = false;

            unsavedBar?.classList.remove('visible');
            if (unsavedBar) unsavedBar.setAttribute('aria-hidden', 'true');
            if (btnSave) btnSave.disabled = true;
            if (btnDiscard) btnDiscard.disabled = true;
            window.removeEventListener('beforeunload', handleBeforeUnload);

            showToast('Preferencias guardadas exitosamente.');
        }

        // Inicializar UI con las preferencias actuales
        populateForm(initialSnapshot);
        applyPreferencesToDOM(initialSnapshot);
        updateDiagnostics(initialSnapshot);

        // Delegación de eventos en el formulario (input y change)
        form?.addEventListener('input', evaluateDirtyState);
        form?.addEventListener('change', evaluateDirtyState);

        btnDiscard?.addEventListener('click', discardChanges);
        form?.addEventListener('submit', saveChanges);

        btnResetDefaults?.addEventListener('click', () => {
            populateForm(DEFAULT_PREFERENCES);
            evaluateDirtyState();
        });

        // Logout
        document.querySelectorAll('[data-action="logout"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                signOut();
            });
        });

        // Escucha multi-pestaña para actualizar tokens si otra pestaña guarda cambios
        window.addEventListener('storage', (e) => {
            if (e.key === PREFERENCES_STORAGE_KEY && !isDirty) {
                initialSnapshot = readPreferencesFromStorage();
                populateForm(initialSnapshot);
                applyPreferencesToDOM(initialSnapshot);
                updateDiagnostics(initialSnapshot);
            }
        });
    });
}
