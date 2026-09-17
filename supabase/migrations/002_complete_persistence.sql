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
