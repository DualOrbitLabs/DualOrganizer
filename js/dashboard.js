import { getAuthenticatedUser, signOut, supabase } from './supabaseClient.js';
import { APP_CONFIG, isDateInCurrentMonth } from './config.js';

// ==========================================================================
// DualOrganizer - Lógica del Dashboard Semanal (Vanilla JS ES6+)
// Buenas Prácticas: Delegación de Eventos, Sanitización, Persistencia Local
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
    // 1. Estado y Datos Iniciales
    // --------------------------------------------------------------------------
    let currentDate = new Date();
    let activeChapterId = new URLSearchParams(window.location.search).get('chapter');
    const dashboardChapterSelect = document.getElementById('dashboardChapterSelect');
    const btnRefreshDashboard = document.getElementById('btnRefreshDashboard');

    function getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes como primer día
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatDate(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function isSameDay(d1, d2) {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    let sessionsData = [];

    const mapSession = (session) => ({
        id: session.id,
        studentName: session.student_name,
        subject: session.subject,
        hours: Number(session.hours),
        date: session.session_date,
        time: String(session.start_time).slice(0, 5),
        evidence: session.evidence_path,
        createdAt: session.created_at,
        status: session.status
    });

    async function loadSessions() {
        if (!activeChapterId) {
            const { data: membership, error: membershipError } = await supabase
                .from('chapter_members')
                .select('chapter_id')
                .eq('user_id', currentUser.id)
                .eq('is_primary', true)
                .maybeSingle();
            if (membershipError) throw membershipError;
            activeChapterId = membership?.chapter_id || null;
        }

        if (!activeChapterId) return;

        const { data, error } = await supabase
            .from('tutoring_sessions')
            .select('*')
            .eq('chapter_id', activeChapterId)
            .order('session_date', { ascending: false });
        if (error) throw error;
        sessionsData = (data || []).map(mapSession);
    }

    async function refreshDashboard() {
        btnRefreshDashboard?.classList.add('is-loading');
        if (btnRefreshDashboard) btnRefreshDashboard.disabled = true;
        try {
            await loadChapterOptions();
            await loadSessions();
            await initActiveChapter();
            updateKPIs();
            renderWeeklyCalendar();
            showToast('Datos actualizados.');
        } catch (error) {
            console.error('Error al actualizar dashboard:', error);
            showToast('No se pudieron actualizar los datos.', 'warning');
        } finally {
            btnRefreshDashboard?.classList.remove('is-loading');
            if (btnRefreshDashboard) btnRefreshDashboard.disabled = false;
        }
    }

    async function loadChapterOptions() {
        if (!dashboardChapterSelect) return;
        const { data, error } = await supabase
            .from('chapter_members')
            .select('chapter_id, chapters(id, code, name)')
            .eq('user_id', currentUser.id);
        if (error) throw error;

        dashboardChapterSelect.innerHTML = '';
        (data || []).forEach((membership) => {
            const chapter = membership.chapters;
            if (!chapter) return;
            const option = document.createElement('option');
            option.value = chapter.id;
            option.textContent = `${chapter.code} · ${chapter.name}`;
            option.selected = chapter.id === activeChapterId;
            dashboardChapterSelect.appendChild(option);
        });

        if (!activeChapterId && dashboardChapterSelect.options.length > 0) {
            activeChapterId = dashboardChapterSelect.options[0].value;
            dashboardChapterSelect.options[0].selected = true;
        }
    }

    async function persistSession(session, editingId) {
        const payload = {
            chapter_id: activeChapterId,
            tutor_id: currentUser.id,
            student_name: session.studentName,
            subject: session.subject,
            session_date: session.date,
            start_time: session.time,
            hours: session.hours,
            evidence_path: session.evidence || null
        };
        const query = editingId
            ? supabase.from('tutoring_sessions').update(payload).eq('id', editingId).select().single()
            : supabase.from('tutoring_sessions').insert(payload).select().single();
        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    async function uploadEvidence(file, sessionId) {
        if (!file) return null;
        const fileCheck = validateUploadedFile(file);
        if (!fileCheck.valid) throw new Error(fileCheck.error);

        const storagePath = `${currentUser.id}/${sessionId}/${fileCheck.sanitizedName}`;
        const { error: uploadError } = await supabase.storage
            .from('session-evidence')
            .upload(storagePath, file, { contentType: file.type, upsert: true });
        if (uploadError) throw uploadError;

        const { error: evidenceError } = await supabase.from('session_evidence').upsert({
            session_id: sessionId,
            uploaded_by: currentUser.id,
            storage_path: storagePath,
            file_name: fileCheck.sanitizedName,
            mime_type: file.type,
            file_size: file.size
        }, { onConflict: 'storage_path' });
        if (evidenceError) throw evidenceError;

        const { error: sessionError } = await supabase
            .from('tutoring_sessions')
            .update({ evidence_path: storagePath })
            .eq('id', sessionId);
        if (sessionError) throw sessionError;
        return storagePath;
    }

    // --------------------------------------------------------------------------
    // 2. Selectores DOM
    // --------------------------------------------------------------------------
    const weeklyCalendarGrid = document.getElementById('weeklyCalendarGrid');
    const currentWeekLabel = document.getElementById('currentWeekLabel');
    const btnPrevWeek = document.getElementById('btnPrevWeek');
    const btnNextWeek = document.getElementById('btnNextWeek');
    const btnToday = document.getElementById('btnToday');
    const btnExportCSV = document.getElementById('btnExportCSV');

    // Métricas KPI
    const kpiTotalHours = document.getElementById('kpiTotalHours');
    const kpiTotalSessions = document.getElementById('kpiTotalSessions');
    const kpiWeeklyAvg = document.getElementById('kpiWeeklyAvg');

    // Filtro colapsable (Eliminado)

    // Modal
    const sessionModal = document.getElementById('sessionModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const btnCancelModal = document.getElementById('btnCancelModal');
    const btnDeleteModal = document.getElementById('btnDeleteModal');
    const sessionForm = document.getElementById('sessionForm');
    const modalDateInput = document.getElementById('date');
    const modalTimeInput = document.getElementById('time');
    const studentNameInput = document.getElementById('studentName');
    const subjectInput = document.getElementById('subject');
    const hoursInput = document.getElementById('hours');
    const evidenceFileInput = document.getElementById('evidenceFile');

    // Toast
    const toastEl = document.getElementById('dashboardToast');
    const toastMsgEl = document.getElementById('dashboardToastMsg');
    let toastTimer = null;

    const showToast = (message, type = 'success') => {
        if (!toastEl || !toastMsgEl) return;
        toastMsgEl.textContent = message;

        const indicator = toastEl.querySelector('.toast-indicator');
        if (indicator) {
            indicator.style.backgroundColor = (type === 'warning' || type === 'error') ? '#f59e0b' : '#10b981';
        }

        toastEl.classList.add('visible');
        toastEl.setAttribute('aria-hidden', 'false');

        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('visible');
            toastEl.setAttribute('aria-hidden', 'true');
        }, 3000);
    };

    // --------------------------------------------------------------------------
    // 3. Actualización de KPIs con Números Tabulares
    // --------------------------------------------------------------------------
    function updateKPIs() {
        const currentMonthSessions = sessionsData.filter(session => isDateInCurrentMonth(session.date));
        const totalHours = currentMonthSessions.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
        const totalSessions = sessionsData.length;

        if (kpiTotalHours) {
            kpiTotalHours.textContent = totalHours.toFixed(1).replace(/\.0$/, '');
        }
        if (kpiTotalSessions) {
            kpiTotalSessions.textContent = totalSessions;
        }
        if (kpiWeeklyAvg) {
            const uniqueWeeks = new Set(currentMonthSessions.map(s => {
                const d = new Date(s.date + 'T00:00:00');
                const sow = getStartOfWeek(d);
                return sow.getTime();
            })).size || 1;

            const avg = totalHours / uniqueWeeks;
            kpiWeeklyAvg.textContent = avg.toFixed(1);
        }
    }

    // --------------------------------------------------------------------------
    // 4. Renderizado del Calendario Semanal con CSS Grid Fraccional
    // --------------------------------------------------------------------------
    function renderWeeklyCalendar() {
        if (!weeklyCalendarGrid) return;
        weeklyCalendarGrid.innerHTML = '';
        weeklyCalendarGrid.style.setProperty('--calendar-row-height', `${APP_CONFIG.academic.calendarRowHeightPx}px`);

        const startOfWeek = getStartOfWeek(currentDate);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const startMonth = monthNames[startOfWeek.getMonth()];
        const endMonth = monthNames[endOfWeek.getMonth()];

        if (currentWeekLabel) {
            currentWeekLabel.textContent = `Semana: ${startOfWeek.getDate()} ${startMonth} - ${endOfWeek.getDate()} ${endMonth} ${endOfWeek.getFullYear()}`;
        }

        const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const today = new Date();

        // 4.1 Celda de esquina superior izquierda
        const cornerCell = document.createElement('div');
        cornerCell.className = 'grid-cell header corner';
        cornerCell.textContent = 'Hora';
        weeklyCalendarGrid.appendChild(cornerCell);

        // 4.2 Celdas de cabecera para los 7 días
        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setDate(startOfWeek.getDate() + i);
            const dateStr = formatDate(dayDate);
            weekDates.push(dateStr);

            const isCurrentToday = isSameDay(dayDate, today);

            const dayHeader = document.createElement('div');
            dayHeader.className = `grid-cell header${isCurrentToday ? ' today' : ''}`;
            dayHeader.setAttribute('role', 'columnheader');

            dayHeader.innerHTML = `
                <span class="day-name">${days[i]}</span>
                <span class="day-date tabular-nums">${dayDate.getDate()} ${monthNames[dayDate.getMonth()]}</span>
            `;

            weeklyCalendarGrid.appendChild(dayHeader);
        }

        // 4.3 Filas de horas (8:00 a 18:00)
        for (let hour = APP_CONFIG.academic.calendarStartHour; hour <= APP_CONFIG.academic.calendarEndHour; hour++) {
            const hourString = `${String(hour).padStart(2, '0')}:00`;

            const timeLabel = document.createElement('div');
            timeLabel.className = 'grid-cell time-label';
            timeLabel.textContent = hourString;
            timeLabel.setAttribute('role', 'rowheader');
            weeklyCalendarGrid.appendChild(timeLabel);

            for (let i = 0; i < 7; i++) {
                const slotDate = weekDates[i];
                const slot = document.createElement('div');
                slot.className = 'grid-cell slot';
                slot.dataset.date = slotDate;
                slot.dataset.time = hourString;
                slot.setAttribute('role', 'gridcell');
                slot.setAttribute('aria-label', `${days[i]} ${slotDate} a las ${hourString}`);

                const slotSessions = sessionsData.filter(s => s.date === slotDate && s.time === hourString);

                slotSessions.forEach(session => {
                    const sessionItem = document.createElement('div');
                    sessionItem.className = 'session-item';
                    sessionItem.dataset.id = session.id;
                    sessionItem.style.setProperty('--session-duration', String(Math.max(Number(session.hours) || 1, 1)));
                    sessionItem.title = `${session.subject} - Alumno: ${session.studentName} (${session.hours} hrs)`;

                    const evidenceBadge = session.evidence 
                        ? `<span class="badge-semantic green" title="Evidencia adjunta">
                             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                               <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                             </svg>
                           </span>` 
                        : '';

                    sessionItem.innerHTML = `
                        <span class="session-title">${escapeHTML(session.subject)}</span>
                        <div class="session-meta">
                            <span class="session-student">${escapeHTML(session.studentName)}</span>
                            <div style="display:flex; gap: 4px;">
                                ${evidenceBadge}
                                <span class="badge-semantic blue">${session.hours}h</span>
                            </div>
                        </div>
                    `;

                    slot.appendChild(sessionItem);
                });

                weeklyCalendarGrid.appendChild(slot);
            }
        }
    }

    // --------------------------------------------------------------------------
    // 5. Delegación de Eventos en la Cuadrícula del Calendario
    // --------------------------------------------------------------------------
    if (weeklyCalendarGrid) {
        weeklyCalendarGrid.addEventListener('click', (e) => {
            // Caso A: Clic en una sesión agendada -> abrir modal con datos cargados para editar o ver
            const sessionEl = e.target.closest('.session-item');
            if (sessionEl) {
                e.stopPropagation();
                const sessionId = sessionEl.dataset.id;
                const session = sessionsData.find(s => s.id === sessionId);
                if (session && sessionModal) {
                    modalDateInput.value = session.date;
                    modalTimeInput.value = session.time;
                    studentNameInput.value = session.studentName;
                    subjectInput.value = session.subject;
                    hoursInput.value = session.hours;

                    sessionForm.dataset.editingId = session.id;
                    if (btnDeleteModal) btnDeleteModal.style.display = 'block';
                    sessionModal.showModal();
                    setTimeout(() => studentNameInput?.focus(), 50);
                }
                return;
            }

            // Caso B: Clic en un slot vacío para agendar nueva sesión
            const slot = e.target.closest('.grid-cell.slot');
            if (slot) {
                const date = slot.dataset.date;
                const time = slot.dataset.time;
                if (date && time) {
                    delete sessionForm.dataset.editingId;
                    if (btnDeleteModal) btnDeleteModal.style.display = 'none';
                    openModal(date, time);
                }
            }
        });
    }

    // --------------------------------------------------------------------------
    // 6. Navegación Semanal
    // --------------------------------------------------------------------------
    if (btnPrevWeek) {
        btnPrevWeek.addEventListener('click', () => {
            currentDate.setDate(currentDate.getDate() - 7);
            renderWeeklyCalendar();
        });
    }

    if (btnNextWeek) {
        btnNextWeek.addEventListener('click', () => {
            currentDate.setDate(currentDate.getDate() + 7);
            renderWeeklyCalendar();
        });
    }

    if (btnToday) {
        btnToday.addEventListener('click', () => {
            currentDate = new Date();
            renderWeeklyCalendar();
        });
    }

    // --------------------------------------------------------------------------
    // 7. Funciones Defensivas de Tiempo y Validación de Ficheros
    // --------------------------------------------------------------------------
    const FILE_CONSTRAINTS = {
        MAX_BYTES: APP_CONFIG.uploads.maxBytes,
        ALLOWED_MIME_TYPES: APP_CONFIG.uploads.allowedMimeTypes
    };

    function validateUploadedFile(file) {
        if (!file) return { valid: true };

        if (file.size > FILE_CONSTRAINTS.MAX_BYTES) {
            const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
            return {
                valid: false,
                error: `El archivo (${sizeInMB} MB) excede el tamaño máximo permitido de 5 MB.`
            };
        }

        if (!FILE_CONSTRAINTS.ALLOWED_MIME_TYPES.includes(file.type)) {
            return {
                valid: false,
                error: 'Formato no permitido. Solo se aceptan archivos PDF e imágenes JPG o PNG.'
            };
        }

        const sanitizedName = file.name.replace(/[^a-zA-Z0-9_.\-]/g, '_');
        return { valid: true, sanitizedName };
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    function hasTimeOverlapConflict(candidate, existingSessions) {
        const candStart = timeToMinutes(candidate.time);
        const candEnd = candStart + Math.round(candidate.hours * 60);

        return existingSessions.some((s) => {
            if (candidate.id && s.id === candidate.id) return false;
            if (s.date !== candidate.date) return false;

            const sStart = timeToMinutes(s.time);
            const sEnd = sStart + Math.round((Number(s.hours) || 1) * 60);

            return candStart < sEnd && candEnd > sStart;
        });
    }

    // --------------------------------------------------------------------------
    // 8. Gestión del Modal Nativo (<dialog>) de Registro
    // --------------------------------------------------------------------------
    function openModal(date, time) {
        if (!sessionModal) return;

        sessionForm.reset();
        modalDateInput.value = date;
        modalTimeInput.value = time;
        hoursInput.value = '1.0';
        if (evidenceFileInput) evidenceFileInput.value = '';

        sessionModal.showModal();
        setTimeout(() => studentNameInput?.focus(), 50);
    }

    function closeModal() {
        if (sessionModal && sessionModal.open) {
            sessionModal.close();
            delete sessionForm.dataset.editingId;
        }
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

    if (btnDeleteModal) {
        btnDeleteModal.addEventListener('click', async () => {
            const editingId = sessionForm.dataset.editingId;
            if (editingId) {
                if (confirm('¿Estás seguro de que deseas cancelar esta sesión?')) {
                    try {
                        const { error } = await supabase.from('tutoring_sessions').delete().eq('id', editingId);
                        if (error) throw error;
                        sessionsData = sessionsData.filter(s => s.id !== editingId);
                        showToast('Sesión cancelada con éxito');
                        closeModal();
                        updateKPIs();
                        renderWeeklyCalendar();
                    } catch (error) {
                        console.error('Error al borrar sesión:', error);
                        showToast('No se pudo cancelar la sesión.', 'warning');
                    }
                }
            }
        });
    }

    // Cierre al hacer clic fuera del diálogo (en ::backdrop)
    if (sessionModal) {
        sessionModal.addEventListener('click', (e) => {
            const rect = sessionModal.getBoundingClientRect();
            const isInDialog = (
                rect.top <= e.clientY &&
                e.clientY <= rect.top + rect.height &&
                rect.left <= e.clientX &&
                e.clientX <= rect.left + rect.width
            );
            if (!isInDialog) {
                closeModal();
            }
        });
    }

    let isSessionSubmitting = false;

    if (sessionForm) {
        sessionForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (isSessionSubmitting) return;

            if (!sessionForm.checkValidity()) {
                sessionForm.reportValidity();
                return;
            }

            const rawStudentName = studentNameInput.value.trim();
            const rawSubject = subjectInput.value.trim();
            const rawHours = parseFloat(hoursInput.value) || 1.0;
            const rawDate = modalDateInput.value;
            const rawTime = modalTimeInput.value;
            const editingId = sessionForm.dataset.editingId;

            // Validación 1: Límites de texto
            if (rawStudentName.length < 3 || rawStudentName.length > 80) {
                showToast('El nombre del alumno debe contener entre 3 y 80 caracteres.', 'warning');
                studentNameInput.focus();
                return;
            }

            if (rawSubject.length < 2 || rawSubject.length > 60) {
                showToast('La materia debe contener entre 2 y 60 caracteres.', 'warning');
                subjectInput.focus();
                return;
            }

            // Validación 2: Archivo de evidencia seguro
            let evidenceFile = null;
            if (evidenceFileInput && evidenceFileInput.files.length > 0) {
                const fileCheck = validateUploadedFile(evidenceFileInput.files[0]);
                if (!fileCheck.valid) {
                    showToast(fileCheck.error, 'warning');
                    return;
                }
                evidenceFile = evidenceFileInput.files[0];
            }

            // Validación 3: Solapamiento horario
            const candidateSession = {
                id: editingId || null,
                date: rawDate,
                time: rawTime,
                hours: rawHours
            };

            if (hasTimeOverlapConflict(candidateSession, sessionsData)) {
                showToast('Conflicto horario: Ya tienes una sesión agendada que se solapa en esa franja.', 'warning');
                return;
            }

            const submitBtn = sessionForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Guardar Sesión';

            try {
                isSessionSubmitting = true;
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.setAttribute('aria-busy', 'true');
                }

                if (!activeChapterId) {
                    throw new Error('No hay un capítulo activo seleccionado.');
                }

                if (editingId) {
                    const idx = sessionsData.findIndex(s => s.id === editingId);
                    if (idx !== -1) {
                        sessionsData[idx].studentName = rawStudentName;
                        sessionsData[idx].subject = rawSubject;
                        sessionsData[idx].hours = rawHours;
                        sessionsData[idx].date = rawDate;
                        sessionsData[idx].time = rawTime;
                        const savedSession = await persistSession(sessionsData[idx], editingId);
                        if (evidenceFile) {
                            sessionsData[idx].evidence = await uploadEvidence(evidenceFile, savedSession.id);
                        }
                        showToast('Sesión actualizada con éxito');
                    }
                } else {
                    const newSession = {
                        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 's-' + Date.now(),
                        studentName: rawStudentName,
                        subject: rawSubject,
                        hours: rawHours,
                        date: rawDate,
                        time: rawTime,
                        evidence: null,
                        createdAt: new Date().toISOString()
                    };

                    const savedSession = await persistSession(newSession, null);
                    if (evidenceFile) await uploadEvidence(evidenceFile, savedSession.id);
                    await loadSessions();
                    showToast('Sesión registrada con éxito');
                }
                closeModal();
                updateKPIs();
                renderWeeklyCalendar();
            } catch (err) {
                console.error('Error al guardar sesión:', err);
                showToast('Ocurrió un error al guardar la sesión.', 'warning');
            } finally {
                isSessionSubmitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.removeAttribute('aria-busy');
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        });
    }

    // --------------------------------------------------------------------------
    // 9. Módulo de Exportación CSV Seguro (Formula Injection Mitigation + Async Revoke)
    // --------------------------------------------------------------------------
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            if (sessionsData.length === 0) {
                showToast('No hay sesiones registradas para exportar', 'warning');
                return;
            }

            const headers = ['ID', 'Alumno', 'Materia', 'Horas', 'Fecha', 'Hora', 'Creado'];
            const escapeCSV = (field) => {
                if (field === null || field === undefined) return '""';
                let str = String(field).trim();
                if (/^[=+\-@\t\r]/.test(str)) {
                    str = `'${str}`;
                }
                return `"${str.replace(/"/g, '""')}"`;
            };

            const csvRows = [headers.map(escapeCSV).join(',')];

            sessionsData.forEach(s => {
                const row = [
                    escapeCSV(s.id),
                    escapeCSV(s.studentName),
                    escapeCSV(s.subject),
                    escapeCSV(s.hours),
                    escapeCSV(s.date),
                    escapeCSV(s.time),
                    escapeCSV(s.createdAt)
                ];
                csvRows.push(row.join(','));
            });

            const csvString = '\uFEFF' + csvRows.join('\r\n');
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `reporte_sesiones_${formatDate(new Date())}.csv`);
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 1500);

            showToast('Reporte CSV descargado con éxito');
        });
    }

    // --------------------------------------------------------------------------
    // 10. Inicialización y Carga de Capítulo Activo
    // --------------------------------------------------------------------------
    const initActiveChapter = async () => {
        try {
            const chapterId = new URLSearchParams(window.location.search).get('chapter') || activeChapterId;
            if (chapterId) {
                activeChapterId = chapterId;
                const { data: chapter, error } = await supabase
                    .from('chapters')
                    .select('code, name')
                    .eq('id', chapterId)
                    .single();
                if (error) throw error;
                const codeEl = document.getElementById('activeChapterCode');
                const nameEl = document.getElementById('activeChapterName');
                if (codeEl && chapter.code) codeEl.textContent = chapter.code;
                if (nameEl && chapter.name) nameEl.textContent = chapter.name;
            }
        } catch (e) {
            console.warn('Error al leer capítulo activo:', e);
        }
    };

    try {
        await loadChapterOptions();
        await initActiveChapter();
    } catch (error) {
        console.error('Error al cargar capítulos:', error);
    }
    try {
        await loadSessions();
    } catch (error) {
        console.error('Error al cargar sesiones:', error);
        showToast('No se pudieron cargar las sesiones del servidor.', 'warning');
    }
    updateKPIs();
    renderWeeklyCalendar();

    btnRefreshDashboard?.addEventListener('click', refreshDashboard);

    document.querySelectorAll('[data-action="logout"]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            signOut();
        });
    });

    dashboardChapterSelect?.addEventListener('change', () => {
        const chapterId = dashboardChapterSelect.value;
        if (chapterId) window.location.href = `dashboard.html?chapter=${encodeURIComponent(chapterId)}`;
    });
});
