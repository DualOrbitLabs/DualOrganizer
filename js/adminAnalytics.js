function computeAnalytics(sessions, members) {
    const subjectRanking = [];
    const tutorRankingMap = new Map();
    const attendance = { APPROVED: 0, REJECTED: 0, PENDING: 0 };
    let totalHours = 0;

    const subjectCounts = new Map();
    
    sessions.forEach(session => {
        if (session.status) {
            attendance[session.status] = (attendance[session.status] || 0) + 1;
        }
        
        if (session.status === 'APPROVED') {
            subjectCounts.set(session.subject, (subjectCounts.get(session.subject) || 0) + 1);
            
            const tutorName = session.profiles?.full_name || 'Desconocido';
            tutorRankingMap.set(tutorName, (tutorRankingMap.get(tutorName) || 0) + (session.hours || 0));
            totalHours += (session.hours || 0);
        }
    });
    
    const totalApproved = attendance.APPROVED;
    Array.from(subjectCounts.entries()).forEach(([subject, count]) => {
        subjectRanking.push({ label: subject, value: count, percentage: totalApproved ? (count / totalApproved) * 100 : 0 });
    });
    subjectRanking.sort((a, b) => b.value - a.value);
    
    const tutorRanking = Array.from(tutorRankingMap.entries()).map(([label, value]) => {
        return { label, value, percentage: totalHours ? (value / totalHours) * 100 : 0 };
    });
    tutorRanking.sort((a, b) => b.value - a.value);
    
    const totalSessions = sessions.length;
    const approvalRate = totalSessions ? ((attendance.APPROVED / totalSessions) * 100).toFixed(1) + '%' : '0%';
    const avgHoursPerTutor = members.length ? (totalHours / members.length).toFixed(1) : '0';
    
    return { 
        subjectRanking: subjectRanking.slice(0, 10),
        tutorRanking: tutorRanking.slice(0, 10),
        attendance,
        kpis: {
            approvalRate,
            rejections: attendance.REJECTED || 0,
            avgHoursPerTutor
        }
    };
}

function renderBarChart(container, data, options = {}) {
    const chart = document.createElement('div');
    chart.className = 'chart-bar-container';
    chart.style.display = 'flex';
    chart.style.flexDirection = 'column';
    chart.style.gap = '0.75rem';
    
    data.forEach(item => {
        const row = document.createElement('div');
        row.className = 'chart-bar';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '1rem';
        
        row.innerHTML = `
            <span class=\"chart-bar__label\" style=\"flex: 0 0 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\">${item.label}</span>
            <div style=\"flex: 1; background: var(--slate-200); height: 24px; border-radius: 4px; overflow: hidden;\">
                <div class=\"chart-bar__fill\" style=\"width: ${item.percentage}%; background: var(--brand-navy, #192a88); height: 100%; transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);\"></div>
            </div>
            <span class=\"chart-bar__value\" style=\"flex: 0 0 40px; font-variant-numeric: tabular-nums; text-align: right;\">${item.value}</span>
        `;
        chart.appendChild(row);
    });
    
    container.appendChild(chart);
}

function renderDonutChart(container, attendance) {
    const total = (attendance.APPROVED || 0) + (attendance.PENDING || 0) + (attendance.REJECTED || 0);
    const radius = 15.91549430918954; // circumference = 100
    
    let currentOffset = 25;
    
    const segments = [
        { key: 'APPROVED', val: attendance.APPROVED || 0, color: '#059669', label: 'Aprobadas' },
        { key: 'PENDING', val: attendance.PENDING || 0, color: '#d97706', label: 'Pendientes' },
        { key: 'REJECTED', val: attendance.REJECTED || 0, color: '#ef4444', label: 'Rechazadas' }
    ];
    
    let circles = '';
    let legendHtml = '';
    
    segments.forEach(seg => {
        if (total === 0) return;
        const percentage = (seg.val / total) * 100;
        if (percentage === 0) return;
        
        circles += `<circle r=\"${radius}\" cx=\"18\" cy=\"18\" fill=\"transparent\" stroke=\"${seg.color}\" stroke-width=\"3\" stroke-dasharray=\"${percentage} ${100 - percentage}\" stroke-dashoffset=\"${currentOffset}\"></circle>`;
        currentOffset -= percentage;
        
        legendHtml += `<div class=\"chart-legend__item\" style=\"display: flex; align-items: center; gap: 0.5rem;\">
            <span style=\"width: 12px; height: 12px; border-radius: 50%; background: ${seg.color};\"></span>
            <span>${seg.label} (${seg.val})</span>
        </div>`;
    });
    
    const svgHtml = `
        <div class=\"chart-donut-container\" style=\"display: flex; flex-direction: column; align-items: center;\">
            <svg viewBox=\"0 0 36 36\" style=\"width: 200px; height: 200px;\">
                <circle r=\"${radius}\" cx=\"18\" cy=\"18\" fill=\"transparent\" stroke=\"var(--slate-200)\" stroke-width=\"3\"></circle>
                ${circles}
            </svg>
            <div class=\"chart-legend\" style=\"display: flex; gap: 1rem; margin-top: 1rem;\">
                ${legendHtml}
            </div>
        </div>
    `;
    container.innerHTML = svgHtml;
}

function renderAnalyticsPanel(container, sessions, members) {
    const data = computeAnalytics(sessions, members);
    
    container.innerHTML = `
        <section style=\"display: flex; gap: 1rem; margin-bottom: 2rem;\">
            <div style=\"flex: 1; padding: 1rem; border: 1px solid var(--slate-200); border-radius: 0.5rem;\">
                <h3>Tasa de Aprobación</h3>
                <p id=\"kpiApprovalRate\" style=\"font-size: 2rem; font-weight: bold; font-variant-numeric: tabular-nums;\">${data.kpis.approvalRate}</p>
            </div>
            <div style=\"flex: 1; padding: 1rem; border: 1px solid var(--slate-200); border-radius: 0.5rem;\">
                <h3>Rechazos Totales</h3>
                <p id=\"kpiRejections\" style=\"font-size: 2rem; font-weight: bold; font-variant-numeric: tabular-nums;\">${data.kpis.rejections}</p>
            </div>
            <div style=\"flex: 1; padding: 1rem; border: 1px solid var(--slate-200); border-radius: 0.5rem;\">
                <h3>Promedio Hrs/Tutor</h3>
                <p id=\"kpiAvgHoursTutor\" style=\"font-size: 2rem; font-weight: bold; font-variant-numeric: tabular-nums;\">${data.kpis.avgHoursPerTutor}</p>
            </div>
        </section>
        <section style=\"margin-bottom: 2rem;\">
            <h2>Materias con Mayor Número de Tutorías</h2>
            <div id=\"subjectsChartContainer\"></div>
        </section>
        <section style=\"margin-bottom: 2rem;\">
            <h2>Tutores con Mayor Volumen de Horas</h2>
            <div id=\"tutorsChartContainer\"></div>
        </section>
        <section style=\"margin-bottom: 2rem;\">
            <h2>Porcentaje de Asistencia vs Cancelaciones</h2>
            <div id=\"attendanceChartContainer\"></div>
        </section>
    `;
    
    const subContainer = container.querySelector('#subjectsChartContainer');
    if (data.subjectRanking.length) {
        renderBarChart(subContainer, data.subjectRanking);
    } else {
        subContainer.innerHTML = '<p>No hay datos suficientes.</p>';
    }

    const tutContainer = container.querySelector('#tutorsChartContainer');
    if (data.tutorRanking.length) {
        renderBarChart(tutContainer, data.tutorRanking);
    } else {
        tutContainer.innerHTML = '<p>No hay datos suficientes.</p>';
    }

    const attContainer = container.querySelector('#attendanceChartContainer');
    renderDonutChart(attContainer, data.attendance);
}

export function initAnalyticsTab({ supabase, chapterId, elements }) {
    const { container } = elements;
    
    async function refresh() {
        const [sessionsRes, membersRes] = await Promise.all([
            supabase.from('tutoring_sessions').select(`status, hours, subject, profiles ( full_name )`).eq('chapter_id', chapterId),
            supabase.from('chapter_members').select('id').eq('chapter_id', chapterId)
        ]);
        
        const sessions = sessionsRes.data || [];
        const members = membersRes.data || [];
        
        renderAnalyticsPanel(container, sessions, members);
    }
    
    return { refresh };
}

