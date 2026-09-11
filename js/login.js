// ==========================================================================
// DualOrganizer - Lógica de Autenticación y Control de Acceso (Login)
// Stack: Vanilla JavaScript ES6+ Puro (Cero frameworks)
// Arquitectura: Validación nativa accesible, alternancia de roles,
// alternancia de visibilidad de contraseña y gestión de sesión simulada.
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. Referencias al DOM
  // --------------------------------------------------------------------------
  const loginForm = document.getElementById('loginForm');
  const roleTabs = document.querySelector('.role-tabs');
  const identifierLabel = document.getElementById('identifierLabel');
  const identifierInput = document.getElementById('identifierInput');
  const identifierHelp = document.getElementById('identifierHelp');
  const passwordInput = document.getElementById('passwordInput');
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const btnSubmitLogin = document.getElementById('btnSubmitLogin');
  const loginAlert = document.getElementById('loginAlert');
  const btnDemoTutor = document.getElementById('btnDemoTutor');
  const btnDemoAdmin = document.getElementById('btnDemoAdmin');
  const btnForgotPassword = document.getElementById('btnForgotPassword');
  const forgotDialog = document.getElementById('forgotDialog');
  const btnCloseDialog = document.getElementById('btnCloseDialog');
  const btnCancelForgot = document.getElementById('btnCancelForgot');
  const forgotForm = document.getElementById('forgotForm');
  const forgotAlert = document.getElementById('forgotAlert');

  let currentRole = 'TUTOR'; // 'TUTOR' | 'ADMIN'

  // --------------------------------------------------------------------------
  // 2. Gestión de Roles (Pestañas Semánticas)
  // --------------------------------------------------------------------------
  if (roleTabs) {
    roleTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.role-tab-btn');
      if (!btn) return;

      const role = btn.getAttribute('data-role');
      if (!role || role === currentRole) return;

      currentRole = role;

      // Actualizar estados accesibles en tabs
      roleTabs.querySelectorAll('.role-tab-btn').forEach((b) => {
        const isActive = b === btn;
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        b.setAttribute('tabindex', isActive ? '0' : '-1');
      });

      // Actualizar etiquetas y placeholders según el rol
      if (currentRole === 'ADMIN') {
        identifierLabel.textContent = 'Correo de Coordinación o Usuario Admin';
        identifierInput.placeholder = 'admin@institucion.edu';
        identifierHelp.textContent = 'Acceso restringido a personal directivo y coordinadores de tutoría.';
      } else {
        identifierLabel.textContent = 'Correo Institucional o Matrícula';
        identifierInput.placeholder = 'juan.perez@institucion.edu o TUT-2023-0891';
        identifierHelp.textContent = 'Ingresa tu correo oficial universitario o tu ID de tutor.';
      }

      clearAlert();
      identifierInput.focus();
    });
  }

  // --------------------------------------------------------------------------
  // 3. Alternancia de Visibilidad de Contraseña
  // --------------------------------------------------------------------------
  if (btnTogglePassword && passwordInput) {
    btnTogglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
      btnTogglePassword.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
      btnTogglePassword.setAttribute(
        'aria-label',
        isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
      );

      // Iconos SVG limpios
      btnTogglePassword.innerHTML = isPassword
        ? `
        <!-- Ojo tachado (Ocultar) -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      `
        : `
        <!-- Ojo abierto (Mostrar) -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      `;
    });
  }

  // --------------------------------------------------------------------------
  // 4. Utilidades de Alerta y Validación
  // --------------------------------------------------------------------------
  function showAlert(message, type = 'danger') {
    if (!loginAlert) return;
    loginAlert.className = `login-alert ${type}`;
    loginAlert.textContent = message;
    loginAlert.removeAttribute('hidden');
  }

  function clearAlert() {
    if (!loginAlert) return;
    loginAlert.textContent = '';
    loginAlert.setAttribute('hidden', '');
  }

  // --------------------------------------------------------------------------
  // 5. Credenciales Demo Rápidas (1-Click para Evaluadores y QA)
  // --------------------------------------------------------------------------
  if (btnDemoTutor) {
    btnDemoTutor.addEventListener('click', () => {
      // Activar tab tutor
      const tutorTab = document.getElementById('roleTabTutor');
      if (tutorTab) tutorTab.click();

      identifierInput.value = 'juan.perez@institucion.edu';
      passwordInput.value = 'Tutor2026*Pass';
      clearAlert();
      identifierInput.focus();
    });
  }

  if (btnDemoAdmin) {
    btnDemoAdmin.addEventListener('click', () => {
      // Activar tab admin
      const adminTab = document.getElementById('roleTabAdmin');
      if (adminTab) adminTab.click();

      identifierInput.value = 'coordinacion@institucion.edu';
      passwordInput.value = 'Admin2026*Secure';
      clearAlert();
      identifierInput.focus();
    });
  }

  // --------------------------------------------------------------------------
  // Constantes de Validación Defensiva (RFC 5322 & Políticas Institucionales)
  // --------------------------------------------------------------------------
  const EMAIL_STRICT_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  const INSTITUTIONAL_ID_REGEX = /^[A-Za-z0-9_\-\.]{3,30}$/;

  // --------------------------------------------------------------------------
  // 6. Procesamiento del Formulario de Inicio de Sesión
  // --------------------------------------------------------------------------
  let isLoginSubmitting = false;

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      clearAlert();

      if (isLoginSubmitting) return;

      const identifier = identifierInput.value.trim();
      const password = passwordInput.value;

      // Validación 1: Campos requeridos y límites de longitud
      if (!identifier) {
        showAlert('Por favor ingresa tu correo institucional o matrícula.');
        identifierInput.focus();
        return;
      }

      if (identifier.length < 5 || identifier.length > 100) {
        showAlert('El identificador debe contener entre 5 y 100 caracteres.');
        identifierInput.focus();
        return;
      }

      if (!password) {
        showAlert('Por favor introduce tu contraseña de acceso.');
        passwordInput.focus();
        return;
      }

      // Validación 2: Longitud de contraseña
      if (password.length < 6 || password.length > 128) {
        showAlert('La contraseña debe contener entre 6 y 128 caracteres.');
        passwordInput.focus();
        return;
      }

      // Validación 3: Formato estricto de identificador
      if (identifier.includes('@')) {
        if (!EMAIL_STRICT_REGEX.test(identifier)) {
          showAlert('Por favor proporciona un formato de correo electrónico institucional válido.');
          identifierInput.focus();
          return;
        }
      } else {
        if (!INSTITUTIONAL_ID_REGEX.test(identifier)) {
          showAlert('El formato de matrícula o identificador contiene caracteres no permitidos.');
          identifierInput.focus();
          return;
        }
      }

      // Estado de carga y bloqueo de doble submit
      isLoginSubmitting = true;
      btnSubmitLogin.disabled = true;
      btnSubmitLogin.setAttribute('aria-busy', 'true');
      const originalBtnText = btnSubmitLogin.innerHTML;
      btnSubmitLogin.innerHTML = '<span>Verificando credenciales...</span>';

      try {
        // Simulación de autenticación institucional
        setTimeout(() => {
          try {
            // Almacenar sesión en sessionStorage
            const sessionData = {
              role: currentRole,
              identifier: identifier.toLowerCase(),
              name: currentRole === 'ADMIN' ? 'Coordinador General' : 'Juan Pérez',
              loginTime: new Date().toISOString()
            };
            sessionStorage.setItem('dualorganizer_session', JSON.stringify(sessionData));

            showAlert('¡Credenciales válidas! Redirigiendo a tu espacio...', 'success');

            setTimeout(() => {
              window.location.href = 'hub.html';
            }, 600);
          } catch (storageErr) {
            console.error('Error al persistir sesión:', storageErr);
            showAlert('Error al procesar la sesión en el navegador. Revisa el almacenamiento local.');
            isLoginSubmitting = false;
            btnSubmitLogin.disabled = false;
            btnSubmitLogin.removeAttribute('aria-busy');
            btnSubmitLogin.innerHTML = originalBtnText;
          }
        }, 700);
      } catch (err) {
        console.error('Error en proceso de login:', err);
        showAlert('Ocurrió un error inesperado. Inténtalo nuevamente.');
        isLoginSubmitting = false;
        btnSubmitLogin.disabled = false;
        btnSubmitLogin.removeAttribute('aria-busy');
        btnSubmitLogin.innerHTML = originalBtnText;
      }
    });
  }

  // --------------------------------------------------------------------------
  // 7. Modal Nativo (<dialog>) de Recuperación de Contraseña
  // --------------------------------------------------------------------------
  if (btnForgotPassword && forgotDialog) {
    btnForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      if (forgotAlert) {
        forgotAlert.setAttribute('hidden', '');
        forgotAlert.textContent = '';
      }
      forgotDialog.showModal();
      const emailField = document.getElementById('forgotEmailInput');
      if (emailField) {
        emailField.value = identifierInput.value.includes('@') ? identifierInput.value : '';
        emailField.focus();
      }
    });
  }

  if (btnCloseDialog && forgotDialog) {
    btnCloseDialog.addEventListener('click', () => {
      forgotDialog.close();
    });
  }

  if (btnCancelForgot && forgotDialog) {
    btnCancelForgot.addEventListener('click', () => {
      forgotDialog.close();
    });
  }

  let isForgotSubmitting = false;
  if (forgotForm && forgotDialog) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (isForgotSubmitting) return;

      const email = document.getElementById('forgotEmailInput').value.trim();
      if (!email || !EMAIL_STRICT_REGEX.test(email) || email.length > 100) {
        forgotAlert.className = 'login-alert danger';
        forgotAlert.textContent = 'Por favor ingresa un correo electrónico institucional válido (máx. 100 caracteres).';
        forgotAlert.removeAttribute('hidden');
        return;
      }

      isForgotSubmitting = true;
      const submitBtn = forgotForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      forgotAlert.className = 'login-alert success';
      forgotAlert.textContent = `Hemos enviado un enlace de restablecimiento a ${email}. Revisa tu bandeja institucional.`;
      forgotAlert.removeAttribute('hidden');

      setTimeout(() => {
        isForgotSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        forgotDialog.close();
      }, 2500);
    });
  }
});
