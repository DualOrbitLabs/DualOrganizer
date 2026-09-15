export const APP_CONFIG = Object.freeze({
    branding: {
        name: 'DualOrganizer',
        organization: 'DualOrbitLabs',
        supportEmail: 'dualorbitlabs@gmail.com'
    },
    academic: {
        monthlyTargetHours: 80,
        calendarStartHour: 8,
        calendarEndHour: 18,
        calendarRowHeightPx: 54
    },
    uploads: {
        maxBytes: 5 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
    },
    legal: {
        termsPath: 'terms.html'
    }
});

export function isDateInCurrentMonth(dateValue, referenceDate = new Date()) {
    if (!dateValue) return false;
    const date = new Date(`${dateValue}T00:00:00`);
    return date.getFullYear() === referenceDate.getFullYear()
        && date.getMonth() === referenceDate.getMonth();
}
