-- DualOrganizer: endurecimiento de seguridad despues de 003_new_database.sql.
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- No modifica ni elimina datos.

-- Las funciones SECURITY DEFINER no deben ser invocables por visitantes anonimos.
-- La aplicacion las usa despues de autenticar al usuario.
revoke execute on function public.add_chapter_creator_as_admin() from public, anon;
revoke execute on function public.handle_new_user() from public, anon;
revoke execute on function public.set_updated_at() from public, anon;
revoke execute on function public.is_chapter_member(uuid, uuid) from public, anon;
revoke execute on function public.is_chapter_admin(uuid, uuid) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.swap_tutoring_sessions(uuid, uuid) from public, anon;

grant execute on function public.is_chapter_member(uuid, uuid) to authenticated;
grant execute on function public.is_chapter_admin(uuid, uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.swap_tutoring_sessions(uuid, uuid) to authenticated;

-- Mantener el bucket privado aunque alguien cambie su configuracion desde el panel.
update storage.buckets
set public = false
where id = 'session-evidence';

-- Evitar que un perfil autenticado pueda cambiar su identificador institucional,
-- rol o timestamps desde el navegador.
drop policy if exists profiles_update_self_without_role_change on public.profiles;
create policy profiles_update_self_safe_fields
on public.profiles for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.current_user_role()
  and institutional_id is not distinct from (select p.institutional_id from public.profiles p where p.id = auth.uid())
  and created_at = (select p.created_at from public.profiles p where p.id = auth.uid())
);
