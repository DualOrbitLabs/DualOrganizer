// ==========================================================================
// DualOrganizer - Lógica del Dashboard Semanal (Vanilla JS ES6+)
// Buenas Prácticas: Delegación de Eventos, Sanitización, Persistencia Local
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. Estado y Datos Iniciales
    // --------------------------------------------------------------------------
    const STORAGE_KEY = 'dualorganizer_sessions_v1';
    let currentDate = new Date();

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

    // Cargar desde localStorage o inicializar con datos demo de tutoría
    const loadInitialData = () => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (err) {
            console.warn('Error al leer de localStorage:', err);
        }

        const today = new Date();
        const startOfWeek = getStartOfWeek(today);

        const formatDateHelper = (offsetDays) => {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + offsetDays);
            return formatDate(d);
        };

        return [
            {
                id: 'demo-1',
                studentName: 'Ana Sofía Garza',
                subject: 'Cálculo Diferencial',
                hours: 1.5,
                date: formatDateHelper(0), // Lunes
                time: '10:00',
                createdAt: new Date().toISOString()
            },
            {
                id: 'demo-2',
                studentName: 'Carlos Mendoza',
                subject: 'Física Mecánica',
                hours: 2.0,
                date: formatDateHelper(2), // Miércoles
                time: '14:00',
                createdAt: new Date().toISOString()
            },
            {
                id: 'demo-3',
                studentName: 'Mariana Ruiz',
                subject: 'Álgebra Lineal',
                hours: 1.0,
                date: formatDateHelper(4), // Viernes
                time: '12:00',
                createdAt: new Date().toISOString()
            }
        ];
    };

    let sessionsData = loadInitialData();

    const saveSessions = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsData));
        } catch (err) {
            console.warn('Error al persistir en localStorage:', err);
        }
    };

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

    // Filtro colapsable
    const calendarWrapper = document.getElementById('calendarWrapper');
    const btnToggleCalendar = document.getElementById('btnToggleCalendar');
    const dateFilter = document.getElementById('dateFilter');

    // Modal
    const sessionModal = document.getElementById('sessionModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const btnCancelModal = document.getElementById('btnCancelModal');
    const sessionForm = document.getElementById('sessionForm');
    const modalDateInput = document.getElementById('date');
    const modalTimeInput = document.getElementById('time');
    const studentNameInput = document.getElementById('studentName');
    const subjectInput = document.getElementById('subject');
    const hoursInput = document.getElementById('hours');

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
        const totalHours = sessionsData.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
        const totalSessions = sessionsData.length;

        if (kpiTotalHours) {
            kpiTotalHours.textContent = totalHours.toFixed(1).replace(/\.0$/, '');
        }
        if (kpiTotalSessions) {
            kpiTotalSessions.textContent = totalSessions;
        }
        if (kpiWeeklyAvg) {
            const uniqueWeeks = new Set(sessionsData.map(s => {
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
        for (let hour = 8; hour <= 18; hour++) {
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
                    sessionItem.title = `${session.subject} - Alumno: ${session.studentName} (${session.hours} hrs)`;

                    sessionItem.innerHTML = `
                        <span class="session-title">${escapeHTML(session.subject)}</span>
                        <div class="session-meta">
                            <span class="session-student">${escapeHTML(session.studentName)}</span>
                            <span class="badge-semantic blue">${session.hours}h</span>
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
                if (session) {
                    modalDateInput.value = session.date;
                    modalTimeInput.value = session.time;
                    studentNameInput.value = session.studentName;
                    subjectInput.value = session.subject;
                    hoursInput.value = session.hours;

                    sessionForm.dataset.editingId = session.id;
                    sessionModal.style.display = 'flex';
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
    // 7. Filtro / Cajón Superior Colapsable
    // --------------------------------------------------------------------------
    if (btnToggleCalendar && calendarWrapper) {
        btnToggleCalendar.addEventListener('click', () => {
            const isCollapsed = calendarWrapper.classList.toggle('collapsed');
            btnToggleCalendar.textContent = isCollapsed ? 'Mostrar' : 'Ocultar';
        });
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', () => {
            if (dateFilter.value) {
                currentDate = new Date(dateFilter.value + 'T00:00:00');
                renderWeeklyCalendar();
            }
        });
    }

    // --------------------------------------------------------------------------
    // 8. Gestión del Modal de Registro
    // --------------------------------------------------------------------------
    function openModal(date, time) {
        if (!sessionModal) return;

        sessionForm.reset();
        modalDateInput.value = date;
        modalTimeInput.value = time;
        hoursInput.value = '1.0';

        sessionModal.style.display = 'flex';
        setTimeout(() => studentNameInput?.focus(), 50);
    }

    function closeModal() {
        if (sessionModal) {
            sessionModal.style.display = 'none';
            delete sessionForm.dataset.editingId;
        }
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

    window.addEventListener('click', (e) => {
        if (e.target === sessionModal) {
            closeModal();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sessionModal && sessionModal.style.display === 'flex') {
            closeModal();
        }
    });

    if (sessionForm) {
        sessionForm.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!sessionForm.checkValidity()) {
                sessionForm.reportValidity();
                return;
            }

            const editingId = sessionForm.dataset.editingId;

            if (editingId) {
                // Actualizar sesión existente
                const idx = sessionsData.findIndex(s => s.id === editingId);
                if (idx !== -1) {
                    sessionsData[idx].studentName = studentNameInput.value.trim();
                    sessionsData[idx].subject = subjectInput.value.trim();
                    sessionsData[idx].hours = parseFloat(hoursInput.value) || 1.0;
                    sessionsData[idx].date = modalDateInput.value;
                    sessionsData[idx].time = modalTimeInput.value;
                    showToast('Sesión actualizada con éxito');
                }
            } else {
                // Crear nueva sesión
                const newSession = {
                    id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 's-' + Date.now(),
                    studentName: studentNameInput.value.trim(),
                    subject: subjectInput.value.trim(),
                    hours: parseFloat(hoursInput.value) || 1.0,
                    date: modalDateInput.value,
                    time: modalTimeInput.value,
                    createdAt: new Date().toISOString()
                };

                sessionsData.push(newSession);
                showToast('Sesión registrada con éxito');
            }

            saveSessions();
            closeModal();

            updateKPIs();
            renderWeeklyCalendar();
        });
    }

    // --------------------------------------------------------------------------
    // 9. Módulo de Exportación CSV
    // --------------------------------------------------------------------------
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            if (sessionsData.length === 0) {
                showToast('No hay sesiones registradas para exportar', 'warning');
                return;
            }

            const headers = ['ID', 'Alumno', 'Materia', 'Horas', 'Fecha', 'Hora', 'Creado'];
            const escapeCSV = (field) => `"${String(field).replace(/"/g, '""')}"`;

            const csvRows = [headers.join(',')];

            sessionsData.forEach(s => {
                const row = [
                    escapeCSV(s.id),
                    escapeCSV(s.studentName),
                    escapeCSV(s.subject),
                    s.hours,
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
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            window.URL.revokeObjectURL(url);
            showToast('Reporte CSV descargado');
        });
    }

    // --------------------------------------------------------------------------
    // 10. Inicialización
    // --------------------------------------------------------------------------
    updateKPIs();
    renderWeeklyCalendar();
});
