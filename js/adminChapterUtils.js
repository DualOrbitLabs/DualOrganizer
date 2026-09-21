/**
 * Resuelve el ID del capítulo preferido para un usuario basándose en el parámetro solicitado
 * y su lista de membresías.
 *
 * @param {string|null} requestedChapterId
 * @param {Array<{ chapter_id: string, is_primary?: boolean, role?: string }>} memberships
 * @returns {string|null}
 */
export function resolvePreferredChapterId(requestedChapterId, memberships = []) {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return requestedChapterId || null;
  }

  if (requestedChapterId) {
    const exists = memberships.some(m => m.chapter_id === requestedChapterId);
    if (exists) return requestedChapterId;
  }

  const primaryAdmin = memberships.find(m => m.is_primary && m.role === 'ADMIN');
  if (primaryAdmin) return primaryAdmin.chapter_id;

  const primary = memberships.find(m => m.is_primary);
  if (primary) return primary.chapter_id;

  return memberships[0]?.chapter_id || null;
}
