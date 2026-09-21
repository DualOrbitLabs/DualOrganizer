-- DualOrganizer: cambios incrementales despues de 002_complete_persistence.sql.
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- No borra ni recrea tablas y no elimina datos existentes.

-- Permite que un admin cree una sesion para otro miembro del mismo capitulo.
drop policy if exists sessions_insert_own_membership on public.tutoring_sessions;
create policy sessions_insert_own_membership
on public.tutoring_sessions for insert to authenticated
with check (
  (
    tutor_id = auth.uid()
    and public.is_chapter_member(chapter_id)
  )
  or (
    public.is_chapter_admin(chapter_id)
    and public.is_chapter_member(chapter_id, tutor_id)
  )
);

-- Intercambia dos sesiones de forma atomica.
-- La sesion A pasa al tutor y horario de B; B pasa al tutor y horario de A.
create or replace function public.swap_tutoring_sessions(first_session_id uuid, second_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  first_session public.tutoring_sessions;
  second_session public.tutoring_sessions;
begin
  select *
  into first_session
  from public.tutoring_sessions
  where id = first_session_id
  for update;

  select *
  into second_session
  from public.tutoring_sessions
  where id = second_session_id
  for update;

  if first_session.id is null or second_session.id is null then
    raise exception 'Las dos sesiones deben existir';
  end if;

  if first_session.chapter_id <> second_session.chapter_id then
    raise exception 'Las sesiones deben pertenecer al mismo capítulo';
  end if;

  if not public.is_chapter_admin(first_session.chapter_id) then
    raise exception 'No tienes permisos para intercambiar estas sesiones';
  end if;

  if first_session.tutor_id = second_session.tutor_id then
    raise exception 'Las sesiones deben pertenecer a tutores distintos';
  end if;

  update public.tutoring_sessions
  set tutor_id = second_session.tutor_id,
      start_time = second_session.start_time
  where id = first_session.id;

  update public.tutoring_sessions
  set tutor_id = first_session.tutor_id,
      start_time = first_session.start_time
  where id = second_session.id;
end;
$$;

revoke execute on function public.swap_tutoring_sessions(uuid, uuid) from public;
grant execute on function public.swap_tutoring_sessions(uuid, uuid) to authenticated;
