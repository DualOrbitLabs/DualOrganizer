// ==========================================================================
// DualOrganizer - Lógica del Panel de Administración y Gestor de Datos
// Stack: Vanilla JavaScript ES6+ (Cero frameworks ni dependencias externas)
// Arquitectura: State-driven rendering, delegación de eventos, Exportación CSV con BOM UTF-8
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Guardia de Autorización en Cliente (RBAC)
  // --------------------------------------------------------------------------
  const enforceAdminAuthorization = () => {
    const sessionStr = sessionStorage.getItem('dualorganizer_session');
    if (!sessionStr) {
      window.location.replace('login.html');
      return null;
    }
    try {
      const session = JSON.parse(sessionStr);
      if (!session || typeof session !== 'object' || session.role !== 'ADMIN') {
        console.warn('[Seguridad] Intento de acceso sin privilegios de ADMIN:', session?.role);
        window.location.replace('dashboard.html');
        return null;
      }
      return session;
    } catch (e) {
      console.error('[Seguridad] Sesión corrupta detectada:', e);
      sessionStorage.removeItem('dualorganizer_session');
      window.location.replace('login.html');
      return null;
    }
  };

  const currentAdmin = enforceAdminAuthorization();
  if (!currentAdmin) return;

  // --------------------------------------------------------------------------
  // 2. Datos Institucionales por Defecto y Sincronización
  // --------------------------------------------------------------------------
  const INITIAL_MEMBERS = [
    {
      id: 'TUT-2023-0891',
      name: 'Juan Pérez',
      initials: 'JP',
      role: 'Tutor Académico',
      status: 'Activo',
      totalHours: 45.0,
      targetHours: 80,
      semester: 'Sexto Semestre',
      email: 'juan.perez@institucion.edu',
      phone: '555-123-4567',
      subjects: ['Cálculo Diferencial', 'Física Mecánica', 'Álgebra Lineal'],
      bio: 'Apoyo enfocado en bases matemáticas analíticas y resolución paso a paso.'
    },
    {
      id: 'TUT-2024-0102',
      name: 'Sofía Torres',
      initials: 'ST',
      role: 'Tutora Titular',
      status: 'Activo',
      totalHours: 62.5,
      targetHours: 80,
      semester: 'Octavo Semestre',
      email: 'sofia.torres@institucion.edu',
      phone: '555-987-6543',
      subjects: ['Química Orgánica', 'Bioquímica Clínica'],
      bio: 'Especialista en tutorías departamentales del área biomédica y farmacología.'
    },
    {
      id: 'TUT-2024-0345',
      name: 'Diego Ramírez',
      initials: 'DR',
      role: 'Tutor Par',
      status: 'Activo',
      totalHours: 28.0,
      targetHours: 80,
      semester: 'Quinto Semestre',
      email: 'diego.ramirez@institucion.edu',
      phone: '555-456-7890',
      subjects: ['Programación Web', 'Estructuras de Datos'],
      bio: 'Acompañamiento en algoritmos, estructuras de almacenamiento y buenas prácticas.'
    },
    {
      id: 'TUT-2023-0511',
      name: 'Mariana Castillo',
      initials: 'MC',
      role: 'Tutora Académica',
      status: 'Revisión',
      totalHours: 19.5,
      targetHours: 80,
      semester: 'Séptimo Semestre',
      email: 'mariana.castillo@institucion.edu',
      phone: '555-789-0123',
      subjects: ['Termodinámica', 'Mecánica de Fluidos'],
      bio: 'Tutorías en ciencias aplicadas de ingeniería química.'
    }
  ];

  const INITIAL_RECORDS = [
    {
      id: 'rec-01',
      matricula: 'TUT-2023-0891',
      tutorName: 'Juan Pérez',
      subject: 'Cálculo Diferencial',
      date: '2026-09-08',
      hours: 2.0,
      status: 'Aprobada'
    },
    {
      id: 'rec-02',
      matricula: 'TUT-2024-0102',
      tutorName: 'Sofía Torres',
      subject: 'Química Orgánica',
      date: '2026-09-08',
      hours: 1.5,
      status: 'Aprobada'
    },
    {
      id: 'rec-03',
      matricula: 'TUT-2024-0345',
      tutorName: 'Diego Ramírez',
      subject: 'Programación Web',
      date: '2026-09-07',
      hours: 2.0,
      status: 'Pendiente'
    },
    {
      id: 'rec-04',
      matricula: 'TUT-2023-0891',
      tutorName: 'Juan Pérez',
      subject: 'Física Mecánica',
      date: '2026-09-05',
      hours: 1.5,
      status: 'Aprobada'
    }
  ];

  const loadMergedRecords = () => {
    const list = [...INITIAL_RECORDS];
    try {
      const localSessionsRaw = localStorage.getItem('dualorganizer_sessions_v1');
      if (localSessionsRaw) {
        const localSessions = JSON.parse(localSessionsRaw);
        if (Array.isArray(localSessions)) {
          localSessions.forEach(s => {
            const exists = list.some(r => r.date === s.date && r.subject === s.subject);
            if (!exists) {
              list.unshift({
                id: s.id || `local-${Date.now()}`,
                matricula: 'TUT-2023-0891',
                tutorName: 'Juan Pérez',
                subject: s.subject || 'Tutoría General',
                date: s.date || new Date().toISOString().slice(0, 10),
                hours: parseFloat(s.hours) || 1.0,
                status: 'Pendiente'
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('Error sincronizando sesiones locales en admin:', err);
    }
    return list;
  };

  // --------------------------------------------------------------------------
  // 3. Estado Global de la Aplicación
  // --------------------------------------------------------------------------
  const state = {
    records: loadMergedRecords(),
    members: [...INITIAL_MEMBERS],
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
  // 5. Renderizado Seguro: Directorio de Mentores (Cards Grid)
  // --------------------------------------------------------------------------
  const renderMembers = () => {
    if (!elements.membersGrid) return;
    elements.membersGrid.innerHTML = '';

    const fragment = document.createDocumentFragment();

    state.members.forEach((member) => {
      const percentage = Math.min(100, Math.round((member.totalHours / member.targetHours) * 100));
      const card = document.createElement('article');
      card.className = 'member-card';
      card.setAttribute('role', 'listitem');

      const innerWrapper = document.createElement('div');

      // Header de tarjeta
      const cardHeader = document.createElement('header');
      cardHeader.className = 'member-card__header';

      const avatarDiv = document.createElement('div');
      avatarDiv.className = 'member-card__avatar';
      avatarDiv.setAttribute('aria-hidden', 'true');

      const avatarInitials = document.createElement('span');
      avatarInitials.className = 'avatar-initials';
      avatarInitials.textContent = member.initials || getInitials(member.name);
      avatarDiv.appendChild(avatarInitials);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'member-card__info';

      const h3Name = document.createElement('h3');
      h3Name.className = 'member-card__name';
      h3Name.title = member.name;
      h3Name.textContent = member.name;

      const metaDiv = document.createElement('div');
      metaDiv.className = 'member-card__meta';

      const roleBadge = document.createElement('span');
      roleBadge.className = 'role-badge';
      roleBadge.textContent = member.role;

      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${getStatusBadgeClass(member.status)}`;
      statusBadge.textContent = member.status;

      metaDiv.append(roleBadge, statusBadge);
      infoDiv.append(h3Name, metaDiv);
      cardHeader.append(avatarDiv, infoDiv);

      // Progreso
      const progressDiv = document.createElement('div');
      progressDiv.className = 'member-card__progress';

      const progressHeader = document.createElement('div');
      progressHeader.className = 'progress-header';

      const progressLabel = document.createElement('span');
      progressLabel.className = 'progress-header__label';
      progressLabel.textContent = 'Horas acumuladas';

      const progressVal = document.createElement('span');
      progressVal.className = 'progress-header__val tabular-nums';
      progressVal.textContent = `${Number(member.totalHours).toFixed(1)} / ${member.targetHours}h (${percentage}%)`;

      progressHeader.append(progressLabel, progressVal);

      const progressTrack = document.createElement('div');
      progressTrack.className = 'progress-bar-track';
      progressTrack.setAttribute('role', 'progressbar');
      progressTrack.setAttribute('aria-valuenow', String(member.totalHours));
      progressTrack.setAttribute('aria-valuemin', '0');
      progressTrack.setAttribute('aria-valuemax', String(member.targetHours));

      const progressFill = document.createElement('div');
      progressFill.className = 'progress-bar-fill';
      progressFill.style.width = `${percentage}%`;
      progressTrack.appendChild(progressFill);

      progressDiv.append(progressHeader, progressTrack);

      // Chips de materias
      const subjectsDiv = document.createElement('div');
      subjectsDiv.className = 'member-card__subjects';
      subjectsDiv.setAttribute('aria-label', 'Materias impartidas');

      const visibleSubjects = member.subjects.slice(0, 2);
      const remainingCount = member.subjects.length - 2;

      visibleSubjects.forEach(sub => {
        const chip = document.createElement('span');
        chip.className = 'subject-chip';
        chip.textContent = sub;
        subjectsDiv.appendChild(chip);
      });

      if (remainingCount > 0) {
        const moreChip = document.createElement('span');
        moreChip.className = 'subject-chip subject-chip--more';
        moreChip.textContent = `+${remainingCount} más`;
        subjectsDiv.appendChild(moreChip);
      }

      innerWrapper.append(cardHeader, progressDiv, subjectsDiv);

      // Botón ver detalle
      const btnView = document.createElement('button');
      btnView.type = 'button';
      btnView.className = 'btn btn--secondary btn--full';
      btnView.setAttribute('data-action', 'view-member');
      btnView.setAttribute('data-member-id', member.id);
      btnView.textContent = 'Ver Detalle';

      card.append(innerWrapper, btnView);
      fragment.appendChild(card);
    });

    elements.membersGrid.appendChild(fragment);

    if (elements.kpiTotalMembers) {
      elements.kpiTotalMembers.textContent = state.members.length;
    }
  };

  // --------------------------------------------------------------------------
  // 6. Poblar Selector de Filtro por Tutor
  // --------------------------------------------------------------------------
  const populateMemberFilter = () => {
    if (!elements.memberFilterSelect) return;

    elements.memberFilterSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'ALL';
    allOption.textContent = 'Todos los tutores';
    elements.memberFilterSelect.appendChild(allOption);

    state.members.forEach((member) => {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = `${member.name} (${member.id})`;
      elements.memberFilterSelect.appendChild(option);
    });

    elements.memberFilterSelect.value = state.filterMember;
  };

  // --------------------------------------------------------------------------
  // 7. Filtrado, Ordenamiento y Renderizado Seguro: Bitácora de Sesiones (Tabla)
  // --------------------------------------------------------------------------
  const getProcessedRecords = () => {
    let result = [...state.records];

    if (state.filterMember !== 'ALL') {
      result = result.filter(rec => rec.matricula === state.filterMember);
    }

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

    updateSortIndicators();

    if (elements.recordsCounterText) {
      elements.recordsCounterText.textContent = `Mostrando ${records.length} de ${state.records.length} sesiones`;
    }

    if (elements.kpiTotalSessions) {
      elements.kpiTotalSessions.textContent = state.records.length;
    }
    if (elements.kpiTotalHours) {
      const totalHours = state.records.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
      elements.kpiTotalHours.textContent = totalHours.toFixed(1);
    }

    if (records.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyTd = document.createElement('td');
      emptyTd.colSpan = 6;
      emptyTd.className = 'table-empty';
      emptyTd.textContent = 'No se encontraron sesiones registradas con los criterios seleccionados.';
      emptyRow.appendChild(emptyTd);
      elements.recordsTableBody.appendChild(emptyRow);
      return;
    }

    const fragment = document.createDocumentFragment();

    records.forEach((rec) => {
      const row = document.createElement('tr');

      const tdMatricula = document.createElement('td');
      tdMatricula.className = 'table-matricula tabular-nums';
      tdMatricula.textContent = rec.matricula;

      const tdTutor = document.createElement('td');
      const strongTutor = document.createElement('strong');
      strongTutor.textContent = rec.tutorName;
      tdTutor.appendChild(strongTutor);

      const tdSubject = document.createElement('td');
      tdSubject.textContent = rec.subject;

      const tdDate = document.createElement('td');
      const timeEl = document.createElement('time');
      timeEl.setAttribute('datetime', rec.date);
      timeEl.className = 'tabular-nums';
      timeEl.textContent = rec.date;
      tdDate.appendChild(timeEl);

      const tdHours = document.createElement('td');
      tdHours.className = 'text-right tabular-nums';
      const strongHours = document.createElement('strong');
      strongHours.textContent = `${Number(rec.hours).toFixed(1)}h`;
      tdHours.appendChild(strongHours);

      const tdStatus = document.createElement('td');
      const statusSpan = document.createElement('span');
      statusSpan.className = `status-badge ${getStatusBadgeClass(rec.status)}`;
      statusSpan.textContent = rec.status;
      tdStatus.appendChild(statusSpan);

      row.append(tdMatricula, tdTutor, tdSubject, tdDate, tdHours, tdStatus);
      fragment.appendChild(row);
    });

    elements.recordsTableBody.appendChild(fragment);
  };

  // --------------------------------------------------------------------------
  // 8. Exportar a CSV Seguro (Con BOM UTF-8 y Mitigación de Formula Injection)
  // --------------------------------------------------------------------------
  const sanitizeCSVCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val).trim();

    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }

    return `"${str.replace(/"/g, '""')}"`;
  };

  const exportToCSV = () => {
    const recordsToExport = getProcessedRecords();

    if (recordsToExport.length === 0) {
      showToast('No hay registros disponibles para exportar con los filtros actuales');
      return;
    }

    const headers = ['Matrícula', 'Tutor', 'Materia', 'Fecha', 'Horas', 'Estado'];
    const headerRow = headers.map(sanitizeCSVCell).join(',');

    const rows = recordsToExport.map(rec => [
      sanitizeCSVCell(rec.matricula),
      sanitizeCSVCell(rec.tutorName),
      sanitizeCSVCell(rec.subject),
      sanitizeCSVCell(rec.date),
      sanitizeCSVCell(Number(rec.hours).toFixed(1)),
      sanitizeCSVCell(rec.status)
    ].join(','));

    const csvContent = '\uFEFF' + [headerRow, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = window.URL.createObjectURL(blob);

    const downloadLink = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadLink.href = objectUrl;
    downloadLink.setAttribute('download', `dualorganizer_sesiones_${timestamp}.csv`);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);

    downloadLink.click();

    setTimeout(() => {
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(objectUrl);
    }, 1500);

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

    elements.dialogMemberHours.textContent = Number(member.totalHours).toFixed(1);
    elements.dialogMemberTarget.textContent = member.targetHours;

    const percentage = Math.min(100, Math.round((member.totalHours / member.targetHours) * 100));
    elements.dialogProgressTrack.setAttribute('aria-valuenow', String(member.totalHours));
    elements.dialogProgressBar.style.width = `${percentage}%`;

    elements.dialogMemberSemester.textContent = member.semester;
    elements.dialogMemberEmail.textContent = member.email;
    elements.dialogMemberPhone.textContent = member.phone;

    // Render seguro de chips de materias
    elements.dialogMemberSubjects.innerHTML = '';
    member.subjects.forEach(sub => {
      const chip = document.createElement('span');
      chip.className = 'subject-chip';
      chip.setAttribute('role', 'listitem');
      chip.textContent = sub;
      elements.dialogMemberSubjects.appendChild(chip);
    });

    elements.dialogMemberBio.textContent = member.bio;

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
