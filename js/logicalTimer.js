/**
 * js/logicalTimer.js
 * DualOrganizer - Temporizador Lógico Interno ("Reloj Analógico" Algorítmico)
 *
 * Cumple con:
 * - ORIGINAL_REQUEST.md §R3: Temporizador PURAMENTE LÓGICO / ALGORÍTMICO (NO un reloj visual en la UI).
 * - Detección automática de transiciones de mes y fronteras de calendario (incluyendo bisiestos y cambio de año).
 * - Respaldos mensuales automáticos con generación de snapshots CSV guardados en Supabase Storage ('backups/').
 * - Purga opcional de sesiones históricas anteriores al mes en curso.
 * - Operación sin pérdidas de memoria e independiente del DOM (ejecutable tanto en navegador como en Node.js headless).
 */

import { generateMonthlyBackup } from './csvUtils.js';

/**
 * Convierte un objeto Date o cadena de fecha al formato de clave 'YYYY-MM'.
 *
 * @param {Date|string} date
 * @returns {string} Clave de mes en formato 'YYYY-MM'
 */
export function getMonthKey(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Determina si ocurrió un cambio de mes entre lastCheckedDate y currentDate.
 * Retorna la clave del mes expirado ('YYYY-MM') si hubo rollover, o null en caso contrario.
 *
 * @param {Date|string} lastCheckedDate
 * @param {Date|string} currentDate
 * @returns {string|null} Clave del mes expirado o null
 */
export function detectMonthTransition(lastCheckedDate, currentDate) {
  if (!lastCheckedDate || !currentDate) return null;

  const last = lastCheckedDate instanceof Date ? lastCheckedDate : new Date(lastCheckedDate);
  const curr = currentDate instanceof Date ? currentDate : new Date(currentDate);

  if (isNaN(last.getTime()) || isNaN(curr.getTime())) return null;

  const lastYear = last.getFullYear();
  const lastMonth = last.getMonth();

  const currYear = curr.getFullYear();
  const currMonth = curr.getMonth();

  if (currYear > lastYear || (currYear === lastYear && currMonth > lastMonth)) {
    return getMonthKey(last);
  }

  return null;
}

/**
 * Evalúa si la fecha de una sesión es anterior al primer día del mes de referencia.
 * Permite segregar datos históricos para respaldo y purga de las sesiones del mes activo.
 *
 * @param {string} sessionDateStr - Fecha de la sesión en formato 'YYYY-MM-DD'
 * @param {Date|string} [referenceDate=new Date()] - Fecha de referencia
 * @returns {boolean} True si la sesión pertenece a un mes anterior
 */
export function isSessionPriorToMonth(sessionDateStr, referenceDate = new Date()) {
  if (!sessionDateStr) return false;
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (isNaN(ref.getTime())) return false;

  const sessionDate = new Date(`${String(sessionDateStr).slice(0, 10)}T00:00:00`);
  if (isNaN(sessionDate.getTime())) return false;

  const firstOfCurrentMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
  return sessionDate < firstOfCurrentMonth;
}

/**
 * Inicializa el temporizador lógico interno en segundo plano.
 * Supervisa transiciones de mes y ejecuta respaldos/purgas programadas.
 *
 * @param {object} [options={}]
 * @param {number} [options.checkIntervalMs=60000] - Frecuencia de verificación en milisegundos
 * @param {Function} [options.getLastBackupMonth] - Función para obtener el último mes respaldado
 * @param {Function} [options.onMonthEnd] - Callback ejecutado al detectar fin de mes
 * @param {Function} [options.getCurrentDate=() => new Date()] - Proveedor de fecha actual (mockeable)
 * @param {object} [options.supabase=null] - Cliente Supabase para consultas y subidas
 * @param {boolean} [options.purgeAfterBackup=false] - Indica si se deben purgar las sesiones respaldadas
 * @param {string} [options.chapterId=null] - Filtro de capítulo para el respaldo
 * @param {Storage} [options.storage] - Objeto de almacenamiento para persistir estado (ej. localStorage)
 * @returns {{ start: Function, stop: Function, checkNow: Function, isRunning: Function }}
 */
export function initLogicalTimer({
  checkIntervalMs = 60000,
  getLastBackupMonth,
  onMonthEnd,
  getCurrentDate = () => new Date(),
  supabase = null,
  purgeAfterBackup = false,
  chapterId = null,
  storage = (typeof localStorage !== 'undefined' ? localStorage : null)
} = {}) {
  let intervalId = null;
  let running = false;

  const defaultGetLastBackupMonth = () => {
    if (storage && typeof storage.getItem === 'function') {
      try {
        return storage.getItem('dualorganizer_last_backup_month');
      } catch {
        return null;
      }
    }
    return null;
  };

  const fetchLastBackupMonth = typeof getLastBackupMonth === 'function'
    ? getLastBackupMonth
    : defaultGetLastBackupMonth;

  let lastProcessedMonth = fetchLastBackupMonth();

  /**
   * Implementación por defecto para onMonthEnd.
   * Consulta sesiones anteriores al mes en curso, genera backup CSV,
   * lo sube a Supabase Storage bucket 'backups/', opcionalmente purga,
   * y actualiza 'dualorganizer_last_backup_month' en almacenamiento local.
   */
  const defaultOnMonthEnd = async (expiredMonthKey) => {
    try {
      if (!supabase) {
        console.info(`[LogicalTimer] Rollover para ${expiredMonthKey} detectado sin cliente Supabase.`);
        return { success: true, count: 0, reason: 'no_client' };
      }

      const now = getCurrentDate();
      const firstOfCurrentMonth = `${getMonthKey(now)}-01`;

      let query = supabase
        .from('tutoring_sessions')
        .select('*')
        .lt('session_date', firstOfCurrentMonth);

      if (chapterId) {
        query = query.eq('chapter_id', chapterId);
      }

      const { data: expiredSessions, error } = await query;
      if (error) {
        console.error('[LogicalTimer] Error al consultar sesiones expiradas:', error);
        return { success: false, error };
      }

      const sessionsToBackup = expiredSessions || [];
      const targetChapter = chapterId || (sessionsToBackup[0]?.chapter_id || 'general');
      const backup = generateMonthlyBackup(sessionsToBackup, targetChapter, expiredMonthKey);

      let uploadResult = null;
      try {
        const storagePath = `${targetChapter}/${backup.filename}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('backups')
          .upload(storagePath, backup.content, {
            contentType: 'text/csv;charset=utf-8;',
            upsert: true
          });
        if (uploadError) {
          console.warn('[LogicalTimer] Aviso al subir respaldo a storage:', uploadError);
        } else {
          uploadResult = uploadData;
        }
      } catch (storageErr) {
        console.warn('[LogicalTimer] Excepción en storage:', storageErr);
      }

      let purgedCount = 0;
      if (purgeAfterBackup && sessionsToBackup.length > 0) {
        const sessionIds = sessionsToBackup.map((s) => s.id);
        const { error: purgeError } = await supabase
          .from('tutoring_sessions')
          .delete()
          .in('id', sessionIds);
        if (purgeError) {
          console.error('[LogicalTimer] Error al purgar sesiones expiradas:', purgeError);
        } else {
          purgedCount = sessionIds.length;
        }
      }

      if (storage && typeof storage.setItem === 'function') {
        try {
          storage.setItem('dualorganizer_last_backup_month', expiredMonthKey);
        } catch {}
      }

      return {
        success: true,
        monthKey: expiredMonthKey,
        count: sessionsToBackup.length,
        purgedCount,
        backupFile: backup.filename,
        uploadResult
      };
    } catch (err) {
      console.error('[LogicalTimer] Error inesperado en defaultOnMonthEnd:', err);
      return { success: false, error: err };
    }
  };

  const handleMonthEnd = typeof onMonthEnd === 'function' ? onMonthEnd : defaultOnMonthEnd;

  /**
   * Ejecuta inmediatamente la comprobación de frontera de mes.
   */
  async function checkNow() {
    const now = getCurrentDate();
    const currentMonth = getMonthKey(now);

    // Calcular mes previo relativo a la fecha actual
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = getMonthKey(prevDate);

    // Si el último mes procesado no es el mes previo, disparar respaldo
    if (lastProcessedMonth !== prevMonthKey) {
      const result = await handleMonthEnd(prevMonthKey);
      lastProcessedMonth = prevMonthKey;
      if (storage && typeof storage.setItem === 'function') {
        try {
          storage.setItem('dualorganizer_last_backup_month', prevMonthKey);
        } catch {}
      }
      return { triggered: true, monthKey: prevMonthKey, result };
    }

    return { triggered: false, monthKey: currentMonth, reason: 'already_processed' };
  }

  function start() {
    if (running) return;
    running = true;
    intervalId = setInterval(checkNow, checkIntervalMs);
  }

  function stop() {
    if (!running && !intervalId) return;
    running = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    start,
    stop,
    checkNow,
    isRunning: () => running
  };
}
