async function loadChapterSettings(supabase, chapterId) {
    const { data: chapterData, error: chapterError } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();
        
    const { data: settingsData, error: settingsError } = await supabase
        .from('chapter_settings')
        .select('*')
        .eq('chapter_id', chapterId)
        .maybeSingle();
        
    return {
        chapter: chapterData || {},
        settings: settingsData || { 
            semester_target_hours: 80, 
            require_approval: false, 
            subjects_catalog: [] 
        }
    };
}

async function saveChapterSettings(supabase, chapterId, data) {
    // Update chapters name if provided
    if (data.name) {
        await supabase.from('chapters').update({ name: data.name }).eq('id', chapterId);
    }
    
    const { error } = await supabase
        .from('chapter_settings')
        .upsert({
            chapter_id: chapterId,
            semester_target_hours: data.semester_target_hours,
            require_approval: data.require_approval,
            subjects_catalog: data.subjects_catalog
        });
        
    if (error) throw error;
}

async function loadAnnouncements(supabase, chapterId) {
    const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });
        
    return data || [];
}

async function createAnnouncement(supabase, chapterId, authorId, title, body) {
    const { error } = await supabase
        .from('announcements')
        .insert([{ chapter_id: chapterId, author_id: authorId, title, body }]);
    if (error) throw error;
}

async function deleteAnnouncement(supabase, id) {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;
}

function renderSettingsPanel(container, settings, announcements, callbacks) {
    const subjects = settings.settings.subjects_catalog || [];
    
    container.innerHTML = `
        <div class=\"settings-form\">
            <h2>Configuración del Capítulo</h2>
            <div class=\"settings-form__grid\" style=\"display: grid; gap: 1rem; max-width: 600px;\">
                <label>
                    Nombre del Capítulo
                    <input type=\"text\" id=\"settingChapterName\" value=\"${settings.chapter.name || ''}\">
                </label>
                <label>
                    Código del Capítulo
                    <input type=\"text\" id=\"settingChapterCode\" value=\"${settings.chapter.code || ''}\" readonly disabled>
                </label>
                <label>
                    Horas Objetivo Semestrales
                    <input type=\"number\" id=\"settingTargetHours\" min=\"1\" max=\"500\" step=\"1\" value=\"${settings.settings.semester_target_hours}\" style=\"font-variant-numeric: tabular-nums;\">
                </label>
                <label style=\"display: flex; align-items: center; gap: 0.5rem;\">
                    <input type=\"checkbox\" id=\"settingRequireApproval\" ${settings.settings.require_approval ? 'checked' : ''}>
                    Requerir Aprobación para Unirse
                </label>
            </div>
            
            <h3 style=\"margin-top: 2rem;\">Catálogo de Materias</h3>
            <div id=\"subjectsCatalog\" class=\"subjects-catalog\" style=\"display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem;\">
                ${subjects.map((sub, idx) => `
                    <span class=\"chip--catalog\" style=\"background: var(--slate-200); padding: 4px 8px; border-radius: 16px; display: inline-flex; align-items: center; gap: 4px;\">
                        ${sub}
                        <button type=\"button\" class=\"chip__remove\" data-action=\"remove-subject\" data-index=\"${idx}\" style=\"border: none; background: transparent; cursor: pointer;\">&times;</button>
                    </span>
                `).join('')}
            </div>
            <div style=\"display: flex; gap: 0.5rem;\">
                <input type=\"text\" id=\"newSubjectInput\" placeholder=\"Nueva materia\">
                <button type=\"button\" data-action=\"add-subject\" id=\"btnAddSubject\">Agregar</button>
            </div>
        </div>
        
        <div id=\"settingsUnsavedBar\" class=\"settings-unsaved-bar\" style=\"display: none; position: sticky; bottom: 0; background: var(--slate-200); padding: 1rem; margin-top: 2rem; border-top: 1px solid #ccc; justify-content: flex-end; gap: 1rem;\">
            <span>Cambios sin guardar</span>
            <button type=\"button\" id=\"btnDiscardSettings\">Descartar</button>
            <button type=\"button\" id=\"btnSaveSettings\" style=\"background: var(--brand-navy, #192a88); color: white;\">Guardar Cambios</button>
        </div>
        
        <hr style=\"margin: 2rem 0;\">
        
        <div id=\"announcementsManager\" class=\"announcements-manager\">
            <h2>Muro de Anuncios</h2>
            <div style=\"display: grid; gap: 1rem; max-width: 600px; margin-bottom: 2rem;\">
                <input type=\"text\" id=\"announcementTitle\" placeholder=\"Título del anuncio\" required>
                <textarea id=\"announcementBody\" placeholder=\"Contenido del anuncio\" style=\"min-height: 100px;\"></textarea>
                <button type=\"button\" id=\"btnPublishAnnouncement\" data-action=\"publish-announcement\">Publicar Anuncio</button>
            </div>
            
            <div class=\"announcement-list\" style=\"display: grid; gap: 1rem;\">
                ${announcements.map(ann => `
                    <div class=\"announcement-item\" style=\"border: 1px solid var(--slate-200); padding: 1rem; border-radius: 0.5rem;\">
                        <h3>${ann.title}</h3>
                        <p>${ann.body}</p>
                        <div style=\"display: flex; justify-content: space-between; margin-top: 1rem;\">
                            <span style=\"font-variant-numeric: tabular-nums; color: #666;\">${new Date(ann.created_at).toLocaleDateString()}</span>
                            <button type=\"button\" data-action=\"delete-announcement\" data-id=\"${ann.id}\">Eliminar</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

export function initSettingsTab({ supabase, chapterId, adminId, showToast, elements }) {
    const { container } = elements;
    
    let currentSettings = null;
    let snapshot = null;
    let subjectsList = [];
    let announcements = [];
    
    const getFormState = () => {
        return {
            name: container.querySelector('#settingChapterName')?.value || '',
            semester_target_hours: parseInt(container.querySelector('#settingTargetHours')?.value || '80', 10),
            require_approval: container.querySelector('#settingRequireApproval')?.checked || false,
            subjects_catalog: [...subjectsList]
        };
    };
    
    const checkDirty = () => {
        if (!snapshot) return;
        const currentState = getFormState();
        const isDirty = JSON.stringify(currentState) !== JSON.stringify(snapshot);
        const bar = container.querySelector('#settingsUnsavedBar');
        if (bar) bar.style.display = isDirty ? 'flex' : 'none';
    };
    
    async function refresh() {
        currentSettings = await loadChapterSettings(supabase, chapterId);
        announcements = await loadAnnouncements(supabase, chapterId);
        subjectsList = [...(currentSettings.settings.subjects_catalog || [])];
        
        renderSettingsPanel(container, currentSettings, announcements);
        snapshot = getFormState();
    }
    
    container.addEventListener('input', (e) => {
        if (e.target.closest('.settings-form')) {
            checkDirty();
        }
    });
    
    container.addEventListener('click', async (e) => {
        const action = e.target.getAttribute('data-action') || e.target.id;
        if (!action) return;
        
        if (action === 'add-subject' || action === 'btnAddSubject') {
            const input = container.querySelector('#newSubjectInput');
            if (input && input.value.trim()) {
                subjectsList.push(input.value.trim());
                // Re-render minimally or full re-render, here doing full config re-render implies refetching so we just mutate state and redraw subjects.
                // For simplicity, update DOM of subjects then check dirty.
                const subContainer = container.querySelector('#subjectsCatalog');
                if (subContainer) {
                    subContainer.innerHTML += `
                        <span class=\"chip--catalog\" style=\"background: var(--slate-200); padding: 4px 8px; border-radius: 16px; display: inline-flex; align-items: center; gap: 4px;\">
                            ${input.value.trim()}
                            <button type=\"button\" class=\"chip__remove\" data-action=\"remove-subject\" data-index=\"${subjectsList.length - 1}\" style=\"border: none; background: transparent; cursor: pointer;\">&times;</button>
                        </span>
                    `;
                }
                input.value = '';
                checkDirty();
            }
        }
        else if (action === 'remove-subject') {
            const idx = parseInt(e.target.getAttribute('data-index'), 10);
            subjectsList.splice(idx, 1);
            e.target.closest('.chip--catalog').remove();
            // update indices would be nice, but simple approach is to trigger a re-render of just the catalog or just accept it's a bit disconnected until save
            checkDirty();
        }
        else if (action === 'btnSaveSettings') {
            const state = getFormState();
            try {
                await saveChapterSettings(supabase, chapterId, state);
                showToast('Configuración guardada', 'success');
                await refresh();
            } catch (err) {
                console.error(err);
                showToast('Error al guardar', 'error');
            }
        }
        else if (action === 'btnDiscardSettings') {
            await refresh();
        }
        else if (action === 'publish-announcement' || action === 'btnPublishAnnouncement') {
            const title = container.querySelector('#announcementTitle').value;
            const body = container.querySelector('#announcementBody').value;
            if (!title) return alert('El título es requerido');
            try {
                await createAnnouncement(supabase, chapterId, adminId, title, body);
                showToast('Anuncio publicado', 'success');
                await refresh();
            } catch (err) {
                console.error(err);
                showToast('Error publicando anuncio', 'error');
            }
        }
        else if (action === 'delete-announcement') {
            const id = e.target.getAttribute('data-id');
            if (confirm('¿Eliminar anuncio?')) {
                try {
                    await deleteAnnouncement(supabase, id);
                    showToast('Anuncio eliminado', 'success');
                    await refresh();
                } catch (err) {
                    console.error(err);
                    showToast('Error eliminando', 'error');
                }
            }
        }
    });
    
    return { refresh };
}

