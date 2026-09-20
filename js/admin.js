import { getAuthenticatedUser, getCurrentProfile, supabase, signOut } from './supabaseClient.js';
import { APP_CONFIG, isDateInCurrentMonth } from './config.js';
import { serializeChapterCSV, downloadCSV, parseCSV, validateImportedSessions } from './csvUtils.js';
import { initLogicalTimer } from './logicalTimer.js';

// ==========================================================================
// DualOrganizer - Lógica del Panel de Administración y Gestor de Datos
// Stack: Vanilla JavaScript ES6+ (Cero frameworks ni dependencias externas)
// Arquitectura: State-driven rendering, delegación de eventos, Exportación CSV con BOM UTF-8
// ==========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Guardia de Autorización en Cliente (RBAC)
  // --------------------------------------------------------------------------
  const enforceAdminAuthorization = async () => {
    const user = await getAuthenticatedUser();
    if (!user) {
      window.location.replace('login.html');
      return null;
    }
    const profile = await getCurrentProfile(user.id);
    if (!profile || profile.role !== 'ADMIN') {
      console.warn('[Seguridad] Intento de acceso sin privilegios de ADMIN');
      window.location.replace('dashboard.html');
      return null;
    }
    return { ...profile, authUser: user };
  };

  const currentAdmin = await enforceAdminAuthorization();
  if (!currentAdmin) return;

  let activeChapterId = new URLSearchParams(window.location.search).get('chapter');
  let calendarSessions = [];

  const getRemoteData = async () => {
    let chapterId = new URLSearchParams(window.location.search).get('chapter');
    if (!chapterId) {
      const { data: membership, error } = await supabase
        .from('chapter_members')
        .select('chapter_id')
        .eq('user_id', currentAdmin.id)
        .eq('is_primary', true)
        .maybeSingle();
      if (error) throw error;
      chapterId = membership?.chapter_id;
    }

    if (!chapterId) return { members: [], records: [], chapterId: null };

    const { data: memberships, error: membershipError } = await supabase
      .from('chapter_members')
      .select('user_id, role')
      .eq('chapter_id', chapterId);
    if (membershipError) throw membershipError;

    const userIds = memberships.map(member => member.user_id);
    const profileQuery = supabase
      .from('profiles')
      .select('*')
      .in('id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']);
    const sessionsQuery = supabase
      .from('tutoring_sessions')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('session_date', { ascending: false });
    const [{ data: profiles, error: profileError }, { data: sessions, error: sessionError }] = await Promise.all([
      profileQuery,
      sessionsQuery
    ]);
    if (profileError) throw profileError;
    if (sessionError) throw sessionError;

    const profileById = new Map(profiles.map(profile => [profile.id, profile]));
    const members = memberships.map((membership) => {
      const profile = profileById.get(membership.user_id) || {};
      return {
        id: profile.institutional_id || profile.id,
        userId: profile.id,
        name: profile.full_name || 'Sin nombre',
        initials: getInitials(profile.full_name || ''),
        role: membership.role === 'ADMIN' ? 'Coordinador / Admin' : 'Tutor Académico',
        status: 'Activo',
        totalHours: 0,
        targetHours: APP_CONFIG.academic.monthlyTargetHours,
        semester: profile.semester || 'Sin especificar',
        email: profile.id === currentAdmin.id ? currentAdmin.authUser.email : '',
        phone: profile.phone || 'No registrado',
        subjects: profile.subjects || [],
        bio: profile.description || 'Sin descripción.'
      };
    });

    const memberByUserId = new Map(members.map(member => [member.userId, member]));
    calendarSessions = sessions;
    const records = sessions.map(session => {
      const member = memberByUserId.get(session.tutor_id);
      if (member && isDateInCurrentMonth(session.session_date)) {
        member.totalHours += Number(session.hours) || 0;
      }
      return {
        id: session.id,
        matricula: member?.id || session.tutor_id,
        tutorName: member?.name || 'Tutor sin perfil',
        subject: session.subject,
        date: session.session_date,
        hours: Number(session.hours),
        status: session.status === 'APPROVED' ? 'Aprobada' : session.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'
        , tutorId: session.tutor_id,
        startTime: String(session.start_time).slice(0, 5),
        studentName: session.student_name
      };
    });

    activeChapterId = chapterId;
    return { members, records, chapterId };
  };

  const loadAdminChapterOptions = async () => {
    if (!elements?.chapterSelect) return;
    const { data, error } = await supabase
      .from('chapter_members')
      .select('chapter_id, role, chapters(id, code, name)')
      .eq('user_id', currentAdmin.id)
      .eq('role', 'ADMIN');
    if (error) throw error;

    elements.chapterSelect.innerHTML = '';
    data.forEach((membership) => {
      if (!membership.chapters) return;
      const option = document.createElement('option');
      option.value = membership.chapters.id;
      option.textContent = `${membership.chapters.code} · ${membership.chapters.name}`;
      option.selected = membership.chapters.id === activeChapterId;
      elements.chapterSelect.appendChild(option);
    });

    if (!activeChapterId && elements.chapterSelect.options.length > 0) {
      activeChapterId = elements.chapterSelect.options[0].value;
      elements.chapterSelect.options[0].selected = true;
      const url = new URL(window.location.href);
      url.searchParams.set('chapter', activeChapterId)
      window.history.pushState({}, '', url);
    }
  };

  /*
   * El resto del módulo consume state.members y state.records, por lo que
   * la interfaz conserva sus filtros y exportación sin duplicar consultas.
   */
  const state = {
    records: [],
    members: [],
    filterMember: 'ALL',
    searchQuery: '',
    sortKey: 'date',
    sortDirection: 'desc',
    activeTab: 'members'
  };

  /*
   * El código de renderizado empieza aquí; las declaraciones demo anteriores
   * fueron eliminadas para que SQL sea la única fuente de datos.
   */

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
    btnImportCSV: document.getElementById('btnImportCSV'),
    csvImportModal: document.getElementById('csvImportModal'),
    csvImportClose: document.getElementById('csvImportClose'),
    csvImportCancel: document.getElementById('csvImportCancel'),
    csvFileInputDialog: document.getElementById('csvFileInputDialog'),
    csvImportFeedback: document.getElementById('csvImportFeedback'),
    csvImportSummary: document.getElementById('csvImportSummary'),
    csvImportErrors: document.getElementById('csvImportErrors'),
    csvImportConfirm: document.getElementById('csvImportConfirm'),
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
    dialogViewCalendarBtn: document.getElementById('dialogViewCalendarBtn'),
    // Toast
    toast: document.getElementById('adminToast'),
    toastMsg: document.getElementById('adminToastMsg'),
    refreshButton: document.getElementById('btnRefreshAdmin')
    , chapterSelect: document.getElementById('adminChapterSelect')
    , sessionManagerModal: document.getElementById('sessionManagerModal')
    , sessionManagerForm: document.getElementById('sessionManagerForm')
    , managerOperation: document.getElementById('managerOperation')
    , managerTutor: document.getElementById('managerTutor')
    , managerSession: document.getElementById('managerSession')
    , managerTargetTutor: document.getElementById('managerTargetTutor')
    , managerTargetSession: document.getElementById('managerTargetSession')
    , managerTargetGroup: document.getElementById('managerTargetGroup')
    , managerTargetSessionGroup: document.getElementById('managerTargetSessionGroup')
    , managerSessionGroup: document.getElementById('managerSessionGroup')
    , managerNewSessionFields: document.getElementById('managerNewSessionFields')
    , managerDate: document.getElementById('managerDate')
    , managerTime: document.getElementById('managerTime')
    , managerStudent: document.getElementById('managerStudent')
    , managerSubject: document.getElementById('managerSubject')
    , managerHours: document.getElementById('managerHours')
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
    switch (String(status || '').toLowerCase()) {
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

  const formatSessionLabel = (session) =>
    `${session.session_date} ${String(session.start_time).slice(0, 5)} · ${session.subject} · ${session.hours}h`;

  const refreshManagerSessions = () => {
    const tutorId = elements.managerTutor?.value;
    const sessions = calendarSessions.filter(session => session.tutor_id === tutorId);
    if (elements.managerSession) {
      elements.managerSession.innerHTML = '';
      sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = formatSessionLabel(session);
        elements.managerSession.appendChild(option);
      });
      if (!sessions.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Sin sesiones';
        elements.managerSession.appendChild(option);
      }
    }
    refreshManagerTargetSessions();
  };

  const refreshManagerTargetSessions = () => {
    const targetId = elements.managerTargetTutor?.value;
    const sessions = calendarSessions.filter(session => session.tutor_id === targetId);
    if (elements.managerTargetSession) {
      elements.managerTargetSession.innerHTML = '';
      sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = formatSessionLabel(session);
        elements.managerTargetSession.appendChild(option);
      });
      if (!sessions.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Sin sesiones';
        elements.managerTargetSession.appendChild(option);
      }
    }
  };

  const refreshManagerVisibility = () => {
    const operation = elements.managerOperation?.value;
    const needsSession = operation !== 'add' && operation !== 'clear';
    const needsTarget = operation === 'swap' || operation === 'send';
    const needsTargetSession = operation === 'swap';
    const needsDetails = operation === 'add' || operation === 'edit';
    const copy = {
      add: {
        title: 'Agregar sesión',
        hint: 'Crea una sesión nueva en el calendario del tutor seleccionado.',
        submit: 'Agregar sesión'
      },
      edit: {
        title: 'Editar sesión',
        hint: 'Selecciona una sesión y ajusta sus datos o su horario.',
        submit: 'Guardar cambios'
      },
      delete: {
        title: 'Eliminar sesión',
        hint: 'La sesión se eliminará del calendario de forma permanente.',
        submit: 'Eliminar sesión'
      },
      clear: {
        title: 'Limpiar calendario del tutor',
        hint: 'Borra todas las sesiones del tutor seleccionado dentro del capítulo activo.',
        submit: 'Limpiar calendario'
      },
      swap: {
        title: 'Intercambiar horario',
        hint: 'Selecciona otra sesión para intercambiar sus tutores y horarios.',
        submit: 'Intercambiar'
      },
      send: {
        title: 'Enviar sesión',
        hint: 'La sesión se moverá al horario libre más cercano del tutor destino.',
        submit: 'Enviar sesión'
      }
    }[operation] || {};

    if (elements.managerSessionGroup) elements.managerSessionGroup.hidden = !needsSession;
    if (elements.managerTargetGroup) elements.managerTargetGroup.hidden = !needsTarget;
    if (elements.managerTargetSessionGroup) elements.managerTargetSessionGroup.hidden = !needsTargetSession;
    if (elements.managerNewSessionFields) {
      elements.managerNewSessionFields.hidden = !needsDetails;
    }

    const detailFields = [
      elements.managerDate,
      elements.managerTime,
      elements.managerStudent,
      elements.managerSubject,
      elements.managerHours
    ];
    detailFields.forEach(field => {
      if (field) field.disabled = !needsDetails;
    });
    [elements.managerSession, elements.managerTargetTutor, elements.managerTargetSession].forEach(field => {
      if (field) field.disabled = field === elements.managerSession ? !needsSession : !needsTarget && field !== elements.managerTargetSession;
    });
    if (elements.managerTargetSession) elements.managerTargetSession.disabled = !needsTargetSession;

    const title = document.getElementById('sessionManagerTitle');
    const hint = document.getElementById('sessionManagerHint');
    const submit = document.getElementById('sessionManagerSubmit');
    if (title && copy.title) title.textContent = copy.title;
    if (hint && copy.hint) hint.textContent = copy.hint;
    if (submit && copy.submit) submit.textContent = copy.submit;
    if (submit) submit.classList.toggle('btn--danger', operation === 'delete' || operation === 'clear');
  };

  const loadSelectedSessionIntoForm = () => {
    const session = calendarSessions.find(item => item.id === elements.managerSession?.value);
    if (!session) return;
    elements.managerDate.value = session.session_date;
    elements.managerTime.value = String(session.start_time).slice(0, 5);
    elements.managerStudent.value = session.student_name;
    elements.managerSubject.value = session.subject;
    elements.managerHours.value = session.hours;
  };

  const openSessionManager = (tutorId = '', sessionId = '') => {
    if (!elements.sessionManagerModal) return;
    [elements.managerTutor, elements.managerTargetTutor].forEach((select) => {
      select.innerHTML = '';
      state.members.forEach(member => {
        const option = document.createElement('option');
        option.value = member.userId;
        option.textContent = member.name;
        select.appendChild(option);
      });
    });
    if (tutorId) elements.managerTutor.value = tutorId;
    if (sessionId) {
      const session = calendarSessions.find(item => item.id === sessionId);
      if (session) {
        elements.managerTutor.value = session.tutor_id;
        elements.managerOperation.value = 'delete';
      }
    }
    refreshManagerSessions();
    if (sessionId) elements.managerSession.value = sessionId;
    if (sessionId) {
      elements.managerOperation.value = 'edit';
      loadSelectedSessionIntoForm();
    }
    refreshManagerVisibility();
    elements.sessionManagerModal.showModal();
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

      const actions = document.createElement('div');
      actions.className = 'member-card__actions';
      actions.appendChild(btnView);
      const btnManage = document.createElement('button');
      btnManage.type = 'button';
      btnManage.className = 'btn btn--outline-action btn--full';
      btnManage.setAttribute('data-action', 'manage-tutor');
      btnManage.setAttribute('data-member-id', member.userId);
      btnManage.textContent = 'Gestionar calendario';
      actions.appendChild(btnManage);

      card.append(innerWrapper, actions);
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
      const totalHours = state.records
        .filter(record => isDateInCurrentMonth(record.date))
        .reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
      elements.kpiTotalHours.textContent = totalHours.toFixed(1);
    }

    if (records.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyTd = document.createElement('td');
      emptyTd.colSpan = 7;
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

      const tdActions = document.createElement('td');
      const manageButton = document.createElement('button');
      manageButton.type = 'button';
      manageButton.className = 'btn btn--secondary';
      manageButton.setAttribute('data-action', 'manage-session');
      manageButton.setAttribute('data-session-id', rec.id);
      manageButton.textContent = 'Gestionar';
      tdActions.appendChild(manageButton);

      row.append(tdMatricula, tdTutor, tdSubject, tdDate, tdHours, tdStatus, tdActions);
      fragment.appendChild(row);
    });

    elements.recordsTableBody.appendChild(fragment);
  };

  // --------------------------------------------------------------------------
  // 8. Módulo de Exportación e Importación CSV Seguro
  // --------------------------------------------------------------------------
  const exportToCSV = () => {
    const recordsToExport = getProcessedRecords();

    if (!recordsToExport || recordsToExport.length === 0) {
      showToast('No hay registros disponibles para exportar con los filtros actuales');
      return;
    }

    const csvContent = serializeChapterCSV(recordsToExport);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`dualorganizer_sesiones_${timestamp}.csv`, csvContent);

    showToast(`Exportadas ${recordsToExport.length} sesiones a CSV con éxito`);
  };

  let pendingImportSessions = [];
  let isImporting = false;

  const openCSVImportModal = () => {
    if (isImporting) return;
    pendingImportSessions = [];
    if (elements.csvFileInputDialog) elements.csvFileInputDialog.value = '';
    if (elements.csvImportFeedback) elements.csvImportFeedback.style.display = 'none';
    if (elements.csvImportSummary) elements.csvImportSummary.textContent = '';
    if (elements.csvImportErrors) elements.csvImportErrors.innerHTML = '';
    if (elements.csvImportConfirm) {
      elements.csvImportConfirm.disabled = true;
      elements.csvImportConfirm.textContent = 'Importar 0 Sesiones';
    }
    elements.csvImportModal?.showModal();
  };

  const closeCSVImportModal = () => {
    if (isImporting) return;
    elements.csvImportModal?.close();
  };

  const handleCSVFileSelection = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parseResult = parseCSV(text);

      if (elements.csvImportFeedback) elements.csvImportFeedback.style.display = 'block';
      if (elements.csvImportErrors) elements.csvImportErrors.innerHTML = '';

      if (parseResult.errors && parseResult.errors.length > 0 && parseResult.rows.length === 0) {
        if (elements.csvImportSummary) {
          elements.csvImportSummary.textContent = 'Error al procesar el archivo CSV:';
        }
        parseResult.errors.forEach(err => {
          const li = document.createElement('li');
          li.textContent = err;
          elements.csvImportErrors.appendChild(li);
        });
        if (elements.csvImportConfirm) {
          elements.csvImportConfirm.disabled = true;
          elements.csvImportConfirm.textContent = 'Importar 0 Sesiones';
        }
        return;
      }

      const validation = validateImportedSessions(parseResult.rows, {
        chapterId: activeChapterId,
        members: state.members
      });

      pendingImportSessions = validation.validSessions;

      const combinedErrors = [...(parseResult.errors || []), ...validation.errors];

      if (elements.csvImportSummary) {
        elements.csvImportSummary.textContent = `${validation.validSessions.length} sesión(es) válida(s) lista(s) para importar. ${combinedErrors.length} advertencia(s)/error(es).`;
      }

      if (combinedErrors.length > 0) {
        combinedErrors.forEach(err => {
          const li = document.createElement('li');
          li.textContent = err;
          elements.csvImportErrors.appendChild(li);
        });
      }

      if (elements.csvImportConfirm) {
        elements.csvImportConfirm.disabled = validation.validSessions.length === 0;
        elements.csvImportConfirm.textContent = `Importar ${validation.validSessions.length} Sesiones`;
      }
    } catch (err) {
      console.error('Error al leer el archivo CSV:', err);
      showToast('Error al leer el archivo CSV: ' + err.message);
    }
  };

  const confirmCSVImport = async () => {
    if (isImporting) return;
    if (!pendingImportSessions || pendingImportSessions.length === 0) {
      showToast('No hay sesiones válidas para importar');
      return;
    }

    try {
      isImporting = true;
      if (elements.csvImportConfirm) {
        elements.csvImportConfirm.disabled = true;
        elements.csvImportConfirm.textContent = 'Importando...';
      }
      if (elements.csvImportCancel) {
        elements.csvImportCancel.disabled = true;
      }
      if (elements.csvImportClose) {
        elements.csvImportClose.disabled = true;
      }

      const { error } = await supabase
        .from('tutoring_sessions')
        .insert(pendingImportSessions);

      if (error) throw error;

      showToast(`Se importaron ${pendingImportSessions.length} sesiones correctamente.`);
      isImporting = false;
      closeCSVImportModal();
      await reloadRemoteData();
    } catch (err) {
      console.error('Error insertando sesiones importadas:', err);
      showToast('Error al guardar las sesiones: ' + (err.message || err));
      if (elements.csvImportConfirm) {
        elements.csvImportConfirm.disabled = false;
        elements.csvImportConfirm.textContent = `Reintentar (${pendingImportSessions.length})`;
      }
    } finally {
      isImporting = false;
      if (elements.csvImportCancel) {
        elements.csvImportCancel.disabled = false;
      }
      if (elements.csvImportClose) {
        elements.csvImportClose.disabled = false;
      }
    }
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

    if (elements.dialogViewCalendarBtn) {
      elements.dialogViewCalendarBtn.href = `dashboard.html?tutor=${encodeURIComponent(member.userId)}&chapter=${encodeURIComponent(activeChapterId)}`;
    }
    
    addEventListener("click", )
    elements.memberModal.showModal();
  };

  const closeMemberModal = () => {
    if (elements.memberModal && elements.memberModal.open) {
      elements.memberModal.close();
    }
  };

  const minutesFromTime = (value) => {
    const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const timeFromMinutes = (value) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

  const overlaps = (candidate, existing) => {
    const candidateStart = minutesFromTime(candidate.start_time);
    const candidateEnd = candidateStart + Math.round(Number(candidate.hours) * 60);
    return existing.some((session) => {
      if (session.id === candidate.id) return false;
      if (session.tutor_id !== candidate.tutor_id || session.session_date !== candidate.session_date) return false;
      const start = minutesFromTime(session.start_time);
      const end = start + Math.round(Number(session.hours) * 60);
      return candidateStart < end && candidateEnd > start;
    });
  };

  const findNearestFreeTime = (session, targetTutorId) => {
    const sourceMinutes = minutesFromTime(session.start_time);
    const candidates = [];
    for (let offset = 0; offset <= 600; offset += 30) {
      if (offset === 0) candidates.push(sourceMinutes);
      else candidates.push(sourceMinutes + offset, sourceMinutes - offset);
    }
    return candidates
      .filter(value => value >= 8 * 60 && value <= 18 * 60)
      .find(value => !overlaps({
        ...session,
        tutor_id: targetTutorId,
        start_time: timeFromMinutes(value)
      }, calendarSessions));
  };

  const reloadRemoteData = async () => {
    const remoteData = await getRemoteData();
    state.members = remoteData.members;
    state.records = remoteData.records;
    renderMembers();
    populateMemberFilter();
    renderRecords();
  };

  const refreshAdmin = async () => {
    elements.refreshButton?.classList.add('is-loading');
    if (elements.refreshButton) elements.refreshButton.disabled = true;
    try {
      await reloadRemoteData();
      await loadAdminChapterOptions();
      showToast('Datos actualizados.');
    } catch (error) {
      console.error('Error al actualizar administración:', error);
      showToast('No se pudieron actualizar los datos.');
    } finally {
      elements.refreshButton?.classList.remove('is-loading');
      if (elements.refreshButton) elements.refreshButton.disabled = false;
    }
  };

  const applySessionOperation = async () => {
    const operation = elements.managerOperation.value;
    const tutorId = elements.managerTutor.value;
    const selectedId = elements.managerSession.value;
    const selected = calendarSessions.find(session => session.id === selectedId);

    if (operation !== 'add' && !selected) throw new Error('Selecciona una sesión.');

    if (operation === 'edit') {
      const payload = {
        tutor_id: tutorId,
        student_name: elements.managerStudent.value.trim(),
        subject: elements.managerSubject.value.trim(),
        session_date: elements.managerDate.value,
        start_time: elements.managerTime.value,
        hours: Number(elements.managerHours.value)
      };
      if (!payload.student_name || !payload.subject || !payload.session_date || !payload.start_time) {
        throw new Error('Completa los datos de la sesión.');
      }
      if (overlaps({ ...payload, id: selected.id }, calendarSessions)) {
        throw new Error('El tutor ya tiene una sesión en ese horario.');
      }
      const { error } = await supabase.from('tutoring_sessions').update(payload).eq('id', selected.id);
      if (error) throw error;
    }

    if (operation === 'add') {
      const payload = {
        chapter_id: activeChapterId,
        tutor_id: tutorId,
        student_name: elements.managerStudent.value.trim(),
        subject: elements.managerSubject.value.trim(),
        session_date: elements.managerDate.value,
        start_time: elements.managerTime.value,
        hours: Number(elements.managerHours.value),
        status: 'PENDING'
      };
      if (!payload.student_name || !payload.subject || !payload.session_date || !payload.start_time) {
        throw new Error('Completa los datos de la nueva sesión.');
      }
      if (overlaps(payload, calendarSessions)) throw new Error('El tutor ya tiene una sesión en ese horario.');
      const { error } = await supabase.from('tutoring_sessions').insert(payload);
      if (error) throw error;
    }

    if (operation === 'delete') {
      const { error } = await supabase.from('tutoring_sessions').delete().eq('id', selected.id);
      if (error) throw error;
    }

    if (operation === 'clear') {
      const tutorName = state.members.find(member => member.userId === tutorId)?.name || 'este tutor';
      const sessionCount = calendarSessions.filter(session => session.tutor_id === tutorId).length;
      if (!sessionCount) throw new Error(`${tutorName} no tiene sesiones en este capítulo.`);
      if (!window.confirm(`Vas a eliminar ${sessionCount} sesión(es) de ${tutorName}. Esta acción no se puede deshacer. ¿Continuar?`)) {
        throw new Error('Operación cancelada.');
      }
      const { error } = await supabase
        .from('tutoring_sessions')
        .delete()
        .eq('chapter_id', activeChapterId)
        .eq('tutor_id', tutorId);
      if (error) throw error;
    }

    if (operation === 'swap') {
      const target = calendarSessions.find(session => session.id === elements.managerTargetSession.value);
      if (!target || target.id === selected.id) throw new Error('Selecciona otra sesión para intercambiar.');
      const { error } = await supabase.rpc('swap_tutoring_sessions', {
        first_session_id: selected.id,
        second_session_id: target.id
      });
      if (error) throw error;
    }

    if (operation === 'send') {
      const targetTutorId = elements.managerTargetTutor.value;
      if (!targetTutorId || targetTutorId === selected.tutor_id) throw new Error('Selecciona otro tutor.');
      const freeMinutes = findNearestFreeTime(selected, targetTutorId);
      if (freeMinutes === undefined) throw new Error('No hay un horario libre para ese tutor entre 08:00 y 18:00.');
      const { error } = await supabase.from('tutoring_sessions').update({
        tutor_id: targetTutorId,
        start_time: timeFromMinutes(freeMinutes)
      }).eq('id', selected.id);
      if (error) throw error;
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
      if (actionBtn) {
        const memberId = actionBtn.getAttribute('data-member-id');
        openMemberModal(memberId);
        return;
      }

      const manageTutorButton = e.target.closest('[data-action="manage-tutor"]');
      if (manageTutorButton) {
        const tutorUserId = manageTutorButton.getAttribute('data-member-id');
        window.location.href = `dashboard.html?tutor=${encodeURIComponent(tutorUserId)}&chapter=${encodeURIComponent(activeChapterId)}`;
      }
    });
  }

  if (elements.recordsTable) {
    elements.recordsTable.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="manage-session"]');
      if (button) openSessionManager('', button.getAttribute('data-session-id'));
    });
  }

  elements.managerOperation?.addEventListener('change', refreshManagerVisibility);
  elements.managerTutor?.addEventListener('change', refreshManagerSessions);
  elements.managerSession?.addEventListener('change', loadSelectedSessionIntoForm);
  elements.managerTargetTutor?.addEventListener('change', refreshManagerTargetSessions);
  document.getElementById('sessionManagerClose')?.addEventListener('click', () => elements.sessionManagerModal.close());
  document.getElementById('sessionManagerCancel')?.addEventListener('click', () => elements.sessionManagerModal.close());

  elements.sessionManagerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await applySessionOperation();
      await reloadRemoteData();
      elements.sessionManagerModal.close();
      showToast('Calendario actualizado correctamente.');
    } catch (error) {
      console.error('Error en operación de calendario:', error);
      showToast(error.message || 'No se pudo actualizar el calendario.');
    }
  });

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

  // F) Exportación e Importación a CSV
  if (elements.btnExportCSV) {
    elements.btnExportCSV.addEventListener('click', exportToCSV);
  }
  if (elements.btnImportCSV) {
    elements.btnImportCSV.addEventListener('click', openCSVImportModal);
  }
  if (elements.csvImportClose) {
    elements.csvImportClose.addEventListener('click', closeCSVImportModal);
  }
  if (elements.csvImportCancel) {
    elements.csvImportCancel.addEventListener('click', closeCSVImportModal);
  }
  if (elements.csvFileInputDialog) {
    elements.csvFileInputDialog.addEventListener('change', handleCSVFileSelection);
  }
  if (elements.csvImportConfirm) {
    elements.csvImportConfirm.addEventListener('click', confirmCSVImport);
  }
  if (elements.csvImportModal) {
    elements.csvImportModal.addEventListener('click', (e) => {
      if (isImporting) return;
      const surface = elements.csvImportModal.querySelector('.admin-dialog__surface');
      if (surface && !surface.contains(e.target)) {
        closeCSVImportModal();
      }
    });

    elements.csvImportModal.addEventListener('cancel', (e) => {
      if (isImporting) {
        e.preventDefault();
      }
    });
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
  const init = async () => {
    await loadAdminChapterOptions();
    const remoteData = await getRemoteData();
    state.members = remoteData.members;
    state.records = remoteData.records;
    renderMembers();
    populateMemberFilter();
    renderRecords();
  };

  elements.chapterSelect?.addEventListener('change', () => {
    const chapterId = elements.chapterSelect.value;
    if (chapterId) window.location.href = `admin.html?chapter=${encodeURIComponent(chapterId)}`;
  });
  elements.refreshButton?.addEventListener('click', refreshAdmin);

  document.querySelectorAll('[data-action="logout"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      signOut();
    });
  });

  let adminLogicalTimer = null;
  try {
    await init();
    adminLogicalTimer = initLogicalTimer({
      checkIntervalMs: 60000,
      supabase,
      chapterId: activeChapterId
    });
    adminLogicalTimer.start();
  } catch (error) {
    console.error('Error cargando administración desde Supabase:', error);
    showToast('No se pudieron cargar los datos del capítulo.');
  }

  window.addEventListener('beforeunload', () => {
    adminLogicalTimer?.stop();
  });
});
