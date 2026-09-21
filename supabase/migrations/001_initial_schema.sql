-- DualOrganizer: esquema inicial para Supabase/PostgreSQL.
-- Ejecutar en Supabase > SQL Editor. No contiene usuarios ni contrasenas.

create extension if not exists pgcrypto;

create type public.user_role as enum ('TUTOR', 'ADMIN');
create type public.membership_role as enum ('TUTOR', 'ADMIN');
create type public.session_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'TUTOR',
  institutional_id text unique,
  phone text,
  semester text,
  description text,
  subjects text[] not null default '{}',
  available_days text[] not null default '{}',
  time_slots text,
  meeting_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  institution text not null default '',
  department text,
  description text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.chapter_members (
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.membership_role not null default 'TUTOR',
  is_primary boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);

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
  on conflict (chapter_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_chapter_created
after insert on public.chapters
for each row execute function public.add_chapter_creator_as_admin();

create table public.tutoring_sessions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id) on delete restrict,
  student_name text not null,
  subject text not null,
  session_date date not null,
  start_time time not null,
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  status public.session_status not null default 'PENDING',
  evidence_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.session_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tutoring_sessions(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  created_at timestamptz not null default now()
);

create index chapter_members_user_id_idx on public.chapter_members(user_id);
create index tutoring_sessions_chapter_date_idx on public.tutoring_sessions(chapter_id, session_date);
create index tutoring_sessions_tutor_date_idx on public.tutoring_sessions(tutor_id, session_date);
create index session_evidence_session_id_idx on public.session_evidence(session_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger sessions_set_updated_at
before update on public.tutoring_sessions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Estas funciones evitan politicas RLS recursivas al consultar membresias.
create or replace function public.is_chapter_member(target_chapter uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chapter_members
    where chapter_id = target_chapter and user_id = target_user
  );
$$;

create or replace function public.is_chapter_admin(target_chapter uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chapter_members
    where chapter_id = target_chapter and user_id = target_user and role = 'ADMIN'
  );
$$;

create or replace function public.is_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = target_user and role = 'ADMIN'
  );
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

alter table public.profiles enable row level security;
alter table public.chapters enable row level security;
alter table public.chapter_members enable row level security;
alter table public.tutoring_sessions enable row level security;
alter table public.session_evidence enable row level security;

create policy profiles_select_self_or_admin
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_insert_self
on public.profiles for insert to authenticated
with check (id = auth.uid() and role = 'TUTOR');

create policy profiles_update_self_without_role_change
on public.profiles for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.current_user_role()
);

create policy chapters_select_member
on public.chapters for select to authenticated
using (true);

create policy chapters_insert_authenticated
on public.chapters for insert to authenticated
with check (created_by = auth.uid());

create policy chapters_update_admin
on public.chapters for update to authenticated
using (public.is_chapter_admin(id));

create policy chapter_members_select_member_or_admin
on public.chapter_members for select to authenticated
using (user_id = auth.uid() or public.is_chapter_admin(chapter_id));

create policy chapter_members_insert_self_or_admin
on public.chapter_members for insert to authenticated
with check (
  (user_id = auth.uid() and role = 'TUTOR')
  or public.is_chapter_admin(chapter_id)
);

create policy chapter_members_update_admin
on public.chapter_members for update to authenticated
using (public.is_chapter_admin(chapter_id))
with check (public.is_chapter_admin(chapter_id));

create policy chapter_members_delete_self_or_admin
on public.chapter_members for delete to authenticated
using (user_id = auth.uid() or public.is_chapter_admin(chapter_id));

create policy sessions_select_owner_or_admin
on public.tutoring_sessions for select to authenticated
using (tutor_id = auth.uid() or public.is_chapter_admin(chapter_id));

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

create policy sessions_update_owner_or_admin
on public.tutoring_sessions for update to authenticated
using (tutor_id = auth.uid() or public.is_chapter_admin(chapter_id))
with check (tutor_id = auth.uid() or public.is_chapter_admin(chapter_id));

create policy sessions_delete_owner_or_admin
on public.tutoring_sessions for delete to authenticated
using (tutor_id = auth.uid() or public.is_chapter_admin(chapter_id));

create policy evidence_select_owner_or_admin
on public.session_evidence for select to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.tutoring_sessions s
    where s.id = session_id and public.is_chapter_admin(s.chapter_id)
  )
);

create policy evidence_insert_owner
on public.session_evidence for insert to authenticated
with check (uploaded_by = auth.uid());

create policy evidence_delete_owner_or_admin
on public.session_evidence for delete to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.tutoring_sessions s
    where s.id = session_id and public.is_chapter_admin(s.chapter_id)
  )
);

-- Storage: crear primero el bucket privado "session-evidence".
create policy evidence_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'session-evidence'
  and (owner_id = auth.uid()::text or public.is_admin())
);

create policy evidence_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'session-evidence'
  and owner_id = auth.uid()::text
);

create policy evidence_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'session-evidence'
  and (owner_id = auth.uid()::text or public.is_admin())
);

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
  set tutor_id = second_session.tutor_id, start_time = second_session.start_time
  where id = first_session.id;

  update public.tutoring_sessions
  set tutor_id = first_session.tutor_id, start_time = first_session.start_time
  where id = second_session.id;
end;
$$;

revoke execute on function public.swap_tutoring_sessions(uuid, uuid) from public;
grant execute on function public.swap_tutoring_sessions(uuid, uuid) to authenticated;

-- Crear el bucket privado "session-evidence" desde Storage > New bucket
-- antes de subir archivos; las politicas de Storage ya estan declaradas arriba.