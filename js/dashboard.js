/**
 * DualOrganizer - Dashboard Interactive Logic
 * Handles state management, weekly/monthly calendar rendering,
 * drag-and-drop, popover micro-actions, KPI updating, and session scheduling modal.
 */

document.addEventListener('DOMContentLoaded', () => {
  // User Profile Data
  const userProfile = {
    name: 'Carlos Mendoza',
    role: 'Mentor de Desarrollo Web & Dual',
    status: 'Mentor Activo',
    avatarUrl: 'assets/avatar.jpg'
  };

  // App State Initialization
  const state = {
    currentDate: new Date(2026, 8, 4), // September 4, 2026
    currentView: 'weekly', // 'weekly' or 'monthly'
    isBannerCollapsed: false,
    hoursAccredited: 32.0,
    hoursTarget: 40.0,
    sessions: [
      {
        id: 's1',
        title: 'Desarrollo Web Frontend',
        mentor: 'Ana Martínez (Alumno)',
        duration: 1.5,
        status: 'validated', // 'validated' or 'pending'
        date: '2026-09-01',
        time: '09:00'
      },
      {
        id: 's2',
        title: 'Arquitectura de Software',
        mentor: 'Carlos Mendoza (Mentor)',
        duration: 2.0,
        status: 'validated',
        date: '2026-09-03',
        time: '11:00'
      },
      {
        id: 's3',
        title: 'Revisión Dual & Firma',
        mentor: 'Lic. Fernando Ruiz',
        duration: 1.0,
        status: 'pending',
        date: '2026-09-04',
        time: '14:00'
      },
      {
        id: 's4',
        title: 'Modelado de Base de Datos',
        mentor: 'Ana Martínez (Alumno)',
        duration: 1.5,
        status: 'pending',
        date: '2026-09-05',
        time: '10:00'
      },
      {
        id: 's5',
        title: 'Evaluación de Minutas IA',
        mentor: 'Ing. Sofia Torres',
        duration: 1.0,
        status: 'pending',
        date: '2026-09-07',
        time: '16:00'
      },
      {
        id: 's6',
        title: 'Integración API Backend',
        mentor: 'Carlos Mendoza (Mentor)',
        duration: 2.0,
        status: 'pending',
        date: '2026-09-10',
        time: '11:00'
      }
    ]
  };

  // Initialize User Profile Info
  function initUserProfile() {
    const nameElem = document.getElementById('user-name');
    const roleElem = document.getElementById('user-role');
    const avatarElem = document.getElementById('user-avatar');
    const badgeElem = document.getElementById('user-status-badge');

    if (nameElem) nameElem.textContent = userProfile.name;
    if (roleElem) roleElem.textContent = userProfile.role;
    if (avatarElem) avatarElem.src = userProfile.avatarUrl;
    if (badgeElem) badgeElem.textContent = userProfile.status;
  }

  // DOM Elements
  const topBanner = document.getElementById('top-banner');
  const toggleWeeklyBtn = document.getElementById('toggle-weekly');
  const toggleMonthlyBtn = document.getElementById('toggle-monthly');
  const expandSwitchBtn = document.getElementById('expand-switch-btn');
  const calendarMatrixWrapper = document.getElementById('calendar-matrix-wrapper');
  const currentDateTitle = document.getElementById('current-date-title');
  const prevDateBtn = document.getElementById('prev-date');
  const nextDateBtn = document.getElementById('next-date');
  const todayBtn = document.getElementById('today-btn');
  const scheduleSessionBtn = document.getElementById('schedule-session-btn');
  const scheduleModal = document.getElementById('schedule-modal');
  const closeScheduleModalBtn = document.getElementById('close-schedule-modal');
  const cancelScheduleBtn = document.getElementById('cancel-schedule-btn');
  const scheduleForm = document.getElementById('schedule-form');
  const hoursValueElem = document.getElementById('kpi-hours-value');
  const hoursProgressFill = document.getElementById('kpi-hours-progress');
  const pendingCountElem = document.getElementById('kpi-pending-count');

  // Generic Toast Notification Function
  window.showToast = function(message, icon = '✨') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // Render KPIs
  function updateKPIs() {
    if (hoursValueElem) {
      hoursValueElem.textContent = `${state.hoursAccredited.toFixed(1)} / ${state.hoursTarget} hrs`;
    }
    if (hoursProgressFill) {
      const percentage = Math.min(100, (state.hoursAccredited / state.hoursTarget) * 100);
      hoursProgressFill.style.width = `${percentage}%`;
    }

    const pendingCount = state.sessions.filter(s => s.status === 'pending').length;
    if (pendingCountElem) {
      pendingCountElem.textContent = `⚠️ ${pendingCount} Pendiente${pendingCount !== 1 ? 's' : ''}`;
    }
  }

  // Update View Mode (Weekly vs Monthly)
  function setViewMode(view) {
    state.currentView = view;

    if (view === 'monthly') {
      toggleWeeklyBtn.classList.remove('active');
      toggleMonthlyBtn.classList.add('active');
      expandSwitchBtn.innerHTML = `<span>🗗</span> <span>Colapsar cuadrícula</span>`;
      topBanner.classList.add('collapsed-banner');
      state.isBannerCollapsed = true;
    } else {
      toggleMonthlyBtn.classList.remove('active');
      toggleWeeklyBtn.classList.add('active');
      expandSwitchBtn.innerHTML = `<span>⇱</span> <span>Expandir cuadrícula</span>`;
      topBanner.classList.remove('collapsed-banner');
      state.isBannerCollapsed = false;
    }

    renderCalendar();
  }

  // Helper date functions
  function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return new Date(date.setDate(diff));
  }

  function formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Render Main Calendar
  function renderCalendar() {
    updateKPIs();
    calendarMatrixWrapper.innerHTML = '';

    if (state.currentView === 'weekly') {
      renderWeeklyView();
    } else {
      renderMonthlyView();
    }
  }

  // RENDER VISTA SEMANAL (Modo Compacto)
  function renderWeeklyView() {
    const startOfWeek = getStartOfWeek(state.currentDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const monthName = startOfWeek.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    currentDateTitle.textContent = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} (Semana ${startOfWeek.getDate()} - ${endOfWeek.getDate()})`;

    const weeklyGrid = document.createElement('div');
    weeklyGrid.className = 'weekly-grid';

    // Header
    const weeklyHeader = document.createElement('div');
    weeklyHeader.className = 'weekly-header';
    weeklyHeader.innerHTML = `<div class="weekly-header-cell">Hora</div>`;

    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weekDays = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDays.push(d);

      const isToday = formatDateYYYYMMDD(d) === formatDateYYYYMMDD(new Date());
      const headerCell = document.createElement('div');
      headerCell.className = `weekly-header-cell ${isToday ? 'today-header' : ''}`;
      headerCell.innerHTML = `
        <span class="day-name">${dayNames[i]}</span>
        <span class="day-num">${d.getDate()}</span>
      `;
      weeklyHeader.appendChild(headerCell);
    }
    weeklyGrid.appendChild(weeklyHeader);

    // Body (Hourly slots 08:00 to 17:00)
    const weeklyBody = document.createElement('div');
    weeklyBody.className = 'weekly-body';

    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

    hours.forEach(hour => {
      const timeRow = document.createElement('div');
      timeRow.className = 'time-row';

      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.textContent = hour;
      timeRow.appendChild(timeLabel);

      weekDays.forEach(day => {
        const dateStr = formatDateYYYYMMDD(day);
        const isToday = dateStr === formatDateYYYYMMDD(new Date());

        const daySlot = document.createElement('div');
        daySlot.className = `day-slot ${isToday ? 'is-today' : ''}`;
        daySlot.dataset.date = dateStr;
        daySlot.dataset.time = hour;

        // Find matching sessions for this date & hour slot
        const matchingSessions = state.sessions.filter(s => {
          return s.date === dateStr && (s.time.startsWith(hour.slice(0, 2)));
        });

        matchingSessions.forEach(session => {
          daySlot.appendChild(createSessionCard(session));
        });

        timeRow.appendChild(daySlot);
      });

      weeklyBody.appendChild(timeRow);
    });

    weeklyGrid.appendChild(weeklyBody);
    calendarMatrixWrapper.appendChild(weeklyGrid);
  }

  // RENDER VISTA MENSUAL (Modo Expandido Grid)
  function renderMonthlyView() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const monthName = firstDayOfMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    currentDateTitle.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const monthlyGrid = document.createElement('div');
    monthlyGrid.className = 'monthly-grid';

    // Header
    const monthlyHeader = document.createElement('div');
    monthlyHeader.className = 'monthly-header';
    const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    dayNames.forEach(name => {
      const cell = document.createElement('div');
      cell.className = 'monthly-header-cell';
      cell.textContent = name;
      monthlyHeader.appendChild(cell);
    });
    monthlyGrid.appendChild(monthlyHeader);

    // Body Grid
    const monthlyBody = document.createElement('div');
    monthlyBody.className = 'monthly-body';

    // Calculate grid days (start from Monday)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday

    const totalCells = 35; // 5 weeks x 7 days
    const todayStr = formatDateYYYYMMDD(new Date());

    for (let i = 0; i < totalCells; i++) {
      const cellDate = new Date(year, month, 1 - startDayOfWeek + i);
      const dateStr = formatDateYYYYMMDD(cellDate);
      const isDifferentMonth = cellDate.getMonth() !== month;
      const isToday = dateStr === todayStr;

      const cell = document.createElement('div');
      cell.className = `month-cell ${isDifferentMonth ? 'different-month' : ''} ${isToday ? 'is-today' : ''}`;
      cell.dataset.date = dateStr;

      // Cell Header
      const cellHeader = document.createElement('div');
      cellHeader.className = 'month-cell-header';
      cellHeader.innerHTML = `<span class="date-number">${cellDate.getDate()}</span>`;
      cell.appendChild(cellHeader);

      // Cell Events Container
      const eventsContainer = document.createElement('div');
      eventsContainer.className = 'month-cell-events';

      const matchingSessions = state.sessions.filter(s => s.date === dateStr);
      matchingSessions.forEach(session => {
        eventsContainer.appendChild(createSessionCard(session));
      });

      cell.appendChild(eventsContainer);

      // Drag and Drop Listeners for Cell
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('drag-over');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-over');
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        const sessionId = e.dataTransfer.getData('text/plain');
        const session = state.sessions.find(s => s.id === sessionId);
        if (session && session.date !== dateStr) {
          session.date = dateStr;
          showToast(`Sesión reubicada al ${cellDate.getDate()} de ${monthName}`, '📅');
          renderCalendar();
        }
      });

      monthlyBody.appendChild(cell);
    }

    monthlyGrid.appendChild(monthlyBody);
    calendarMatrixWrapper.appendChild(monthlyGrid);
  }

  // Create Session Event Card Component
  function createSessionCard(session) {
    const card = document.createElement('div');
    card.className = `session-card ${session.status}`;
    card.draggable = true;
    card.dataset.id = session.id;

    const isValidated = session.status === 'validated';
    const statusText = isValidated ? '✅ Validada' : '⏳ Pendiente';

    card.innerHTML = `
      <div class="session-card-header">
        <span class="session-title">${session.title}</span>
        <button class="more-options-btn" title="Micro-acciones">⋮</button>
      </div>
      <div class="session-subtitle">${session.mentor}</div>
      <div class="session-footer">
        <span class="session-duration">⏱ ${session.duration}h (${session.time})</span>
        <span class="status-tag">${statusText}</span>
      </div>
    `;

    // Drag Start
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', session.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });

    // Popover Trigger
    const optionsBtn = card.querySelector('.more-options-btn');
    optionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPopoverMenu(e.clientX, e.clientY, session);
    });

    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('more-options-btn')) {
        openPopoverMenu(e.clientX, e.clientY, session);
      }
    });

    return card;
  }

  // Popover Contextual Menu for Micro-actions
  function openPopoverMenu(x, y, session) {
    closePopoverMenu();

    const popover = document.createElement('div');
    popover.className = 'popover-menu';
    popover.id = 'active-popover';

    const isValidated = session.status === 'validated';

    popover.innerHTML = `
      <button class="popover-item" id="act-upload">
        <span>📄</span> <span>Subir evidencia</span>
      </button>
      <button class="popover-item" id="act-ai">
        <span>🤖</span> <span>Generar resumen con IA</span>
      </button>
      ${!isValidated ? `
        <button class="popover-item acreditar-btn" id="act-acreditar">
          <span>✅</span> <span>Acreditar horas (${session.duration}h)</span>
        </button>
      ` : ''}
    `;

    // Position Popover near cursor
    popover.style.top = `${Math.min(y, window.innerHeight - 180)}px`;
    popover.style.left = `${Math.min(x, window.innerWidth - 220)}px`;

    document.body.appendChild(popover);

    // Event Handlers for Popover options
    document.getElementById('act-upload').addEventListener('click', () => {
      closePopoverMenu();
      openEvidenceModal(session);
    });

    document.getElementById('act-ai').addEventListener('click', () => {
      closePopoverMenu();
      generateAISummary(session);
    });

    const acreditarBtn = document.getElementById('act-acreditar');
    if (acreditarBtn) {
      acreditarBtn.addEventListener('click', () => {
        closePopoverMenu();
        acreditarSession(session);
      });
    }
  }

  function closePopoverMenu() {
    const existing = document.getElementById('active-popover');
    if (existing) existing.remove();
  }

  // Micro-Action 1: Acreditar Horas
  function acreditarSession(session) {
    session.status = 'validated';
    state.hoursAccredited += session.duration;
    showToast(`¡Sesión acreditada! +${session.duration} hrs añadidas al contador.`, '🎉');
    renderCalendar();
  }

  // Micro-Action 2: Subir Evidencia
  function openEvidenceModal(session) {
    const evidenceModal = document.createElement('div');
    evidenceModal.className = 'modal-overlay active';
    evidenceModal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Subir Evidencia - ${session.title}</h3>
          <button class="modal-close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.85rem; color: var(--text-muted);">
            Adjunta la minuta firmada, reporte o bitácora de la sesión para validación del mentor.
          </p>
          <div style="border: 2px dashed var(--border-accent); padding: 30px; border-radius: 12px; text-align: center; background-color: #FAFAFD; cursor: pointer;">
            <span style="font-size: 2rem; display: block; margin-bottom: 8px;">📁</span>
            <strong style="color: var(--primary-indigo); font-size: 0.9rem;">Arrastra tus archivos aquí o haz clic para examinar</strong>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">PDF, PNG, JPG o DOCX (Máx 15MB)</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="close-ev">Cancelar</button>
          <button class="btn-primary-action" id="upload-ev">Subir y Guardar Evidencia</button>
        </div>
      </div>
    `;

    document.body.appendChild(evidenceModal);

    const close = () => evidenceModal.remove();
    evidenceModal.querySelector('.modal-close-btn').onclick = close;
    evidenceModal.querySelector('#close-ev').onclick = close;
    evidenceModal.querySelector('#upload-ev').onclick = () => {
      showToast('Evidencia subida correctamente. Pendiente de validación.', '📄');
      close();
    };
  }

  // Micro-Action 3: Generar Resumen con IA
  function generateAISummary(session) {
    showToast('Generando síntesis con IA DualOrganizer...', '🤖');

    setTimeout(() => {
      const summaryModal = document.createElement('div');
      summaryModal.className = 'modal-overlay active';
      summaryModal.innerHTML = `
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">🤖 Resumen IA - ${session.title}</h3>
            <button class="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body" style="gap: 12px;">
            <div style="background-color: #F4F6FF; border-left: 4px solid var(--primary-indigo); padding: 12px; border-radius: 6px; font-size: 0.85rem;">
              <strong>Puntos Clave Identificados por la IA:</strong>
              <ul style="margin-left: 20px; margin-top: 8px; line-height: 1.5; color: var(--text-dark);">
                <li>Se revisaron los avances de la arquitectura del proyecto DualOrganizer.</li>
                <li>Se establecieron ${session.duration} horas de trabajo acreditables.</li>
                <li>Compromiso de entrega de evidencia firmado por <strong>${session.mentor}</strong>.</li>
              </ul>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-muted);">
              Este resumen fue generado automáticamente mediante análisis de contexto.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn-primary-action" id="close-ai">Aceptar y Guardar en Minuta</button>
          </div>
        </div>
      `;

      document.body.appendChild(summaryModal);
      const close = () => summaryModal.remove();
      summaryModal.querySelector('.modal-close-btn').onclick = close;
      summaryModal.querySelector('#close-ai').onclick = close;
    }, 600);
  }

  // Event Listeners for UI Controls
  toggleWeeklyBtn.addEventListener('click', () => setViewMode('weekly'));
  toggleMonthlyBtn.addEventListener('click', () => setViewMode('monthly'));

  expandSwitchBtn.addEventListener('click', () => {
    const nextView = state.currentView === 'weekly' ? 'monthly' : 'weekly';
    setViewMode(nextView);
  });

  prevDateBtn.addEventListener('click', () => {
    if (state.currentView === 'weekly') {
      state.currentDate.setDate(state.currentDate.getDate() - 7);
    } else {
      state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    }
    renderCalendar();
  });

  nextDateBtn.addEventListener('click', () => {
    if (state.currentView === 'weekly') {
      state.currentDate.setDate(state.currentDate.getDate() + 7);
    } else {
      state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    }
    renderCalendar();
  });

  todayBtn.addEventListener('click', () => {
    state.currentDate = new Date(2026, 8, 4);
    renderCalendar();
  });

  // Modal Agendar Sesión
  scheduleSessionBtn.addEventListener('click', () => {
    scheduleModal.classList.add('active');
  });

  function closeScheduleModal() {
    scheduleModal.classList.remove('active');
    scheduleForm.reset();
  }

  closeScheduleModalBtn.addEventListener('click', closeScheduleModal);
  cancelScheduleBtn.addEventListener('click', closeScheduleModal);

  scheduleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('field-title').value;
    const mentor = document.getElementById('field-mentor').value;
    const date = document.getElementById('field-date').value;
    const time = document.getElementById('field-time').value;
    const duration = parseFloat(document.getElementById('field-duration').value);

    const newSession = {
      id: `s_${Date.now()}`,
      title,
      mentor,
      duration,
      status: 'pending',
      date,
      time
    };

    state.sessions.push(newSession);
    showToast(`Sesión "${title}" agendada exitosamente.`, '📅');
    closeScheduleModal();
    renderCalendar();
  });

  // Global document click closes active popover
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#active-popover') && !e.target.closest('.more-options-btn')) {
      closePopoverMenu();
    }
  });

  // Initialize
  initUserProfile();
  renderCalendar();
});
