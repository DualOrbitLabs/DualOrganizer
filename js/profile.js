// ==========================================================================
// Lógica para el Perfil del Tutor - DualOrganizer
// Stack: Vanilla JavaScript ES6+ Puro (Sin librerías ni frameworks)
// Características: Tag-Input Dinámico, Dirty-State Management, Delegación de Eventos
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // Validación de sesión
    const sessionStr = sessionStorage.getItem('dualorganizer_session');
    if (!sessionStr) {
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

    // --------------------------------------------------------------------------
    // Carga e Hidratación de Sesión del Usuario
    // --------------------------------------------------------------------------
    const STORAGE_SESSION_KEY = 'dualorganizer_session';
    const sessionRaw = sessionStorage.getItem(STORAGE_SESSION_KEY);
    if (sessionRaw) {
        try {
            const userSession = JSON.parse(sessionRaw);
            const profileDisplayName = document.getElementById('profileDisplayName');
            const avatarInitials = document.querySelector('.avatar-initials');
            const profileAvatar = document.querySelector('.profile-avatar');
            const badgeRole = document.querySelector('.badge-role');
            const inputFullName = document.getElementById('inputFullName');
            const inputEmail = document.getElementById('inputEmail');

            if (userSession.name) {
                if (profileDisplayName) profileDisplayName.textContent = userSession.name;
                if (inputFullName) inputFullName.value = userSession.name;

                // Generar iniciales dinámicas
                const nameParts = userSession.name.trim().split(/\s+/);
                const initials = nameParts.length === 1
                    ? nameParts[0].substring(0, 2).toUpperCase()
                    : (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();

                if (avatarInitials) avatarInitials.textContent = initials;
                if (profileAvatar) profileAvatar.setAttribute('aria-label', `Avatar de ${userSession.name}`);
            }

            if (userSession.identifier && inputEmail) {
                inputEmail.value = userSession.identifier;
            }

            if (userSession.role === 'ADMIN') {
                if (badgeRole) badgeRole.textContent = 'Coordinación Académica';
                const studentIdInput = document.getElementById('inputStudentId');
                if (studentIdInput) studentIdInput.value = 'ADM-2026-0001';
            }

            // Hidratar perfil extendido si existe en localStorage
            const savedProfileRaw = localStorage.getItem('dualorganizer_profile_v1');
            if (savedProfileRaw) {
                try {
                    const savedProfile = JSON.parse(savedProfileRaw);
                    if (savedProfile.phone) {
                        const inputPhone = document.getElementById('inputPhone');
                        if (inputPhone) inputPhone.value = savedProfile.phone;
                    }
                    if (savedProfile.semester) {
                        const selectSemester = document.getElementById('selectSemester');
                        if (selectSemester) selectSemester.value = savedProfile.semester;
                    }
                    if (savedProfile.description) {
                        const textareaDesc = document.getElementById('textareaDescription');
                        if (textareaDesc) textareaDesc.value = savedProfile.description;
                    }
                    if (savedProfile.timeSlots) {
                        const inputTime = document.getElementById('inputTimeSlots');
                        if (inputTime) inputTime.value = savedProfile.timeSlots;
                    }
                    if (savedProfile.meetingUrl) {
                        const inputUrl = document.getElementById('inputMeetingUrl');
                        if (inputUrl) inputUrl.value = savedProfile.meetingUrl;
                    }
                    if (savedProfile.materias) {
                        const hiddenMat = document.getElementById('materiasHidden') || document.getElementById('hiddenMaterias');
                        if (hiddenMat) hiddenMat.value = savedProfile.materias;
                    }
                } catch (e) {
                    console.warn('Error al leer perfil persistido:', e);
                }
            }
        } catch (err) {
            console.warn('Error al procesar la sesión en profile.js:', err);
        }
    }

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

        const saveChanges = (e) => {
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

            // 1. Sincronizar dualorganizer_session
            const sessionRaw = sessionStorage.getItem(STORAGE_SESSION_KEY);
            if (sessionRaw) {
                try {
                    const session = JSON.parse(sessionRaw);
                    session.name = currentSnapshot.fullName?.trim() || session.name;
                    sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
                } catch (err) {
                    console.warn('Error al actualizar sesión en storage:', err);
                }
            }

            // 2. Persistir perfil completo en localStorage
            try {
                localStorage.setItem('dualorganizer_profile_v1', JSON.stringify(currentSnapshot));
            } catch (err) {
                console.warn('Error al persistir perfil en localStorage:', err);
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
        btnReport.addEventListener('click', (e) => {
            e.preventDefault();
            showToast('Generando constancia y reporte en formato PDF...');
        });
    }

    const btnRegister = document.getElementById('btnRegisterSession');
    if (btnRegister) {
        btnRegister.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
    }
});
