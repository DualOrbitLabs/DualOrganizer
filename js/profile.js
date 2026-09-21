import { getAuthenticatedUser, getCurrentProfile, signOut, supabase } from './supabaseClient.js';
import { APP_CONFIG, isDateInCurrentMonth } from './config.js';
import { exportEvidenceReport } from './evidenceUtils.js';

// ==========================================================================
// Lógica para el Perfil del Tutor - DualOrganizer
// Stack: Vanilla JavaScript ES6+ Puro (Sin librerías ni frameworks)
// Características: Tag-Input Dinámico, Dirty-State Management, Delegación de Eventos
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
    'use strict';

    // Validación de sesión
    const currentUser = await getAuthenticatedUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // --------------------------------------------------------------------------
    // Sistema Compartido de Notificaciones Toast Accesible
    // --------------------------------------------------------------------------
    const toast = document.getElementById('toastNotification') || document.getElementById('profileToast');
    const toastMsg = document.getElementById('toastMessage');
    let toastTimeout = null;

    const showToast = (message) => {
        if (!toast) return;
        if (toastMsg) toastMsg.textContent = message;

        toast.classList.add('visible');
        toast.setAttribute('aria-hidden', 'false');

        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('visible');
            toast.setAttribute('aria-hidden', 'true');
        }, 3000);
    };

    const hydrateRemoteProfile = async () => {
        try {
            const [{ data: sessionRows, error: sessionError }, userProfile] = await Promise.all([
                supabase
                    .from('tutoring_sessions')
                    .select('hours, status, session_date')
                    .eq('tutor_id', currentUser.id),
                getCurrentProfile(currentUser.id)

            ]);
            if (sessionError) throw sessionError;
            if (!userProfile) return;

            const currentMonthSessions = (sessionRows || []).filter(session => isDateInCurrentMonth(session.session_date));
            const totalHours = currentMonthSessions.reduce((total, session) => total + Number(session.hours || 0), 0);
            const totalSessions = currentMonthSessions.length;
            const hoursValue = document.getElementById('profileHoursValue');
            const sessionsValue = document.getElementById('profileSessionsValue');
            const hoursProgress = document.getElementById('profileHoursProgress');
            const hoursBar = document.getElementById('profileHoursBar');
            const percentage = Math.min(100, Math.round((totalHours / APP_CONFIG.academic.monthlyTargetHours) * 100));
            if (hoursValue) hoursValue.textContent = `${totalHours.toFixed(1).replace(/\.0$/, '')} / ${APP_CONFIG.academic.monthlyTargetHours} hrs`;
            if (sessionsValue) sessionsValue.textContent = String(totalSessions);
            if (hoursProgress) {
                hoursProgress.setAttribute('aria-valuenow', String(totalHours));
                hoursProgress.setAttribute('aria-valuemax', String(APP_CONFIG.academic.monthlyTargetHours));
            }
            if (hoursBar) hoursBar.style.width = `${percentage}%`;

            const profileDisplayName = document.getElementById('profileDisplayName');
            const inputFullName = document.getElementById('inputFullName');
            const inputPhone = document.getElementById('inputPhone');
            const selectSemester = document.getElementById('selectSemester');
            const textareaDesc = document.getElementById('textareaDescription');
            const inputTime = document.getElementById('inputTimeSlots');
            const inputUrl = document.getElementById('inputMeetingUrl');
            const hiddenMat = document.getElementById('materiasHidden') || document.getElementById('hiddenMaterias');
            const inputStudentId = document.getElementById('inputStudentId');
            const initials = document.getElementById("avatarInitials");

            if (initials) {
                let name;
                if (!userProfile.full_name) {
                    name = "JUAN PÉREZ";
                } else {
                    name = (userProfile.full_name).toUpperCase();
                }

                if (name && name != "DUAL ORBIT LABS") {
                    if (name.includes(' ')) {
                        initials.textContent = name[0] + name[name.indexOf(' ') + 1];
                    } else {
                        initials.textContent = name[0] + name[1];
                    }
                } else if (name === "DUAL ORBIT LABS") {
                    initials.textContent = "DOL"
                }
            }

            if (profileDisplayName) profileDisplayName.textContent = userProfile.full_name || currentUser.email;
            if (inputFullName) inputFullName.value = userProfile.full_name || '';
            if (inputPhone) inputPhone.value = userProfile.phone || '';
            if (selectSemester && userProfile.semester) selectSemester.value = userProfile.semester;
            if (textareaDesc) textareaDesc.value = userProfile.description || '';
            if (inputTime) inputTime.value = userProfile.time_slots || '';
            if (inputUrl) inputUrl.value = userProfile.meeting_url || '';
            if (hiddenMat) hiddenMat.value = (userProfile.subjects || []).join(', ');
            if (inputStudentId) inputStudentId.value = userProfile.institutional_id || '';
            if (userProfile.role === 'ADMIN') {
                const badgeRole = document.querySelector('.badge-role');
                if (badgeRole) badgeRole.textContent = 'Coordinación Académica';
            }
        } catch (error) {
            console.error('Error al cargar el perfil desde Supabase:', error);
            showToast('No se pudo cargar el perfil remoto.');
        }
    };

    await hydrateRemoteProfile();

    // ==========================================================================
    // 1. Tag-Input Dinámico para Materias
    // ==========================================================================
    const TagInputComponent = (() => {
        const container = document.getElementById('tagInputContainer') || document.getElementById('chipsComponent');
        const listEl = document.getElementById('tagList') || document.getElementById('chipsList');
        const inputField = document.getElementById('tagInput') || document.getElementById('chipInput');
        const hiddenInput = document.getElementById('materiasHidden') || document.getElementById('hiddenMaterias');
        const statCounter = document.getElementById('statMateriasCount') || document.getElementById('statSubjectCount');

        if (!container || !listEl || !inputField || !hiddenInput) {
            return {
                getTags: () => [],
                setTags: () => { },
                resetTo: () => { }
            };
        }

        let tags = [];

        const parseString = (str) => {
            if (!str) return [];
            return str
                .split(',')
                .map(item => item.trim())
                .filter(item => item.length > 0);
        };

        const syncState = (triggerEvent = true) => {
            const serialized = tags.join(', ');
            hiddenInput.value = serialized;

            if (statCounter) {
                statCounter.textContent = tags.length;
            }

            if (triggerEvent) {
                hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };

        // Renderizar chips con icono vectorial SVG en botón de eliminar
        const render = () => {
            listEl.innerHTML = '';
            tags.forEach((tag, index) => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip chip-item';
                chip.setAttribute('role', 'listitem');
                chip.setAttribute('data-index', index);

                const textSpan = document.createElement('span');
                textSpan.textContent = tag;

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'tag-remove chip-remove';
                removeBtn.setAttribute('aria-label', `Eliminar materia ${tag}`);
                removeBtn.setAttribute('data-index', index);

                removeBtn.innerHTML = `
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                `;

                chip.appendChild(textSpan);
                chip.appendChild(removeBtn);
                listEl.appendChild(chip);
            });
        };

        const MAX_TAGS = 12;
        const MAX_TAG_LENGTH = 40;

        const addTag = (text) => {
            const cleaned = text.trim().replace(/,+$/, '').replace(/[^A-Za-zÀ-ÿ0-9\s\.\-]/g, '').trim();
            if (!cleaned) return false;

            if (tags.length >= MAX_TAGS) {
                showToast('Se ha alcanzado el límite máximo de 12 materias.');
                inputField.value = '';
                return false;
            }

            const truncated = cleaned.slice(0, MAX_TAG_LENGTH);
            const exists = tags.some(t => t.toLowerCase() === truncated.toLowerCase());
            if (exists) {
                inputField.value = '';
                return false;
            }

            tags.push(truncated);
            render();
            syncState(true);
            inputField.value = '';
            return true;
        };

        const removeTag = (index) => {
            if (index >= 0 && index < tags.length) {
                tags.splice(index, 1);
                render();
                syncState(true);
            }
        };

        tags = parseString(hiddenInput.value);
        render();
        syncState(false);

        container.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.tag-remove, .chip-remove');
            if (removeBtn) {
                e.stopPropagation();
                const idx = parseInt(removeBtn.getAttribute('data-index'), 10);
                removeTag(idx);
                inputField.focus();
                return;
            }

            if (e.target !== inputField) {
                inputField.focus();
            }
        });

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(inputField.value);
            } else if (e.key === 'Backspace' && inputField.value === '') {
                if (tags.length > 0) {
                    removeTag(tags.length - 1);
                }
            }
        });

        inputField.addEventListener('paste', (e) => {
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            if (pastedText && pastedText.includes(',')) {
                e.preventDefault();
                const items = parseString(pastedText);
                items.forEach(item => addTag(item));
            }
        });

        inputField.addEventListener('focus', () => container.classList.add('focused'));
        inputField.addEventListener('blur', () => {
            container.classList.remove('focused');
            if (inputField.value.trim().length > 0) {
                addTag(inputField.value);
            }
        });

        return {
            getTags: () => [...tags],
            setTags: (newTags) => {
                tags = [...newTags];
                render();
                syncState(false);
            },
            resetTo: (rawString) => {
                tags = parseString(rawString);
                render();
                syncState(false);
            }
        };
    })();

    // ==========================================================================
    // 2. Detección de Cambios sin Guardar (Dirty-State Management)
    // ==========================================================================
    const DirtyStateManager = (() => {
        const form = document.getElementById('profileForm');
        const unsavedBar = document.getElementById('unsavedChangesBar') || document.querySelector('.unsaved-changes-bar, .profile-actions-bar');
        const btnDiscard = document.getElementById('btnDiscardChanges') || document.getElementById('btnResetProfile');
        const btnSave = document.getElementById('btnSaveChanges') || document.getElementById('btnSaveProfile');

        if (!form || !unsavedBar) return;

        let initialSnapshot = {};
        let isDirty = false;

        const getSnapshot = () => {
            const snapshot = {};
            const elements = form.elements;

            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (!el.name || el.disabled || el.readOnly) continue;

                if (el.type === 'checkbox') {
                    snapshot[el.name] = el.checked;
                } else if (el.type === 'radio') {
                    if (el.checked) {
                        snapshot[el.name] = el.value;
                    }
                } else if (el.tagName === 'SELECT' && el.multiple) {
                    const selected = Array.from(el.options)
                        .filter(opt => opt.selected)
                        .map(opt => opt.value);
                    snapshot[el.name] = selected;
                } else {
                    snapshot[el.name] = el.value;
                }
            }

            return snapshot;
        };

        const areSnapshotsEqual = (a, b) => {
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);

            if (keysA.length !== keysB.length) return false;

            for (const key of keysA) {
                const valA = a[key];
                const valB = b[key];

                if (Array.isArray(valA) && Array.isArray(valB)) {
                    if (valA.length !== valB.length) return false;
                    const sortedA = [...valA].sort();
                    const sortedB = [...valB].sort();
                    for (let i = 0; i < sortedA.length; i++) {
                        if (sortedA[i] !== sortedB[i]) return false;
                    }
                } else if (valA !== valB) {
                    return false;
                }
            }

            return true;
        };

        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        const updateUI = () => {
            if (isDirty) {
                unsavedBar.classList.add('visible');
                unsavedBar.setAttribute('aria-hidden', 'false');
                if (btnDiscard) btnDiscard.removeAttribute('disabled');
                if (btnSave) btnSave.removeAttribute('disabled');
                window.addEventListener('beforeunload', handleBeforeUnload);
            } else {
                unsavedBar.classList.remove('visible');
                unsavedBar.setAttribute('aria-hidden', 'true');
                if (btnDiscard) btnDiscard.setAttribute('disabled', 'true');
                if (btnSave) btnSave.setAttribute('disabled', 'true');
                window.removeEventListener('beforeunload', handleBeforeUnload);
            }
        };

        const evaluateDirtyState = () => {
            const currentSnapshot = getSnapshot();
            const equal = areSnapshotsEqual(initialSnapshot, currentSnapshot);
            const nextDirty = !equal;

            if (nextDirty !== isDirty) {
                isDirty = nextDirty;
                updateUI();
            }
        };

        const discardChanges = () => {
            const elements = form.elements;

            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (!el.name || el.disabled || el.readOnly) continue;
                if (!(el.name in initialSnapshot)) continue;

                const initialVal = initialSnapshot[el.name];

                if (el.type === 'checkbox') {
                    el.checked = Boolean(initialVal);
                } else if (el.type === 'radio') {
                    el.checked = (el.value === initialVal);
                } else if (el.tagName === 'SELECT' && el.multiple) {
                    Array.from(el.options).forEach(opt => {
                        opt.selected = Array.isArray(initialVal) && initialVal.includes(opt.value);
                    });
                } else {
                    el.value = initialVal;
                }
            }

            if (initialSnapshot.materias !== undefined) {
                TagInputComponent.resetTo(initialSnapshot.materias);
            }

            isDirty = false;
            updateUI();
            showToast('Cambios descartados');
        };

        const ALLOWED_URL_SCHEMES = ['https:'];
        const ALLOWED_MEETING_HOSTNAMES = [
            'meet.google.com',
            'zoom.us',
            'teams.microsoft.com',
            'webex.com'
        ];

        const isSafeMeetingURL = (urlString) => {
            if (!urlString || urlString.trim() === '') return true;
            try {
                const parsed = new URL(urlString.trim());
                if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) return false;
                if (parsed.username || parsed.password) return false;
                return ALLOWED_MEETING_HOSTNAMES.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
            } catch {
                return false;
            }
        };

        const saveChanges = async (e) => {
            if (e) e.preventDefault();

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const currentSnapshot = getSnapshot();

            // Validación de URL de videoconferencia segura
            if (currentSnapshot.meetingUrl && !isSafeMeetingURL(currentSnapshot.meetingUrl)) {
                showToast('El enlace debe ser una URL segura HTTPS de Google Meet, Zoom, Teams o Webex.');
                const meetingInput = document.getElementById('inputMeetingUrl');
                if (meetingInput) meetingInput.focus();
                return;
            }

            try {
                const { error } = await supabase.from('profiles').update({
                    full_name: currentSnapshot.fullName?.trim() || '',
                    phone: currentSnapshot.phone || null,
                    semester: currentSnapshot.semester || null,
                    description: currentSnapshot.description || null,
                    subjects: currentSnapshot.materias
                        ? currentSnapshot.materias.split(',').map(item => item.trim()).filter(Boolean)
                        : [],
                    available_days: currentSnapshot.availableDays || [],
                    time_slots: currentSnapshot.timeSlots || null,
                    meeting_url: currentSnapshot.meetingUrl || null
                }).eq('id', currentUser.id);
                if (error) throw error;
            } catch (err) {
                console.error('Error al persistir perfil en Supabase:', err);
                showToast('No se pudo guardar el perfil.');
                return;
            }

            // 3. Actualizar elementos visuales dependientes de inmediato
            const profileDisplayName = document.getElementById('profileDisplayName');
            if (profileDisplayName && currentSnapshot.fullName) {
                profileDisplayName.textContent = currentSnapshot.fullName;

                const nameParts = currentSnapshot.fullName.trim().split(/\s+/);
                const initials = nameParts.length === 1
                    ? nameParts[0].substring(0, 2).toUpperCase()
                    : (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();

                const avatarInitials = document.querySelector('.avatar-initials');
                if (avatarInitials) avatarInitials.textContent = initials;
            }

            initialSnapshot = { ...currentSnapshot };
            isDirty = false;
            updateUI();
            showToast('Cambios guardados con éxito');
        };

        initialSnapshot = getSnapshot();
        updateUI();

        form.addEventListener('input', evaluateDirtyState);
        form.addEventListener('change', evaluateDirtyState);
        form.addEventListener('submit', saveChanges);

        if (btnDiscard) {
            btnDiscard.addEventListener('click', discardChanges);
        }

        if (btnSave) {
            btnSave.addEventListener('click', saveChanges);
        }
    })();

    // ==========================================================================
    // 3. Navegación de Pestañas (Tabs) con Delegación de Eventos
    // ==========================================================================
    const tabsNav = document.querySelector('.tabs-nav');
    const tabContents = document.querySelectorAll('.tab-content');

    if (tabsNav) {
        tabsNav.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;

            const targetId = btn.getAttribute('data-target') || btn.getAttribute('aria-controls');
            if (!targetId) return;

            const targetContent = document.getElementById(targetId);
            if (!targetContent) return;

            tabsNav.querySelectorAll('.tab-btn').forEach(b => {
                const isActive = (b === btn);
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', isActive ? 'true' : 'false');
                b.setAttribute('tabindex', isActive ? '0' : '-1');
            });

            tabContents.forEach(content => {
                const isActive = (content.id === targetId);
                content.classList.toggle('active', isActive);
                if (isActive) {
                    content.removeAttribute('hidden');
                } else {
                    content.setAttribute('hidden', '');
                }
            });
        });
    }

    // ==========================================================================
    // 4. Acciones Globales del Perfil
    // ==========================================================================
    const btnReport = document.getElementById('btnDownloadReport');
    if (btnReport) {
        btnReport.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                showToast('Generando constancia y reporte en formato PDF...');
                const { data: sessions } = await supabase
                    .from('tutoring_sessions')
                    .select('*')
                    .eq('tutor_id', currentUser.id)
                    .order('session_date', { ascending: false });
                const mapped = (sessions || []).map(s => ({
                    id: s.id,
                    studentName: s.student_name,
                    subject: s.subject,
                    hours: Number(s.hours),
                    date: s.session_date,
                    time: String(s.start_time).slice(0, 5),
                    evidence: s.evidence_path
                }));
                const name = document.getElementById('profileDisplayName')?.textContent || currentUser.email;
                exportEvidenceReport(mapped, { tutorName: name, chapterName: 'Capítulo Dual' });
            } catch (err) {
                console.error('Error al exportar reporte PDF:', err);
            }
        });
    }

    const btnRegister = document.getElementById('btnRegisterSession');
    if (btnRegister) {
        btnRegister.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
    }

    // ==========================================================================
    // 5. Gestión del Modo Claro / Oscuro (Sincronizado con dualorganizer_ui_config)
    // ==========================================================================
    const toggleDarkMode = document.getElementById('toggleDarkMode');
    const themeModeDescription = document.getElementById('themeModeDescription');
    const STORAGE_KEY = 'dualorganizer_ui_config';

    const getCurrentTheme = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('dualorganizer_preferences');
            if (raw) {
                const parsed = JSON.parse(raw);
                return parsed.theme || 'default-zinc';
            }
        } catch { }
        return 'default-zinc';
    };

    const setTheme = (themeName) => {
        document.documentElement.setAttribute('data-theme', themeName);
        try {
            const raw = localStorage.getItem(STORAGE_KEY) || '{}';
            let current = {};
            try { current = JSON.parse(raw); } catch { }
            current.theme = themeName;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
            localStorage.setItem('dualorganizer_preferences', JSON.stringify(current));
        } catch { }

        if (toggleDarkMode) {
            toggleDarkMode.checked = (themeName === 'cool-slate');
        }
        if (themeModeDescription) {
            themeModeDescription.textContent = themeName === 'cool-slate'
                ? 'Paleta oscura Slate activa'
                : 'Paleta clara Zinc activa';
        }
    };

    if (toggleDarkMode) {
        const initialTheme = getCurrentTheme();
        toggleDarkMode.checked = (initialTheme === 'cool-slate');
        if (themeModeDescription) {
            themeModeDescription.textContent = toggleDarkMode.checked
                ? 'Paleta oscura Slate activa'
                : 'Paleta clara Zinc activa';
        }

        toggleDarkMode.addEventListener('change', () => {
            const newTheme = toggleDarkMode.checked ? 'cool-slate' : 'default-zinc';
            setTheme(newTheme);
            showToast(toggleDarkMode.checked ? 'Modo oscuro activado' : 'Modo claro activado');
        });
    }

    document.querySelectorAll('[data-action="logout"]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            signOut();
        });
    });
});
