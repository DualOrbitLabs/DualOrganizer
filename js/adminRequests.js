async function loadPendingRequests(supabase, chapterId) {
    const { data, error } = await supabase
        .from('join_requests')
        .select(`
            id,
            user_id,
            status,
            created_at,
            profiles ( full_name, institutional_id )
        `)
        .eq('chapter_id', chapterId)
        .eq('status', 'PENDING');
        
    if (error) {
        console.error('Error loading requests:', error);
        return [];
    }
    return data || [];
}

async function loadChapterMembers(supabase, chapterId) {
    const { data, error } = await supabase
        .from('chapter_members')
        .select(`
            id,
            user_id,
            role,
            profiles ( full_name, institutional_id )
        `)
        .eq('chapter_id', chapterId);
        
    if (error) {
        console.error('Error loading members:', error);
        return [];
    }
    return data || [];
}

async function approveRequest(supabase, requestId, chapterId, userId, reviewerId) {
    const { error: updateError } = await supabase
        .from('join_requests')
        .update({ 
            status: 'APPROVED', 
            reviewed_by: reviewerId, 
            reviewed_at: new Date().toISOString() 
        })
        .eq('id', requestId);
        
    if (updateError) throw updateError;
    
    const { error: insertError } = await supabase
        .from('chapter_members')
        .insert([{ chapter_id: chapterId, user_id: userId, role: 'TUTOR' }]);
        
    if (insertError) throw insertError;
}

async function rejectRequest(supabase, requestId, reviewerId) {
    const { error } = await supabase
        .from('join_requests')
        .update({ 
            status: 'REJECTED', 
            reviewed_by: reviewerId, 
            reviewed_at: new Date().toISOString() 
        })
        .eq('id', requestId);
        
    if (error) throw error;
}

async function updateMemberRole(supabase, chapterId, userId, newRole) {
    if (!['TUTOR', 'ADMIN'].includes(newRole)) throw new Error('Rol inválido');
    
    const { error } = await supabase
        .from('chapter_members')
        .update({ role: newRole })
        .eq('chapter_id', chapterId)
        .eq('user_id', userId);
        
    if (error) throw error;
}

function renderRequestsPanel(container, requests, members) {
    const fragment = document.createDocumentFragment();
    
    const reqSection = document.createElement('section');
    reqSection.className = 'requests-section';
    reqSection.innerHTML = `<h2>Solicitudes Pendientes</h2>`;
    
    if (requests.length === 0) {
        reqSection.innerHTML += `<p>No hay solicitudes pendientes.</p>`;
    } else {
        const table = document.createElement('table');
        table.className = 'requests-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Matrícula</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${requests.map(req => `
                    <tr>
                        <td>${req.profiles?.full_name || 'Sin nombre'}</td>
                        <td style="font-variant-numeric: tabular-nums">${req.profiles?.institutional_id || 'Por asignar'}</td>
                        <td style="font-variant-numeric: tabular-nums">${new Date(req.created_at).toLocaleDateString()}</td>
                        <td class="action-btn-group">
                            <button data-action="approve-request" data-id="${req.id}" data-userid="${req.user_id}">Aprobar</button>
                            <button data-action="reject-request" data-id="${req.id}">Rechazar</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        reqSection.appendChild(table);
    }
    fragment.appendChild(reqSection);
    
    const roleSection = document.createElement('section');
    roleSection.className = 'requests-section';
    roleSection.innerHTML = `<h2>Gestión de Roles</h2>`;
    
    if (members.length === 0) {
        roleSection.innerHTML += `<p>No hay miembros registrados.</p>`;
    } else {
        const table = document.createElement('table');
        table.className = 'requests-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Matrícula</th>
                    <th>Rol Actual</th>
                    <th>Cambiar Rol</th>
                </tr>
            </thead>
            <tbody>
                ${members.map(member => `
                    <tr>
                        <td>${member.profiles?.full_name || 'Sin nombre'}</td>
                        <td style="font-variant-numeric: tabular-nums">${member.profiles?.institutional_id || 'Sin matrícula'}</td>
                        <td>${member.role === 'ADMIN' ? 'Coordinador' : 'Tutor'}</td>
                        <td class="action-btn-group">
                            <select data-user-id="${member.user_id}" class="role-select">
                                <option value="TUTOR" ${member.role === 'TUTOR' ? 'selected' : ''}>Tutor</option>
                                <option value="ADMIN" ${member.role === 'ADMIN' ? 'selected' : ''}>Coordinador</option>
                            </select>
                            <button data-action="apply-role-change" data-userid="${member.user_id}">Aplicar</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        roleSection.appendChild(table);
    }
    fragment.appendChild(roleSection);
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

export function initRequestsTab({ supabase, chapterId, adminId, showToast, elements }) {
    const { container } = elements;
    
    async function refresh() {
        const [requests, members] = await Promise.all([
            loadPendingRequests(supabase, chapterId),
            loadChapterMembers(supabase, chapterId)
        ]);
        renderRequestsPanel(container, requests, members);
    }
    
    container.addEventListener('click', async (e) => {
        const target = e.target.closest('button[data-action]');
        if (!target) return;
        
        const action = target.getAttribute('data-action');
        
        if (action === 'approve-request') {
            const reqId = target.getAttribute('data-id');
            const userId = target.getAttribute('data-userid');
            try {
                await approveRequest(supabase, reqId, chapterId, userId, adminId);
                showToast('Solicitud aprobada', 'success');
                refresh();
            } catch (err) {
                console.error(err);
                showToast('Error al aprobar', 'error');
            }
        } else if (action === 'reject-request') {
            const reqId = target.getAttribute('data-id');
            try {
                await rejectRequest(supabase, reqId, adminId);
                showToast('Solicitud rechazada', 'success');
                refresh();
            } catch (err) {
                console.error(err);
                showToast('Error al rechazar', 'error');
            }
        } else if (action === 'apply-role-change') {
            const userId = target.getAttribute('data-userid');
            const select = container.querySelector(`select[data-user-id=\"${userId}\"]`);
            if (select) {
                try {
                    await updateMemberRole(supabase, chapterId, userId, select.value);
                    showToast('Rol actualizado', 'success');
                    refresh();
                } catch (err) {
                    console.error(err);
                    showToast('Error al actualizar rol', 'error');
                }
            }
        }
    });
    
    return { refresh };
}

