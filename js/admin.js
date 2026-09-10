// ==========================================================================
// DualOrganizer - Lógica del Panel de Administración y Gestor de Datos
// Stack: Vanilla JavaScript ES6+ (Cero frameworks ni dependencias externas)
// Arquitectura: State-driven rendering, delegación de eventos, Exportación CSV con BOM UTF-8
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Mock Data Robusto (Mentores y Sesiones)
  // --------------------------------------------------------------------------
  const MOCK_MEMBERS = [
    {
      id: 'TUT-2023-0891',
      name: 'Juan Pérez',
      role: 'Tutor Líder',
      semester: 'Sexto Semestre',
      email: 'juan.perez@institucion.edu',
      phone: '555-123-4567',
      status: 'Activo',
      totalHours: 54.0,
      targetHours: 80,
      subjects: ['Cálculo Diferencial', 'Álgebra', 'Física Mecánica'],
      initials: 'JP',
      bio: 'Enfoque estructurado en resolución analítica paso a paso para asignaturas de tronco común de ingeniería.'
    },
    {
      id: 'TUT-2023-0412',
      name: 'María Rodríguez',
      role: 'Tutora Académica',
      semester: 'Séptimo Semestre',
      email: 'maria.rodriguez@institucion.edu',
      phone: '555-987-6543',
      status: 'Activo',
      totalHours: 68.5,
      targetHours: 80,
      subjects: ['Química Orgánica', 'Bioquímica', 'Biología Celular'],
      initials: 'MR',
      bio: 'Especialista en tutorías de laboratorio y métodos experimentales para ciencias químicas y de la salud.'
    },
    {
      id: 'TUT-2022-0199',
      name: 'Carlos Morales',
      role: 'Tutor Académico',
      semester: 'Octavo Semestre',
      email: 'carlos.morales@institucion.edu',
      phone: '555-456-7890',
      status: 'Inactivo',
      totalHours: 80.0,
      targetHours: 80,
      subjects: ['Estructuras de Datos', 'Programación Web', 'Bases de Datos'],
      initials: 'CM',
      bio: 'Meta de horas cumplida al 100%. Mentor técnico en arquitectura de software y desarrollo frontend.'
    },
    {
      id: 'TUT-2023-0723',
      name: 'Sofía Valenzuela',
      role: 'Tutora Par',
      semester: 'Quinto Semestre',
      email: 'sofia.valenzuela@institucion.edu',
      phone: '555-321-0987',
      status: 'Activo',
      totalHours: 42.0,
      targetHours: 80,
      subjects: ['Estadística Inferencial', 'Probabilidad', 'Álgebra Lineal'],
      initials: 'SV',
      bio: 'Asesorías enfocadas en análisis de datos, modelos predictivos y preparación para exámenes departamentales.'
    },
    {
      id: 'TUT-2024-0054',
      name: 'Alejandro Cruz',
      role: 'Tutor Par',
      semester: 'Quinto Semestre',
      email: 'alejandro.cruz@institucion.edu',
      phone: '555-789-0123',
      status: 'Activo',
      totalHours: 28.5,
      targetHours: 80,
      subjects: ['Cálculo Vectorial', 'Física Electromagnetismo'],
      initials: 'AC',
      bio: 'Enfoque práctico en resolución de guías de estudio y desarrollo de intuición física y espacial.'
    },
    {
      id: 'TUT-2023-0638',
      name: 'Elena Gómez',
      role: 'Tutora Académica',
      semester: 'Séptimo Semestre',
      email: 'elena.gomez@institucion.edu',
      phone: '555-654-3210',
      status: 'Activo',
      totalHours: 51.0,
      targetHours: 80,
      subjects: ['Termodinámica', 'Mecánica de Fluidos'],
      initials: 'EG',
      bio: 'Ayudante de investigación orientada al modelado de fenómenos térmicos y asesoría técnica en ingeniería.'
    }
  ];

  const MOCK_RECORDS = [
    { id: 'REC-2026-001', matricula: 'TUT-2023-0891', tutorName: 'Juan Pérez', subject: 'Cálculo Diferencial', date: '2026-09-08', hours: 2.0, status: 'Aprobada' },
    { id: 'REC-2026-002', matricula: 'TUT-2023-0412', tutorName: 'María Rodríguez', subject: 'Química Orgánica', date: '2026-09-08', hours: 1.5, status: 'Aprobada' },
    { id: 'REC-2026-003', matricula: 'TUT-2023-0723', tutorName: 'Sofía Valenzuela', subject: 'Estadística Inferencial', date: '2026-09-07', hours: 2.0, status: 'Pendiente' },
    { id: 'REC-2026-004', matricula: 'TUT-2023-0891', tutorName: 'Juan Pérez', subject: 'Álgebra', date: '2026-09-06', hours: 1.0, status: 'Aprobada' },
    { id: 'REC-2026-005', matricula: 'TUT-2024-0054', tutorName: 'Alejandro Cruz', subject: 'Cálculo Vectorial', date: '2026-09-05', hours: 2.5, status: 'Aprobada' },
    { id: 'REC-2026-006', matricula: 'TUT-2023-0638', tutorName: 'Elena Gómez', subject: 'Termodinámica', date: '2026-09-04', hours: 3.0, status: 'Revisión' },
    { id: 'REC-2026-007', matricula: 'TUT-2023-0412', tutorName: 'María Rodríguez', subject: 'Bioquímica', date: '2026-09-03', hours: 2.0, status: 'Aprobada' },
    { id: 'REC-2026-008', matricula: 'TUT-2022-0199', tutorName: 'Carlos Morales', subject: 'Programación Web', date: '2026-09-02', hours: 2.0, status: 'Aprobada' },
    { id: 'REC-2026-009', matricula: 'TUT-2023-0891', tutorName: 'Juan Pérez', subject: 'Física Mecánica', date: '2026-09-01', hours: 1.5, status: 'Aprobada' },
    { id: 'REC-2026-010', matricula: 'TUT-2023-0723', tutorName: 'Sofía Valenzuela', subject: 'Probabilidad', date: '2026-08-30', hours: 1.0, status: 'Pendiente' },
    { id: 'REC-2026-011', matricula: 'TUT-2024-0054', tutorName: 'Alejandro Cruz', subject: 'Física Electromagnetismo', date: '2026-08-29', hours: 2.0, status: 'Revisión' },
    { id: 'REC-2026-012', matricula: 'TUT-2023-0638', tutorName: 'Elena Gómez', subject: 'Mecánica de Fluidos', date: '2026-08-28', hours: 2.5, status: 'Aprobada' }
  ];

  // --------------------------------------------------------------------------
  // 2. Estado Global de la Aplicación
  // --------------------------------------------------------------------------
  const state = {
    records: [...MOCK_RECORDS],
    members: [...MOCK_MEMBERS],
    filterMember: 'ALL',
    searchQuery: '',
    sortKey: 'date',
    sortDirection: 'desc',
    activeTab: 'members'
  };

  // --------------------------------------------------------------------------
  // 3. Referencias al DOM
  // --------------------------------------------------------------------------
  const elements = {
    // Pestañas
    tabsNav: document.querySelector('.admin-tabs'),
    panels: document.querySelectorAll('.admin-panel'),
    tabButtons: document.querySelectorAll('.admin-tab-btn'),
    // Métricas en Header
    kpiTotalMembers: document.getElementById('kpiTotalMembers'),
    kpiTotalHours: document.getElementById('kpiTotalHours'),
    kpiTotalSessions: document.getElementById('kpiTotalSessions'),
    // Directorio
    membersGrid: document.getElementById('membersGrid'),
    // Bitácora / Tabla
    recordSearchInput: document.getElementById('recordSearchInput'),
    memberFilterSelect: document.getElementById('memberFilterSelect'),
    btnExportCSV: document.getElementById('btnExportCSV'),
    recordsCounterText: document.getElementById('recordsCounterText'),
    recordsTable: document.getElementById('recordsTable'),
    recordsTableBody: document.getElementById('recordsTableBody'),
    sortHeaders: document.querySelectorAll('th.sortable'),
    // Modal Ficha de Mentor (<dialog>)
    memberModal: document.getElementById('memberModal'),
    dialogMemberAvatar: document.getElementById('dialogMemberAvatar'),
    dialogMemberInitials: document.getElementById('dialogMemberInitials'),
    dialogMemberRole: document.getElementById('dialogMemberRole'),
    dialogMemberStatus: document.getElementById('dialogMemberStatus'),
    dialogMemberName: document.getElementById('dialogMemberName'),
    dialogMemberId: document.getElementById('dialogMemberId'),
    dialogMemberHours: document.getElementById('dialogMemberHours'),
    dialogMemberTarget: document.getElementById('dialogMemberTarget'),
    dialogProgressTrack: document.getElementById('dialogProgressTrack'),
    dialogProgressBar: document.getElementById('dialogProgressBar'),
    dialogMemberSemester: document.getElementById('dialogMemberSemester'),
    dialogMemberEmail: document.getElementById('dialogMemberEmail'),
    dialogMemberPhone: document.getElementById('dialogMemberPhone'),
    dialogMemberSubjects: document.getElementById('dialogMemberSubjects'),
    dialogMemberBio: document.getElementById('dialogMemberBio'),
    dialogCloseBtn: document.getElementById('dialogCloseBtn'),
    dialogCloseFooterBtn: document.getElementById('dialogCloseFooterBtn'),
    // Toast
    toast: document.getElementById('adminToast'),
    toastMsg: document.getElementById('adminToastMsg')
  };

  let toastTimeout = null;

  // --------------------------------------------------------------------------
  // 4. Utilidades de Interfaz (Toast & Formato)
  // --------------------------------------------------------------------------
  const showToast = (message) => {
    if (!elements.toast) return;
    elements.toastMsg.textContent = message;
    elements.toast.classList.add('is-visible');
    elements.toast.setAttribute('aria-hidden', 'false');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove('is-visible');
      elements.toast.setAttribute('aria-hidden', 'true');
    }, 2800);
  };

  const getStatusBadgeClass = (status) => {
    switch (status.toLowerCase()) {
      case 'activo':
      case 'aprobada':
        return 'status-badge--active';
      case 'inactivo':
      case 'rechazada':
        return 'status-badge--inactive';
      case 'pendiente':
        return 'status-badge--pending';
      case 'revisión':
      case 'revision':
        return 'status-badge--review';
      default:
        return 'status-badge--inactive';
    }
  };

  const getInitials = (name = '') => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return 'TO';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // --------------------------------------------------------------------------
  // 5. Renderizado: Directorio de Mentores (Cards Grid)
  // --------------------------------------------------------------------------
  const renderMembers = () => {
    if (!elements.membersGrid) return;
    elements.membersGrid.innerHTML = '';

    state.members.forEach((member) => {
      const percentage = Math.min(100, Math.round((member.totalHours / member.targetHours) * 100));
      const card = document.createElement('article');
      card.className = 'member-card';
      card.setAttribute('role', 'listitem');

      // Mostrar chips (máximo 2 visibles + contador del resto)
      const visibleSubjects = member.subjects.slice(0, 2);
      const remainingCount = member.subjects.length - 2;

      let subjectsHtml = visibleSubjects
        .map(sub => `<span class="subject-chip">${sub}</span>`)
        .join('');

      if (remainingCount > 0) {
        subjectsHtml += `<span class="subject-chip subject-chip--more">+${remainingCount} más</span>`;
      }

      const initials = member.initials || getInitials(member.name);

      card.innerHTML = `
        <div>
          <header class="member-card__header">
            <div class="member-card__avatar" aria-hidden="true">
              <span class="avatar-initials">${initials}</span>
            </div>
            <div class="member-card__info">
              <h3 class="member-card__name" title="${member.name}">${member.name}</h3>
              <div class="member-card__meta">
                <span class="role-badge">${member.role}</span>
                <span class="status-badge ${getStatusBadgeClass(member.status)}">${member.status}</span>
              </div>
            </div>
          </header>

          <div class="member-card__progress">
            <div class="progress-header">
              <span class="progress-header__label">Horas acumuladas</span>
              <span class="progress-header__val">${member.totalHours.toFixed(1)} / ${member.targetHours}h (${percentage}%)</span>
            </div>
            <div class="progress-bar-track" role="progressbar" aria-valuenow="${member.totalHours}" aria-valuemin="0" aria-valuemax="${member.targetHours}">
              <div class="progress-bar-fill" style="width: ${percentage}%;"></div>
            </div>
          </div>

          <div class="member-card__subjects" aria-label="Materias impartidas">
            ${subjectsHtml}
          </div>
        </div>

        <button type="button" 
                class="btn btn--secondary btn--full" 
                data-action="view-member" 
                data-member-id="${member.id}">
          Ver Detalle
        </button>
      `;

      elements.membersGrid.appendChild(card);
    });

    // Actualizar KPI total de miembros
    if (elements.kpiTotalMembers) {
      elements.kpiTotalMembers.textContent = state.members.length;
    }
  };

  // --------------------------------------------------------------------------
  // 6. Poblar Selector de Filtro por Tutor
  // --------------------------------------------------------------------------
  const populateMemberFilter = () => {
    if (!elements.memberFilterSelect) return;
    
    // Guardar opción 'ALL'
    elements.memberFilterSelect.innerHTML = '<option value="ALL">Todos los tutores</option>';

    state.members.forEach((member) => {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = `${member.name} (${member.id})`;
      elements.memberFilterSelect.appendChild(option);
    });

    elements.memberFilterSelect.value = state.filterMember;
  };

  // --------------------------------------------------------------------------
  // 7. Filtrado, Ordenamiento y Renderizado: Gestor de Datos (Tabla)
  // --------------------------------------------------------------------------
  const getProcessedRecords = () => {
    let result = [...state.records];

    // Filtro por tutor
    if (state.filterMember !== 'ALL') {
      result = result.filter(rec => rec.matricula === state.filterMember);
    }

    // Búsqueda en tiempo real (insensible a mayúsculas y acentos normalizados)
    if (state.searchQuery.trim() !== '') {
      const query = state.searchQuery.toLowerCase().trim();
      result = result.filter(rec => {
        return (
          rec.matricula.toLowerCase().includes(query) ||
          rec.tutorName.toLowerCase().includes(query) ||
          rec.subject.toLowerCase().includes(query) ||
          rec.date.toLowerCase().includes(query) ||
          rec.status.toLowerCase().includes(query)
        );
      });
    }

    // Ordenamiento dinámico
    result.sort((a, b) => {
      let valA = a[state.sortKey];
      let valB = b[state.sortKey];

      if (typeof valA === 'string') {
        const comparison = valA.localeCompare(valB, 'es', { numeric: true });
        return state.sortDirection === 'asc' ? comparison : -comparison;
      }

      if (typeof valA === 'number') {
        return state.sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      return 0;
    });

    return result;
  };

  const updateSortIndicators = () => {
    elements.sortHeaders.forEach(th => {
      const key = th.getAttribute('data-sort');
      if (key === state.sortKey) {
        th.setAttribute('aria-sort', state.sortDirection === 'asc' ? 'ascending' : 'descending');
      } else {
        th.setAttribute('aria-sort', 'none');
      }
    });
  };

  const renderRecords = () => {
    if (!elements.recordsTableBody) return;
    const records = getProcessedRecords();
    elements.recordsTableBody.innerHTML = '';

    // Actualizar indicador de orden en las columnas
    updateSortIndicators();

    // Actualizar contador
    if (elements.recordsCounterText) {
      elements.recordsCounterText.textContent = `Mostrando ${records.length} de ${state.records.length} sesiones`;
    }

    // Actualizar KPIs de horas en Header
    if (elements.kpiTotalSessions) {
      elements.kpiTotalSessions.textContent = state.records.length;
    }
    if (elements.kpiTotalHours) {
      const totalHours = state.records.reduce((acc, curr) => acc + curr.hours, 0);
      elements.kpiTotalHours.textContent = totalHours.toFixed(1);
    }

    if (records.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="6" class="table-empty">
          No se encontraron sesiones registradas con los criterios seleccionados.
        </td>
      `;
      elements.recordsTableBody.appendChild(emptyRow);
      return;
    }

    records.forEach((rec) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="table-matricula">${rec.matricula}</td>
        <td><strong>${rec.tutorName}</strong></td>
        <td>${rec.subject}</td>
        <td><time datetime="${rec.date}">${rec.date}</time></td>
        <td class="text-right"><strong>${rec.hours.toFixed(1)}h</strong></td>
        <td>
          <span class="status-badge ${getStatusBadgeClass(rec.status)}">
            ${rec.status}
          </span>
        </td>
      `;
      elements.recordsTableBody.appendChild(row);
    });
  };

  // --------------------------------------------------------------------------
  // 8. Exportar a CSV con BOM UTF-8 (\uFEFF) para Excel
  // --------------------------------------------------------------------------
  const exportToCSV = () => {
    const recordsToExport = getProcessedRecords();

    if (recordsToExport.length === 0) {
      showToast('No hay registros disponibles para exportar con los filtros actuales');
      return;
    }

    // Encabezados estándar del CSV
    const headers = ['Matrícula', 'Tutor', 'Materia', 'Fecha', 'Horas', 'Estado'];

    // Escapar celdas para cumplir el estándar RFC 4180
    const formatCell = (val) => {
      if (val === null || val === undefined) return '""';
      const stringVal = String(val).replace(/"/g, '""');
      return `"${stringVal}"`;
    };

    const rows = recordsToExport.map(rec => [
      formatCell(rec.matricula),
      formatCell(rec.tutorName),
      formatCell(rec.subject),
      formatCell(rec.date),
      formatCell(rec.hours.toFixed(1)),
      formatCell(rec.status)
    ].join(','));

    // Incluir BOM UTF-8 (\uFEFF) para forzar a Excel a decodificar tildes y caracteres en español correctamente
    const csvContent = '\uFEFF' + [headers.map(formatCell).join(','), ...rows].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `dualorganizer_sesiones_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exportadas ${recordsToExport.length} sesiones a CSV con éxito`);
  };

  // --------------------------------------------------------------------------
  // 9. Modal Nativo (<dialog>): Ficha Detallada del Mentor
  // --------------------------------------------------------------------------
  const openMemberModal = (memberId) => {
    const member = state.members.find(m => m.id === memberId);
    if (!member || !elements.memberModal) return;

    if (elements.dialogMemberInitials) {
      elements.dialogMemberInitials.textContent = member.initials || getInitials(member.name);
    }
    elements.dialogMemberRole.textContent = member.role;
    elements.dialogMemberStatus.textContent = member.status;
    elements.dialogMemberStatus.className = `status-badge ${getStatusBadgeClass(member.status)}`;
    elements.dialogMemberName.textContent = member.name;
    elements.dialogMemberId.textContent = member.id;

    elements.dialogMemberHours.textContent = member.totalHours.toFixed(1);
    elements.dialogMemberTarget.textContent = member.targetHours;

    const percentage = Math.min(100, Math.round((member.totalHours / member.targetHours) * 100));
    elements.dialogProgressTrack.setAttribute('aria-valuenow', member.totalHours);
    elements.dialogProgressBar.style.width = `${percentage}%`;

    elements.dialogMemberSemester.textContent = member.semester;
    elements.dialogMemberEmail.textContent = member.email;
    elements.dialogMemberPhone.textContent = member.phone;

    // Render chips de materias en modal
    elements.dialogMemberSubjects.innerHTML = member.subjects
      .map(sub => `<span class="subject-chip" role="listitem">${sub}</span>`)
      .join('');

    elements.dialogMemberBio.textContent = member.bio;

    // Abrir modal nativo
    elements.memberModal.showModal();
  };

  const closeMemberModal = () => {
    if (elements.memberModal && elements.memberModal.open) {
      elements.memberModal.close();
    }
  };

  // --------------------------------------------------------------------------
  // 10. Delegación de Eventos y Manejadores
  // --------------------------------------------------------------------------
  
  // A) Cambio de Pestañas
  if (elements.tabsNav) {
    elements.tabsNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-tab-btn');
      if (!btn) return;

      const targetTab = btn.getAttribute('data-tab-target');
      state.activeTab = targetTab;

      // Botones
      elements.tabButtons.forEach(b => {
        const isActive = (b === btn);
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      // Paneles
      elements.panels.forEach(panel => {
        const isTarget = panel.id === `panel-${targetTab}`;
        panel.classList.toggle('is-active', isTarget);
      });
    });
  }

  // B) Clic en "Ver Detalle" de Tarjeta de Mentor (Delegación en membersGrid)
  if (elements.membersGrid) {
    elements.membersGrid.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action="view-member"]');
      if (!actionBtn) return;
      const memberId = actionBtn.getAttribute('data-member-id');
      if (memberId) {
        openMemberModal(memberId);
      }
    });
  }

  // C) Filtro por Tutor en Toolbar
  if (elements.memberFilterSelect) {
    elements.memberFilterSelect.addEventListener('change', (e) => {
      state.filterMember = e.target.value;
      renderRecords();
    });
  }

  // D) Búsqueda en Tiempo Real en Toolbar
  if (elements.recordSearchInput) {
    elements.recordSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderRecords();
    });
  }

  // E) Ordenamiento por Columnas de Tabla (Delegación en thead)
  if (elements.recordsTable) {
    const thead = elements.recordsTable.querySelector('thead');
    if (thead) {
      thead.addEventListener('click', (e) => {
        const th = e.target.closest('th.sortable');
        if (!th) return;

        const sortKey = th.getAttribute('data-sort');
        if (!sortKey) return;

        if (state.sortKey === sortKey) {
          // Alternar dirección
          state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = sortKey;
          // Por defecto fechas y horas inician desc, texto inicia asc
          state.sortDirection = (sortKey === 'date' || sortKey === 'hours') ? 'desc' : 'asc';
        }

        renderRecords();
      });
    }
  }

  // F) Exportación a CSV
  if (elements.btnExportCSV) {
    elements.btnExportCSV.addEventListener('click', exportToCSV);
  }

  // G) Control de Cierre del Modal Nativo
  if (elements.dialogCloseBtn) {
    elements.dialogCloseBtn.addEventListener('click', closeMemberModal);
  }
  if (elements.dialogCloseFooterBtn) {
    elements.dialogCloseFooterBtn.addEventListener('click', closeMemberModal);
  }

  // Cierre al hacer clic en el backdrop fuera de la superficie del diálogo
  if (elements.memberModal) {
    elements.memberModal.addEventListener('click', (e) => {
      const surface = elements.memberModal.querySelector('.admin-dialog__surface');
      if (surface && !surface.contains(e.target)) {
        closeMemberModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 11. Inicialización de la Aplicación
  // --------------------------------------------------------------------------
  const init = () => {
    renderMembers();
    populateMemberFilter();
    renderRecords();
  };

  init();
});
