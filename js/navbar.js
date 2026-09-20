import { getAuthenticatedUser, supabase } from './supabaseClient.js';

/**
 * Módulo de Navegación Global
 * Administra la visibilidad de enlaces según el rol del usuario (Tutor vs Admin)
 * y resalta la pestaña activa en la Navbar.
 */
export async function initNavbarVisibility() {
    try {
        const currentUser = await getAuthenticatedUser();
        if (!currentUser) return;

        // Leer capítulo activo de la URL
        const activeChapterId = new URLSearchParams(window.location.search).get('chapter');

        // Consultar membresías del usuario
        let query = supabase
            .from('chapter_members')
            .select('chapter_id, role');

        if (activeChapterId) {
            query = query.eq('chapter_id', activeChapterId);
        } else {
            query = query.eq('user_id', currentUser.id);
        }

        const { data: memberships, error } = await query;
        if (error) {
            console.warn('[Navbar] Error consultando rol de usuario:', error);
            return;
        }

        const hasAdminRole = (memberships || []).some(m => m.role === 'ADMIN');

        // Si NO tiene rol de Administrador, ocultar la pestaña "Administración"
        if (!hasAdminRole) {
            const adminLinks = document.querySelectorAll('a[href="admin.html"], a[href*="admin.html"]');
            adminLinks.forEach(link => {
                const navItem = link.closest('li');
                if (navItem) {
                    navItem.style.display = 'none';
                } else {
                    link.style.display = 'none';
                }
            });
        }
    } catch (err) {
        console.warn('[Navbar] Excepción al inicializar navbar:', err);
    }
}

// Ejecutar automáticamente al cargar el DOM
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initNavbarVisibility();
    });
}
