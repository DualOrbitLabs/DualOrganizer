// ==========================================================================
// Módulo de Contacto a Soporte — Resend + Supabase Edge Function
// ==========================================================================
import { supabase } from './supabaseClient.js';

(() => {
  'use strict';

  // ─── Configuración ───
  const SUPPORT_EMAIL = 'dualorbitlabs@gmail.com';

  const PRESETS = {
    suggestion: {
      subject: '[DualOrganizer] Sugerencia',
      intro: 'Tengo la siguiente sugerencia para mejorar DualOrganizer:'
    },
    bug: {
      subject: '[DualOrganizer] Reporte de error',
      intro: 'Encontré el siguiente error al usar DualOrganizer:'
    },
    question: {
      subject: '[DualOrganizer] Pregunta',
      intro: 'Tengo una pregunta sobre DualOrganizer:'
    },
    account: {
      subject: '[DualOrganizer] Problema de cuenta o acceso',
      intro: 'Tengo un problema relacionado con mi cuenta o el acceso:'
    },
    other: {
      subject: '[DualOrganizer] Contacto',
      intro: 'Me pongo en contacto con el siguiente motivo:'
    }
  };

  const MAX_MESSAGE_LENGTH = 1000;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ─── DOM refs ───
  const modal = document.getElementById('supportModal');
  const openBtn = document.getElementById('btnContactSupport');
  const sendBtn = document.getElementById('btnSendSupport');
  const previewEl = document.getElementById('supportPreview');
  const charCountEl = document.getElementById('supportCharCount');
  const counterWrapper = charCountEl?.parentElement;

  const inputName = document.getElementById('supportName');
  const inputEmail = document.getElementById('supportEmail');
  const inputMessage = document.getElementById('supportMessage');

  if (!modal || !openBtn || !sendBtn) return;

  let currentPreset = 'suggestion';
  let previousFocus = null;

  // ─── Toast local (no depende de profile.js) ───
  const showToast = (message, type = 'info') => {
    const existing = document.getElementById('supportToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'supportToast';
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: ${type === 'error' ? '#dc2626' : '#0f172a'};
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      max-width: 90vw;
      text-align: center;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // ─── Construir cuerpo del correo (preview local) ───
  const buildBody = () => {
    const preset = PRESETS[currentPreset];
    const name = inputName.value.trim() || '(sin nombre)';
    const email = inputEmail.value.trim() || '(sin correo)';
    const message = inputMessage.value.trim() || '(sin mensaje)';

    return [
      preset.intro,
      '',
      message,
      '',
      '—————————————————————',
      `Nombre:    ${name}`,
      `Correo:    ${email}`,
      `Página:    ${window.location.pathname || '/'}`,
      `Fecha:     ${new Date().toISOString()}`,
      `Navegador: ${navigator.userAgent}`
    ].join('\n');
  };

  const updatePreview = () => {
    const preset = PRESETS[currentPreset];
    if (previewEl) {
      previewEl.textContent =
        `Para: ${SUPPORT_EMAIL}\nAsunto: ${preset.subject}\n\n${buildBody()}`;
    }
  };

  const updateCharCounter = () => {
    const len = inputMessage.value.length;
    if (charCountEl) charCountEl.textContent = String(len);
    if (counterWrapper) counterWrapper.classList.toggle('over', len > MAX_MESSAGE_LENGTH);
  };

  // ─── Abrir / cerrar modal ───
  const openModal = () => {
    previousFocus = document.activeElement;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    modal.querySelectorAll('.preset-chip').forEach(chip => {
      const isActive = chip.dataset.preset === currentPreset;
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    updatePreview();
    updateCharCounter();
    setTimeout(() => inputName?.focus(), 60);
  };

  const closeModal = () => {
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  };

  // ─── Focus trap ───
  const trapFocus = (e) => {
    if (e.key !== 'Tab' || !modal.classList.contains('visible')) return;
    const focusables = modal.querySelectorAll(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusables).filter(el => !el.disabled && el.offsetParent !== null);
    if (!list.length) return;

    const first = list[0];
    const last = list[list.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };

  // ─── Validación ───
  const validate = () => {
    if (!inputEmail.value.trim() || !EMAIL_REGEX.test(inputEmail.value.trim())) {
      inputEmail.focus();
      inputEmail.style.borderColor = '#dc2626';
      setTimeout(() => { inputEmail.style.borderColor = ''; }, 1800);
      showToast('Ingresa un correo válido', 'error');
      return false;
    }
    if (!inputMessage.value.trim()) {
      inputMessage.focus();
      inputMessage.style.borderColor = '#dc2626';
      setTimeout(() => { inputMessage.style.borderColor = ''; }, 1800);
      showToast('Escribe un mensaje antes de enviar', 'error');
      return false;
    }
    if (inputMessage.value.length > MAX_MESSAGE_LENGTH) {
      inputMessage.focus();
      showToast(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres`, 'error');
      return false;
    }
    return true;
  };

  // ─── Recopilar contexto del navegador ───
  const collectBrowserContext = () => {
    return {
      url: window.location.href,
      referrer: document.referrer || 'Directo',
      title: document.title,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: Array.isArray(navigator.languages) ? navigator.languages.join(', ') : navigator.language,
      online: navigator.onLine,
      cookiesEnabled: navigator.cookieEnabled,
      screenResolution: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset() / -60,
      touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      clientTimestamp: new Date().toISOString(),
    };
  };

  // ─── Envío vía Supabase Edge Function ───
  const sendEmail = async () => {
    if (!validate()) return;

    const preset = PRESETS[currentPreset];

    // Estado de carga (guardamos el HTML original para restaurarlo)
    const originalHTML = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando...';

    try {
      const browserContext = collectBrowserContext();

      const { data, error } = await supabase.functions.invoke('resend-support', {
        body: {
          name: inputName.value.trim(),
          email: inputEmail.value.trim(),
          subject: preset.subject,
          message: inputMessage.value.trim(),
          browserContext,
        },
      });

      if (error) throw error;

      showToast('Mensaje enviado con éxito. Te responderemos pronto.');

      // Limpiar formulario
      inputMessage.value = '';
      updateCharCounter();
      updatePreview();

      closeModal();
    } catch (err) {
      console.error('Error al enviar:', err);

      let errorMsg = 'No se pudo enviar. Por favor intenta de nuevo.';
      if (err?.name === 'FunctionsHttpError' && err?.context?.json) {
        try {
          const serverError = await err.context.json();
          if (serverError?.error) errorMsg = serverError.error;
        } catch { /* ignore */ }
      }

      showToast(errorMsg, 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalHTML;
    }
  };

  // ─── Event listeners ───
  openBtn.addEventListener('click', openModal);

  modal.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', closeModal);
  });

  modal.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentPreset = chip.dataset.preset;
      modal.querySelectorAll('.preset-chip').forEach(c => {
        const isActive = c === chip;
        c.classList.toggle('active', isActive);
        c.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
      updatePreview();
    });
  });

  [inputName, inputEmail, inputMessage].forEach(el => {
    el?.addEventListener('input', updatePreview);
  });

  inputMessage?.addEventListener('input', updateCharCounter);
  sendBtn.addEventListener('click', sendEmail);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) closeModal();
    trapFocus(e);
  });

  modal.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendEmail();
    }
  });

  document.querySelectorAll('[data-open-support]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });
})();