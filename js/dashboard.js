// ==========================================================================
// Estructura Base JS para Dashboard - Calendario Semanal
// ==========================================================================

let sessionsData = [];
let currentDate = new Date(); // Fecha actual para la vista semanal

// ==========================================================================
// Selectores DOM
// ==========================================================================
const weeklyCalendarGrid = document.getElementById('weeklyCalendarGrid');
const currentWeekLabel = document.getElementById('currentWeekLabel');
const btnPrevWeek = document.getElementById('btnPrevWeek');
const btnNextWeek = document.getElementById('btnNextWeek');
const kpiTotalHours = document.getElementById('kpiTotalHours');
const btnExportCSV = document.getElementById('btnExportCSV');

// Modal Selectors
const sessionModal = document.getElementById('sessionModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const sessionForm = document.getElementById('sessionForm');
const modalDateInput = document.getElementById('date');
const modalTimeInput = document.getElementById('time');

// ==========================================================================
// Utilidades de Fechas
// ==========================================================================
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes
    return new Date(d.setDate(diff));
}

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ==========================================================================
// Renderizado del Calendario Semanal
// ==========================================================================
function renderWeeklyCalendar() {
    weeklyCalendarGrid.innerHTML = '';
    const startOfWeek = getStartOfWeek(currentDate);
    
    // Actualizar Etiqueta
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    currentWeekLabel.textContent = `Semana: ${formatDate(startOfWeek)} a ${formatDate(endOfWeek)}`;

    // 1. Cabecera (Días de la semana)
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    
    // Celda vacía esquina superior izquierda
    const cornerCell = document.createElement('div');
    cornerCell.className = 'grid-cell header';
    cornerCell.textContent = 'Hora';
    weeklyCalendarGrid.appendChild(cornerCell);

    // Celdas de cabecera de días
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        weekDates.push(formatDate(date));
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'grid-cell header';
        dayHeader.innerHTML = `${days[i]}<br><small>${date.getDate()}/${date.getMonth()+1}</small>`;
        weeklyCalendarGrid.appendChild(dayHeader);
    }

    // 2. Cuadrícula de horas (8:00 a 18:00)
    for (let hour = 8; hour <= 18; hour++) {
        const hourString = `${String(hour).padStart(2, '0')}:00`;
        
        // Etiqueta de hora
        const timeLabel = document.createElement('div');
        timeLabel.className = 'grid-cell time-label';
        timeLabel.textContent = hourString;
        weeklyCalendarGrid.appendChild(timeLabel);

        // Slots por día
        for (let i = 0; i < 7; i++) {
            const slot = document.createElement('div');
            slot.className = 'grid-cell slot';
            slot.dataset.date = weekDates[i];
            slot.dataset.time = hourString;

            // Mostrar sesiones si las hay
            const slotSessions = sessionsData.filter(s => s.date === weekDates[i] && s.time === hourString);
            slotSessions.forEach(session => {
                const sessionDiv = document.createElement('div');
                sessionDiv.className = 'session-item';
                sessionDiv.textContent = `${session.subject} - ${session.studentName} (${session.hours}h)`;
                slot.appendChild(sessionDiv);
            });

            // Al hacer clic en un slot, abre el modal
            slot.addEventListener('click', () => {
                openModal(weekDates[i], hourString);
            });

            weeklyCalendarGrid.appendChild(slot);
        }
    }
}

// Navegación
btnPrevWeek.addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() - 7);
    renderWeeklyCalendar();
});

btnNextWeek.addEventListener('click', () => {
    currentDate.setDate(currentDate.getDate() + 7);
    renderWeeklyCalendar();
});

// ==========================================================================
// Modal y Formulario
// ==========================================================================
function openModal(date, time) {
    modalDateInput.value = date;
    modalTimeInput.value = time;
    sessionForm.reset(); // Limpia los demás campos pero...
    modalDateInput.value = date; // ...reestablecemos fecha...
    modalTimeInput.value = time; // ...y hora.
    sessionModal.style.display = 'flex';
}

closeModalBtn.addEventListener('click', () => {
    sessionModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === sessionModal) {
        sessionModal.style.display = 'none';
    }
});

sessionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const newSession = {
        id: crypto.randomUUID(),
        studentName: document.getElementById('studentName').value,
        subject: document.getElementById('subject').value,
        hours: parseFloat(document.getElementById('hours').value),
        date: modalDateInput.value,
        time: modalTimeInput.value,
        createdAt: new Date().toISOString()
    };
    
    sessionsData.push(newSession);
    sessionModal.style.display = 'none';
    
    updateKPIs();
    renderWeeklyCalendar();
});

function updateKPIs() {
    const totalHours = sessionsData.reduce((acc, curr) => acc + curr.hours, 0);
    kpiTotalHours.textContent = totalHours;
}

// ==========================================================================
// Módulo de Exportación (CSV)
// ==========================================================================
btnExportCSV.addEventListener('click', () => {
    if (sessionsData.length === 0) {
        alert('No hay datos para exportar.');
        return;
    }
    
    const headers = ['ID', 'Alumno', 'Materia', 'Horas', 'Fecha', 'Hora', 'Creado'];
    const csvRows = [headers.join(',')];
    
    sessionsData.forEach(s => {
        const row = [s.id, s.studentName, s.subject, s.hours, s.date, s.time, s.createdAt];
        csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', 'sesiones_export.csv');
    a.click();
    
    window.URL.revokeObjectURL(url);
});

// Init
renderWeeklyCalendar();
