-- Cambios para proyectos que ya ejecutaron 001_initial_schema.sql.
-- Ejecutar una sola vez despues de crear el bucket privado session-evidence.

create or replace function public.add_chapter_creator_as_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set role = 'ADMIN', updated_at = now()
  where id = new.created_by;

  insert into public.chapter_members (chapter_id, user_id, role, is_primary)
  values (new.id, new.created_by, 'ADMIN', true)
  on conflict (chapter_id, user_id) do update
  set role = 'ADMIN', is_primary = true;
  return new;
end;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

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
  select * into first_session from public.tutoring_sessions where id = first_session_id for update;
  select * into second_session from public.tutoring_sessions where id = second_session_id for update;
  if first_session.id is null or second_session.id is null then raise exception 'Las dos sesiones deben existir'; end if;
  if first_session.chapter_id <> second_session.chapter_id then raise exception 'Las sesiones deben pertenecer al mismo capítulo'; end if;
  if not public.is_chapter_admin(first_session.chapter_id) then raise exception 'No tienes permisos para intercambiar estas sesiones'; end if;
  if first_session.tutor_id = second_session.tutor_id then raise exception 'Las sesiones deben pertenecer a tutores distintos'; end if;
  update public.tutoring_sessions set tutor_id = second_session.tutor_id, start_time = second_session.start_time where id = first_session.id;
  update public.tutoring_sessions set tutor_id = first_session.tutor_id, start_time = first_session.start_time where id = second_session.id;
end;
$$;

revoke execute on function public.swap_tutoring_sessions(uuid, uuid) from public;
grant execute on function public.swap_tutoring_sessions(uuid, uuid) to authenticated;

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

 drop policy if exists chapters_select_member on public.chapters;
create policy chapters_select_authenticated
on public.chapters for select to authenticated
using (true);

drop policy if exists profiles_update_self_without_role_change on public.profiles;
create policy profiles_update_self_without_role_change
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());

drop policy if exists evidence_delete_owner_or_admin on public.session_evidence;
create policy evidence_delete_owner_or_admin
on public.session_evidence for delete to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.tutoring_sessions s
    where s.id = session_id and public.is_chapter_admin(s.chapter_id)
  )
);

drop policy if exists evidence_storage_select on storage.objects;
create policy evidence_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'session-evidence'
  and (owner_id = auth.uid()::text or public.is_admin())
);

drop policy if exists evidence_storage_insert on storage.objects;
create policy evidence_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'session-evidence'
  and owner_id = auth.uid()::text
);

drop policy if exists evidence_storage_delete on storage.objects;
create policy evidence_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'session-evidence'
  and (owner_id = auth.uid()::text or public.is_admin())
);
