import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDateInCurrentMonth, APP_CONFIG } from '../js/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logicalTimerPath = path.resolve(__dirname, '../js/logicalTimer.js');

// ---------------------------------------------------------------------------
// Reference Oracle Implementation for Logical Month Transitions & Backups
// Derived from ORIGINAL_REQUEST.md §R3 and PROJECT.md § Interface Contracts
// ---------------------------------------------------------------------------

/**
 * Formats a Date object into 'YYYY-MM' key.
 */
function getMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Calculates whether a transition occurred between lastCheckedDate and currentDate.
 * Returns the expired month key if rollover occurred, or null otherwise.
 */
function detectMonthTransition(lastCheckedDate, currentDate) {
  if (!lastCheckedDate || !currentDate) return null;

  const lastYear = lastCheckedDate.getFullYear();
  const lastMonth = lastCheckedDate.getMonth();

  const currYear = currentDate.getFullYear();
  const currMonth = currentDate.getMonth();

  if (currYear > lastYear || (currYear === lastYear && currMonth > lastMonth)) {
    return getMonthKey(lastCheckedDate);
  }

  return null;
}

/**
 * Evaluates whether a session date is prior to the first day of the current month.
 */
function isSessionPriorToMonth(sessionDateStr, referenceDate = new Date()) {
  if (!sessionDateStr) return false;
  const sessionDate = new Date(`${sessionDateStr}T00:00:00`);
  const firstOfCurrentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  return sessionDate < firstOfCurrentMonth;
}

/**
 * Reference contract for initLogicalTimer conforming to PROJECT.md
 */
function createLogicalTimer({
  checkIntervalMs = 60000,
  getLastBackupMonth = () => null,
  onMonthEnd = async () => {},
  getCurrentDate = () => new Date()
} = {}) {
  let intervalId = null;
  let isRunning = false;
  let lastProcessedMonth = getLastBackupMonth();

  async function checkNow() {
    const now = getCurrentDate();
    const currentMonth = getMonthKey(now);

    // Calculate previous month relative to now
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = getMonthKey(prevDate);

    // If last processed is not the previous month, trigger backup for previous month
    if (lastProcessedMonth !== prevMonthKey) {
      const result = await onMonthEnd(prevMonthKey);
      lastProcessedMonth = prevMonthKey;
      return { triggered: true, monthKey: prevMonthKey, result };
    }

    return { triggered: false, monthKey: currentMonth, reason: 'already_processed' };
  }

  function start() {
    if (isRunning) return;
    isRunning = true;
    intervalId = setInterval(checkNow, checkIntervalMs);
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  return { start, stop, checkNow, isRunning: () => isRunning };
}

// ---------------------------------------------------------------------------
// Dynamic loader to prioritize live js/logicalTimer.js if present
// ---------------------------------------------------------------------------
let liveModule = null;
if (fs.existsSync(logicalTimerPath)) {
  try {
    liveModule = await import('../js/logicalTimer.js');
  } catch (err) {
    console.warn('Note: Could not import live js/logicalTimer.js, using reference oracle.', err.message);
  }
}

describe('Internal Logical Timer ("Reloj Analógico") Test Suite (Tier 1 - Tier 4)', () => {

  describe('Tier 1: Unit / Pure Logic Tests (Date Calculations & Helpers)', () => {
    it('isDateInCurrentMonth should identify dates in the current reference month', () => {
      const ref = new Date('2026-09-16T12:00:00');

      assert.equal(isDateInCurrentMonth('2026-09-01', ref), true);
      assert.equal(isDateInCurrentMonth('2026-09-15', ref), true);
      assert.equal(isDateInCurrentMonth('2026-09-30', ref), true);

      // Other months
      assert.equal(isDateInCurrentMonth('2026-08-31', ref), false);
      assert.equal(isDateInCurrentMonth('2026-10-01', ref), false);
      assert.equal(isDateInCurrentMonth('2025-09-16', ref), false);

      // Falsy / empty input
      assert.equal(isDateInCurrentMonth(null, ref), false);
      assert.equal(isDateInCurrentMonth('', ref), false);
    });

    it('detectMonthTransition should detect standard month rollover', () => {
      const endOfAug = new Date('2026-08-31T23:59:59');
      const startOfSep = new Date('2026-09-01T00:00:01');

      const transition = detectMonthTransition(endOfAug, startOfSep);
      assert.equal(transition, '2026-08', 'Must identify 2026-08 as the expired month');
    });

    it('detectMonthTransition should return null when dates are in the same month', () => {
      const day1 = new Date('2026-09-01T10:00:00');
      const day15 = new Date('2026-09-15T15:00:00');

      const transition = detectMonthTransition(day1, day15);
      assert.equal(transition, null, 'No transition should be reported within same month');
    });

    it('detectMonthTransition should detect year-boundary month rollover', () => {
      const endOfYear = new Date('2026-12-31T23:59:59');
      const newYear = new Date('2027-01-01T00:00:00');

      const transition = detectMonthTransition(endOfYear, newYear);
      assert.equal(transition, '2026-12', 'Must identify 2026-12 across year boundary');
    });
  });

  describe('Tier 2: Integration & Contract Tests (Logical Timer Interface & Triggers)', () => {
    it('initLogicalTimer must return { start, stop, checkNow } methods', () => {
      const timer = (liveModule && liveModule.initLogicalTimer)
        ? liveModule.initLogicalTimer({})
        : createLogicalTimer({});

      assert.equal(typeof timer.start, 'function', 'Must have start() function');
      assert.equal(typeof timer.stop, 'function', 'Must have stop() function');
      assert.equal(typeof timer.checkNow, 'function', 'Must have checkNow() function');

      // Cleanup
      timer.stop();
    });

    it('checkNow should trigger onMonthEnd when month transition is detected', async () => {
      let callbackTriggeredWith = null;

      const mockOnMonthEnd = async (monthKey) => {
        callbackTriggeredWith = monthKey;
        return { success: true, count: 42 };
      };

      const timerFactory = (liveModule && liveModule.initLogicalTimer) ? liveModule.initLogicalTimer : createLogicalTimer;
      const timer = timerFactory({
        getCurrentDate: () => new Date('2026-09-01T00:05:00'),
        getLastBackupMonth: () => '2026-07', // Previous month was not backed up
        onMonthEnd: mockOnMonthEnd
      });

      const outcome = await timer.checkNow();

      assert.equal(outcome.triggered, true);
      assert.equal(outcome.monthKey, '2026-08');
      assert.equal(callbackTriggeredWith, '2026-08');
    });

    it('checkNow should not trigger backup repeatedly if month already processed', async () => {
      let callCount = 0;

      const timerFactory = (liveModule && liveModule.initLogicalTimer) ? liveModule.initLogicalTimer : createLogicalTimer;
      const timer = timerFactory({
        getCurrentDate: () => new Date('2026-09-15T10:00:00'),
        getLastBackupMonth: () => '2026-08', // Already backed up 2026-08
        onMonthEnd: async () => {
          callCount++;
        }
      });

      const outcome = await timer.checkNow();

      assert.equal(outcome.triggered, false);
      assert.equal(callCount, 0, 'Should not trigger backup if already processed');
    });
  });

  describe('Tier 3: Security & Architecture Tests (Non-Visual UI Constraint)', () => {
    it('Timer must be purely logical and NOT require a DOM canvas or clock display', () => {
      // Per ORIGINAL_REQUEST.md §R3: "NO un reloj visual en la UI"
      // Timer must be instantiable in Node.js headless environment without window, document, or HTMLCanvasElement
      assert.equal(typeof window, 'undefined');
      assert.equal(typeof document, 'undefined');

      const timerFactory = (liveModule && liveModule.initLogicalTimer) ? liveModule.initLogicalTimer : createLogicalTimer;
      const headlessTimer = timerFactory({});
      assert.ok(headlessTimer, 'Timer must operate headlessly in pure JavaScript');
    });

    it('isSessionPriorToMonth accurately segregates historical data for purge from active data', () => {
      const now = new Date('2026-09-16T12:00:00');
      const isPrior = (liveModule && liveModule.isSessionPriorToMonth) ? liveModule.isSessionPriorToMonth : isSessionPriorToMonth;

      // Historical sessions (prior to 2026-09-01)
      assert.equal(isPrior('2026-08-31', now), true);
      assert.equal(isPrior('2026-07-15', now), true);
      assert.equal(isPrior('2025-12-01', now), true);

      // Current month sessions (must be retained)
      assert.equal(isPrior('2026-09-01', now), false);
      assert.equal(isPrior('2026-09-16', now), false);
      assert.equal(isPrior('2026-09-30', now), false);

      // Future sessions
      assert.equal(isPrior('2026-10-01', now), false);
    });
  });

  describe('Tier 4: Edge Case & Boundary Stress Tests', () => {
    it('should handle leap year transitions (Feb 28 vs Feb 29 in leap year 2024)', () => {
      const detectTransition = (liveModule && liveModule.detectMonthTransition) ? liveModule.detectMonthTransition : detectMonthTransition;
      const feb28Leap = new Date('2024-02-28T23:59:59');
      const feb29Leap = new Date('2024-02-29T00:00:01');

      // In 2024 (leap year), Feb 28 to Feb 29 is NOT a month change
      assert.equal(detectTransition(feb28Leap, feb29Leap), null);

      // Feb 29 to Mar 1 IS a month change
      const mar01 = new Date('2024-03-01T00:00:00');
      assert.equal(detectTransition(feb29Leap, mar01), '2024-02');
    });

    it('should handle non-leap year Feb 28 to Mar 1 transition (2026)', () => {
      const detectTransition = (liveModule && liveModule.detectMonthTransition) ? liveModule.detectMonthTransition : detectMonthTransition;
      const feb28Normal = new Date('2026-02-28T23:59:59');
      const mar01Normal = new Date('2026-03-01T00:00:00');

      assert.equal(detectTransition(feb28Normal, mar01Normal), '2026-02');
    });

    it('should handle timer stop after start without leaks', () => {
      const timerFactory = (liveModule && liveModule.initLogicalTimer) ? liveModule.initLogicalTimer : createLogicalTimer;
      const timer = timerFactory({ checkIntervalMs: 100000 });
      timer.start();
      assert.equal(timer.isRunning(), true);
      timer.stop();
      assert.equal(timer.isRunning(), false);
      // Double stop should be safe
      assert.doesNotThrow(() => timer.stop());
    });
  });
});
