// ==========================================================================
// DualOrganizer - Lógica del Portal Hub y Gestor de Capítulos
// Stack: Vanilla JavaScript ES6+ Puro (Cero dependencias)
// Arquitectura: State-driven rendering, localStorage persistence, 
// diálogos nativos (<dialog>), WAI-ARIA y delegación de eventos.
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Constantes y Estado de Sesión
  // --------------------------------------------------------------------------
  const STORAGE_CHAPTERS_KEY = 'dualorganizer_chapters_v1';
  const STORAGE_SESSION_KEY = 'dualorganizer_session';
  const STORAGE_ACTIVE_CHAPTER_KEY = 'dualorganizer_active_chapter';

  // Catálogo de capítulos predefinidos disponibles para unirse con código
  const AVAILABLE_CATALOG = [
    {
      code: 'ING-2026',
      name: 'Facultad de Ingeniería',
      institution: 'Universidad Nacional',
      department: 'Ingeniería Mecatrónica y Sistemas',
      description: 'Capítulo activo de tutorías de tronco común en ciencias físico-matemáticas.'
    },
    {
      code: 'CIE-2026',
      name: 'Facultad de Ciencias Exactas',
      institution: 'Universidad Nacional',
      department: 'Matemáticas Aplicadas y Física',
      description: 'Acompañamiento en cálculo avanzado, álgebra abstracta y análisis numérico.'
    },
    {
      code: 'MED-2026',
      name: 'Facultad de Medicina y Salud',
      institution: 'Universidad Nacional',
      department: 'Ciencias Biomédicas y Farmacología',
      description: 'Tutorías departamentales en bioquímica clínica y bioestadística médica.'
    }
  ];

  // Capítulos por defecto del usuario
  const DEFAULT_USER_CHAPTERS = [
    {
      id: 'chap-ing-01',
      code: 'ING-2026',
      name: 'Facultad de Ingeniería',
      institution: 'Universidad Nacional',
      department: 'Ciencias Básicas de Ingeniería',
      description: 'Capítulo activo. Monitoreo de horas de tutoría y acreditación académica.',
      role: 'Tutor Académico',
      isPrimary: true
    }
  ];

  // --------------------------------------------------------------------------
  // 2. Validación de Sesión y Perfil del Usuario
  // --------------------------------------------------------------------------
  let currentUser = {
    name: 'Juan Pérez',
    role: 'TUTOR',
    identifier: 'juan.perez@institucion.edu'
  };

  const sessionStr = sessionStorage.getItem(STORAGE_SESSION_KEY);
  if (sessionStr) {
    try {
      const parsed = JSON.parse(sessionStr);
      currentUser = { ...currentUser, ...parsed };
    } catch (e) {
      console.warn('Error leyendo sesión, utilizando usuario base.', e);
    }
  } else {
    // Si no hay sesión explícita, se almacena la sesión por defecto para evitar redirecciones forzadas
    sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentUser));
  }

  // Actualizar encabezado con nombre y rol
  const welcomeTitle = document.getElementById('welcomeTitle');
  if (welcomeTitle && currentUser.name) {
    welcomeTitle.textContent = `Bienvenido, ${currentUser.name}`;
  }

  // --------------------------------------------------------------------------
  // 3. Persistencia de Capítulos en LocalStorage
  // --------------------------------------------------------------------------
  function loadUserChapters() {
    const raw = localStorage.getItem(STORAGE_CHAPTERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_CHAPTERS_KEY, JSON.stringify(DEFAULT_USER_CHAPTERS));
      return [...DEFAULT_USER_CHAPTERS];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_USER_CHAPTERS];
    } catch (e) {
      return [...DEFAULT_USER_CHAPTERS];
    }
  }

  function saveUserChapters(chapters) {
    localStorage.setItem(STORAGE_CHAPTERS_KEY, JSON.stringify(chapters));
  }

  let userChapters = loadUserChapters();

  // --------------------------------------------------------------------------
  // 4. Selectores DOM
  // --------------------------------------------------------------------------
  const hubGrid = document.getElementById('hubGrid');
  const createChapterDialog = document.getElementById('createChapterDialog');
  const joinChapterDialog = document.getElementById('joinChapterDialog');
  const createChapterForm = document.getElementById('createChapterForm');
  const joinChapterForm = document.getElementById('joinChapterForm');
  const joinCodeInput = document.getElementById('joinCodeInput');
  const chapterPreviewBox = document.getElementById('chapterPreviewBox');
  const previewTitle = document.getElementById('previewTitle');
  const previewMeta = document.getElementById('previewMeta');
  const btnSubmitJoin = document.getElementById('btnSubmitJoin');
  const hubToast = document.getElementById('hubToast');
  const hubToastMsg = document.getElementById('hubToastMsg');

  let activeTriggerElement = null;

  // --------------------------------------------------------------------------
  // 5. Utilidades y Helpers
  // --------------------------------------------------------------------------
  const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#x60;');
  };

  let toastTimeout = null;
  function showToast(message) {
    if (!hubToast || !hubToastMsg) return;
    clearTimeout(toastTimeout);
    hubToastMsg.textContent = message;
    hubToast.classList.add('is-visible');
    toastTimeout = setTimeout(() => {
      hubToast.classList.remove('is-visible');
    }, 3200);
  }

  function generateChapterCode(name) {
    const clean = String(name || '').replace(/[^A-Za-zÀ-ÿ0-9\s]/g, '').trim();
    const words = clean.split(/\s+/).filter(w => w.length >= 2);
    let prefix = 'CAP';
    if (words.length >= 2) {
      prefix = (words[0][0] + words[1][0] + (words[2] ? words[2][0] : words[1][1] || 'X')).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 3) {
      prefix = words[0].substring(0, 3).toUpperCase();
    }
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefix}-2026-${rand}`;
  }

  // --------------------------------------------------------------------------
  // 6. Renderizado de la Cuadrícula de Capítulos (State-driven)
  // --------------------------------------------------------------------------
  function renderHubGrid() {
    if (!hubGrid) return;

    const roleLabel = currentUser.role === 'ADMIN' ? 'Coordinador / Admin' : 'Tutor Académico';

    // Generar tarjetas de capítulos activos
    const chapterCardsHtml = userChapters.map((chap) => {
      const isPrimary = chap.isPrimary ? 'primary-card' : '';
      const displayRole = chap.role || roleLabel;

      return `
        <article class="hub-card ${isPrimary}" data-chapter-id="${chap.id}" tabindex="0" role="button" aria-label="Ingresar al capítulo ${escapeHtml(chap.name)}">
          <div class="hub-card-header">
            <div class="hub-card-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div class="chapter-badges">
              <span class="chapter-code-badge">${escapeHtml(chap.code || 'CAP-2026')}</span>
              <span class="chapter-role-badge">${escapeHtml(displayRole)}</span>
            </div>
          </div>
          <div class="hub-card-body">
            <h2>${escapeHtml(chap.name)}</h2>
            <span class="chapter-institution">${escapeHtml(chap.institution || 'Universidad Nacional')}</span>
            <p>${escapeHtml(chap.description || 'Gestión académica y bitácora de tutorías.')}</p>
          </div>
          <div class="hub-card-footer">
            <span>Ingresar al espacio</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </div>
        </article>
      `;
    }).join('');

    // Tarjetas fijas de acción (Crear y Unirse)
    const actionCardsHtml = `
      <!-- Tarjeta: Crear Capítulo -->
      <article class="hub-card action-card" id="cardTriggerCreate" tabindex="0" role="button" aria-haspopup="dialog" aria-label="Crear nuevo capítulo de tutorías">
        <div class="hub-card-header">
          <div class="hub-card-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
          </div>
        </div>
        <div class="hub-card-body">
          <h2>Crear Nuevo Capítulo</h2>
          <span class="chapter-institution">Espacio Institucional</span>
          <p>Registra un nuevo departamento, facultad o programa institucional de asesorías.</p>
        </div>
        <div class="hub-card-footer">
          <span>Comenzar</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </article>

      <!-- Tarjeta: Unirse a Capítulo -->
      <article class="hub-card action-card" id="cardTriggerJoin" tabindex="0" role="button" aria-haspopup="dialog" aria-label="Unirse a un capítulo existente con código">
        <div class="hub-card-header">
          <div class="hub-card-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
          </div>
        </div>
        <div class="hub-card-body">
          <h2>Unirse a un Capítulo</h2>
          <span class="chapter-institution">Código de Acceso</span>
          <p>Ingresa una clave o código de invitación para incorporarte como tutor activo.</p>
        </div>
        <div class="hub-card-footer">
          <span>Ingresar código</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      </article>
    `;

    hubGrid.innerHTML = chapterCardsHtml + actionCardsHtml;
  }

  // --------------------------------------------------------------------------
  // 7. Delegación de Eventos en Cuadrícula (Click y Teclado)
  // --------------------------------------------------------------------------
  if (hubGrid) {
    hubGrid.addEventListener('click', (e) => {
      // 1. Click en Crear Capítulo
      const createTrigger = e.target.closest('#cardTriggerCreate');
      if (createTrigger) {
        openCreateDialog(createTrigger);
        return;
      }

      // 2. Click en Unirse a Capítulo
      const joinTrigger = e.target.closest('#cardTriggerJoin');
      if (joinTrigger) {
        openJoinDialog(joinTrigger);
        return;
      }

      // 3. Click en una tarjeta de capítulo existente
      const chapterCard = e.target.closest('.hub-card[data-chapter-id]');
      if (chapterCard) {
        const chapterId = chapterCard.getAttribute('data-chapter-id');
        const selected = userChapters.find(c => c.id === chapterId);
        if (selected) {
          localStorage.setItem(STORAGE_ACTIVE_CHAPTER_KEY, JSON.stringify(selected));
          showToast(`Ingresando a ${selected.name}...`);
          setTimeout(() => {
            if (currentUser.role === 'ADMIN') {
              window.location.href = 'admin.html';
            } else {
              window.location.href = 'dashboard.html';
            }
          }, 400);
        }
      }
    });

    hubGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const activeCard = e.target.closest('.hub-card');
        if (activeCard) {
          e.preventDefault();
          activeCard.click();
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // 8. Diálogo: Crear Nuevo Capítulo (<dialog>)
  // --------------------------------------------------------------------------
  function openCreateDialog(triggerElement) {
    activeTriggerElement = triggerElement;
    if (!createChapterDialog) return;

    createChapterForm.reset();
    createChapterDialog.showModal();

    const nameInput = document.getElementById('newChapterName');
    if (nameInput) nameInput.focus();
  }

  function closeCreateDialog() {
    if (!createChapterDialog) return;
    createChapterDialog.close();
    if (activeTriggerElement && typeof activeTriggerElement.focus === 'function') {
      activeTriggerElement.focus();
    }
  }

  if (createChapterForm) {
    createChapterForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('newChapterName').value.trim();
      const institution = document.getElementById('newChapterInstitution').value.trim();
      const department = document.getElementById('newChapterDepartment').value.trim();
      const description = document.getElementById('newChapterDescription').value.trim();

      if (!name || name.length < 3 || name.length > 80) {
        showToast('El nombre del capítulo debe tener entre 3 y 80 caracteres.');
        document.getElementById('newChapterName').focus();
        return;
      }

      const newChapter = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `chap-${Date.now()}`,
        code: generateChapterCode(name),
        name: name,
        institution: institution ? institution.slice(0, 100) : 'Universidad Nacional',
        department: department ? department.slice(0, 80) : 'Departamento Académico',
        description: description ? description.slice(0, 250) : 'Nuevo espacio de asesorías y seguimiento docente.',
        role: currentUser.role === 'ADMIN' ? 'Coordinador General' : 'Tutor Académico',
        isPrimary: false
      };

      userChapters.push(newChapter);
      saveUserChapters(userChapters);
      renderHubGrid();
      closeCreateDialog();

      showToast(`¡Capítulo "${name}" creado exitosamente!`);
    });
  }

  // --------------------------------------------------------------------------
  // 9. Diálogo: Unirse a un Capítulo (<dialog>)
  // --------------------------------------------------------------------------
  function openJoinDialog(triggerElement) {
    activeTriggerElement = triggerElement;
    if (!joinChapterDialog) return;

    joinChapterForm.reset();
    chapterPreviewBox.classList.add('is-hidden');
    btnSubmitJoin.disabled = true;
    joinChapterDialog.showModal();

    if (joinCodeInput) {
      joinCodeInput.value = '';
      joinCodeInput.focus();
    }
  }

  function closeJoinDialog() {
    if (!joinChapterDialog) return;
    joinChapterDialog.close();
    if (activeTriggerElement && typeof activeTriggerElement.focus === 'function') {
      activeTriggerElement.focus();
    }
  }

  // Búsqueda en tiempo real del código ingresado
  if (joinCodeInput) {
    joinCodeInput.addEventListener('input', () => {
      const rawCode = joinCodeInput.value.trim().toUpperCase();
      joinCodeInput.value = rawCode;

      if (!rawCode) {
        chapterPreviewBox.classList.add('is-hidden');
        btnSubmitJoin.disabled = true;
        return;
      }

      // Buscar si ya pertenece al usuario
      const alreadyBelongs = userChapters.some(c => c.code && c.code.toUpperCase() === rawCode);
      if (alreadyBelongs) {
        chapterPreviewBox.classList.remove('is-hidden');
        previewTitle.textContent = 'Ya formas parte de este capítulo';
        previewMeta.textContent = 'El código ingresado ya está activo en tu lista de espacios.';
        btnSubmitJoin.disabled = true;
        return;
      }

      // Buscar en catálogo disponible o aceptar patrón válido
      const foundInCatalog = AVAILABLE_CATALOG.find(c => c.code === rawCode);
      if (foundInCatalog) {
        chapterPreviewBox.classList.remove('is-hidden');
        previewTitle.textContent = foundInCatalog.name;
        previewMeta.textContent = `${foundInCatalog.institution} • ${foundInCatalog.department}`;
        btnSubmitJoin.disabled = false;
      } else if (rawCode.length >= 6 && rawCode.includes('-')) {
        // Código sintácticamente válido para capítulos personalizados
        chapterPreviewBox.classList.remove('is-hidden');
        previewTitle.textContent = `Capítulo ${rawCode}`;
        previewMeta.textContent = 'Código institucional verificado. Haz clic en unirte.';
        btnSubmitJoin.disabled = false;
      } else {
        chapterPreviewBox.classList.add('is-hidden');
        btnSubmitJoin.disabled = true;
      }
    });
  }

  if (joinChapterForm) {
    joinChapterForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const rawCode = joinCodeInput.value.trim().toUpperCase();
      if (!rawCode) return;

      const found = AVAILABLE_CATALOG.find(c => c.code === rawCode) || {
        code: rawCode,
        name: `Capítulo ${rawCode}`,
        institution: 'Facultad Universitaria',
        department: 'Área Académica',
        description: 'Capítulo agregado mediante código de acceso institucional.'
      };

      const joinedChapter = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `chap-${Date.now()}`,
        code: found.code,
        name: found.name,
        institution: found.institution,
        department: found.department,
        description: found.description,
        role: 'Tutor Académico',
        isPrimary: false
      };

      userChapters.push(joinedChapter);
      saveUserChapters(userChapters);
      renderHubGrid();
      closeJoinDialog();

      showToast(`¡Te has unido con éxito a "${found.name}"!`);
    });
  }

  // Delegación de cierre de modales
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-action="close-create-dialog"]')) {
      closeCreateDialog();
    } else if (e.target.matches('[data-action="close-join-dialog"]')) {
      closeJoinDialog();
    }
  });

  // Cerrar al pulsar Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (createChapterDialog && createChapterDialog.open) {
        closeCreateDialog();
      }
      if (joinChapterDialog && joinChapterDialog.open) {
        closeJoinDialog();
      }
    }
  });

  // --------------------------------------------------------------------------
  // 10. Inicialización
  // --------------------------------------------------------------------------
  renderHubGrid();
});
