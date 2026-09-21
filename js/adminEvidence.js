import { formatEvidencePreview } from './evidenceUtils.js';

async function loadSessionsForReview(supabase, chapterId) {
    const { data, error } = await supabase
        .from('tutoring_sessions')
        .select(`
            id,
            subject,
            session_date,
            hours,
            status,
            evidence_path,
            tutor_id,
            profiles:tutor_id ( full_name )
        `)
        .eq('chapter_id', chapterId)
        .eq('status', 'PENDING')
        .not('evidence_path', 'is', null);
        
    if (error) {
        console.error('Error loading sessions for review:', error);
        return [];
    }
    // Only return sessions that actually have an evidence string
    return (data || []).filter(s => s.evidence_path && s.evidence_path.trim() !== '');
}

async function approveSessionEvidence(supabase, sessionId) {
    const { error } = await supabase
        .from('tutoring_sessions')
        .update({ status: 'APPROVED' })
        .eq('id', sessionId);
    if (error) throw error;
}

async function rejectSessionEvidence(supabase, sessionId, notes) {
    const { error } = await supabase
        .from('tutoring_sessions')
        .update({ status: 'REJECTED' }) // Optional: save notes in a new column if added later
        .eq('id', sessionId);
    if (error) throw error;
}

function renderEvidenceGrid(container, sessions, supabase) {
    if (sessions.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 10px; color: var(--slate-500);">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.5;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <p style="margin: 0; font-size: 0.9rem; font-weight: 500;">Bandeja limpia</p>
              <p style="margin: 4px 0 0; font-size: 0.8rem;">No hay evidencias pendientes de revisión.</p>
            </div>
        `;
        return;
    }
    
    const grid = document.createElement('div');
    grid.className = 'evidence-review-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    grid.style.gap = '16px';
    
    sessions.forEach(session => {
        const evidencePath = session.evidence_path;
        let publicUrl = '';
        if (evidencePath) {
            const { data } = supabase.storage.from('session-evidence').getPublicUrl(evidencePath);
            publicUrl = data?.publicUrl || '';
        }

        const card = document.createElement('div');
        card.className = 'settings-card';
        card.style.margin = '0'; // Override default margin for grid
        
        card.innerHTML = `
            <div class="settings-card__header" style="padding: 12px 16px;">
                <h3 style="font-size: 0.95rem;">${session.subject}</h3>
                <p style="font-size: 0.8rem; margin-top: 2px;">Tutor: ${session.profiles?.full_name || 'Desconocido'}</p>
            </div>
            <div class="settings-card__body" style="padding: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 0.85rem; color: var(--slate-600);">
                    <span class="tabular-nums">📅 ${session.session_date ? new Date(session.session_date + 'T00:00:00').toLocaleDateString() : '-'}</span>
                    <span class="tabular-nums">⏱️ ${session.hours}h</span>
                </div>
                
                ${publicUrl ? `
                <a href="${publicUrl}" target="_blank" rel="noopener noreferrer" class="btn btn--outline-action" style="display: flex; justify-content: center; width: 100%; margin-bottom: 16px;">
                    📎 Ver Documento
                </a>
                ` : '<p style="font-size: 0.8rem; color: var(--danger);">Archivo no disponible</p>'}

                <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn btn--success" data-action="approve-evidence" data-id="${session.id}" style="flex: 1;">Aprobar</button>
                    <button type="button" class="btn btn--danger-subtle" data-action="reject-evidence" data-id="${session.id}" style="flex: 1;">Rechazar</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
    
    container.innerHTML = '';
    container.appendChild(grid);
}

export function initEvidenceTab({ supabase, chapterId, showToast, elements }) {
    const { container } = elements;
    let currentSessions = [];
    
    async function refresh() {
        currentSessions = await loadSessionsForReview(supabase, chapterId);
        renderEvidenceGrid(container, currentSessions, supabase);
    }
    
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const action = btn.getAttribute('data-action');
        const sessionId = btn.getAttribute('data-id');
        
        if (!action || !sessionId) return;
        
        try {
            btn.disabled = true;
            btn.style.opacity = '0.7';

            if (action === 'approve-evidence') {
                await approveSessionEvidence(supabase, sessionId);
                showToast('Evidencia aprobada correctamente. Horas sumadas al tutor.', 'success');
                refresh();
            } else if (action === 'reject-evidence') {
                // For a simpler UX, we'll use a prompt for rejection notes if needed, or just reject directly.
                const confirmReject = confirm('¿Estás seguro de rechazar esta evidencia? Las horas no se sumarán.');
                if (confirmReject) {
                    await rejectSessionEvidence(supabase, sessionId, '');
                    showToast('Evidencia rechazada.', 'success');
                    refresh();
                } else {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            }
        } catch (err) {
            console.error('Error al procesar evidencia:', err);
            showToast('Hubo un error al procesar la evidencia.', 'error');
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    });
    
    return { refresh };
}

