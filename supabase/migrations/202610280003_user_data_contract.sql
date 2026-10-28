-- Extend the existing learning schema with the reviewed user/profile contract.
-- Existing API columns (created_by/actor_id) remain available during migration;
-- owner_id is the canonical relationship for new database consumers.

create or replace function public.valid_current_skills(skills text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare skill text;
begin
  if skills is null or cardinality(skills) > 50 then return false; end if;
  foreach skill in array skills loop
    if skill is null or pg_catalog.char_length(pg_catalog.btrim(skill)) not between 1 and 80 then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.profiles
  add column if not exists email text,
  add column if not exists current_skills text[] not null default '{}',
  add column if not exists career_goal text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is distinct from u.email;

create or replace function public.sync_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata_name text;
begin
  metadata_name := coalesce(
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), '')
  );
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, metadata_name)
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name);
  return new;
end;
$$;

drop trigger if exists sync_profile_identity on auth.users;
create trigger sync_profile_identity
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_profile_identity();

create or replace function public.touch_profile_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version = old.version then new.version := old.version + 1; end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
drop trigger if exists touch_profile_version on public.profiles;
create trigger touch_profile_version before update on public.profiles
for each row execute function public.touch_profile_version();

drop policy if exists "update own profile fields" on public.profiles;
create policy "update own profile fields" on public.profiles for update to authenticated
using (id = auth.uid() and deleted_at is null)
with check (id = auth.uid() and deleted_at is null);
revoke update on public.profiles from anon, authenticated;
revoke update (display_name, version, deleted_at) on public.profiles from anon, authenticated;
grant update (display_name, current_skills, career_goal) on public.profiles to authenticated;

-- Backfill legacy owner fields and keep them aligned with the established API fields.
alter table public.study_content add column if not exists owner_id uuid references public.profiles(id) on delete restrict;
update public.study_content set owner_id = created_by where owner_id is distinct from created_by;
alter table public.study_content alter column owner_id set not null;

alter table public.study_sessions add column if not exists owner_id uuid references public.profiles(id) on delete restrict;
update public.study_sessions set owner_id = actor_id where owner_id is distinct from actor_id;
alter table public.study_sessions alter column owner_id set not null;

alter table public.practice_attempts add column if not exists owner_id uuid references public.profiles(id) on delete restrict;
update public.practice_attempts set owner_id = actor_id where owner_id is distinct from actor_id;
alter table public.practice_attempts alter column owner_id set not null;

alter table public.learning_progress add column if not exists owner_id uuid references public.profiles(id) on delete restrict;
update public.learning_progress set owner_id = actor_id where owner_id is distinct from actor_id;
alter table public.learning_progress alter column owner_id set not null;

create or replace function public.sync_learning_owner_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'study_content' then
    if new.owner_id is null then new.owner_id := new.created_by; end if;
    if new.created_by is null then new.created_by := new.owner_id; end if;
    if new.owner_id is distinct from new.created_by then
      raise exception 'owner_id must match created_by' using errcode = '23514';
    end if;
  else
    if new.owner_id is null then new.owner_id := new.actor_id; end if;
    if new.actor_id is null then new.actor_id := new.owner_id; end if;
    if new.owner_id is distinct from new.actor_id then
      raise exception 'owner_id must match actor_id' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_study_content_owner on public.study_content;
create trigger sync_study_content_owner before insert or update of owner_id, created_by on public.study_content
for each row execute function public.sync_learning_owner_columns();
drop trigger if exists sync_study_sessions_owner on public.study_sessions;
create trigger sync_study_sessions_owner before insert or update of owner_id, actor_id on public.study_sessions
for each row execute function public.sync_learning_owner_columns();
drop trigger if exists sync_practice_attempts_owner on public.practice_attempts;
create trigger sync_practice_attempts_owner before insert or update of owner_id, actor_id on public.practice_attempts
for each row execute function public.sync_learning_owner_columns();
drop trigger if exists sync_learning_progress_owner on public.learning_progress;
create trigger sync_learning_progress_owner before insert or update of owner_id, actor_id on public.learning_progress
for each row execute function public.sync_learning_owner_columns();

alter table public.profiles
  drop constraint if exists profiles_current_skills_valid,
  add constraint profiles_current_skills_valid check (
    public.valid_current_skills(current_skills)
  ),
  drop constraint if exists profiles_career_goal_length,
  add constraint profiles_career_goal_length check (
    career_goal is null or pg_catalog.char_length(pg_catalog.btrim(career_goal)) between 1 and 300
  );

create index if not exists study_content_owner_recent_idx on public.study_content(owner_id, created_at desc) where deleted_at is null;
create index if not exists study_sessions_owner_recent_idx on public.study_sessions(owner_id, created_at desc) where deleted_at is null;
create index if not exists practice_attempts_owner_recent_idx on public.practice_attempts(owner_id, created_at desc) where deleted_at is null;
create index if not exists learning_progress_owner_recent_idx on public.learning_progress(owner_id, updated_at desc) where deleted_at is null;
create index if not exists learning_progress_owner_content_idx on public.learning_progress(owner_id, content_id) where deleted_at is null;

-- Students can read their own notes and progress. Course members still read shared
-- course notes; assigned teachers retain course-scoped access to student work.
drop policy if exists "read course study content" on public.study_content;
create policy "read own or assigned study content" on public.study_content for select to authenticated using (
  deleted_at is null and (
    owner_id = auth.uid() or exists (
      select 1 from public.course_memberships m
      join public.profiles p on p.id = m.user_id
      where m.course_id = study_content.course_id and m.user_id = auth.uid()
        and p.organization_id = study_content.organization_id and p.deleted_at is null
        and ((p.role = 'student' and m.role = 'student') or (p.role in ('teacher','administrator') and m.role = 'teacher'))
    )
  )
);

drop policy if exists "read own and assigned study sessions" on public.study_sessions;
create policy "read own and assigned study sessions" on public.study_sessions for select to authenticated using (
  deleted_at is null and (
    owner_id = auth.uid() or exists (
      select 1 from public.course_memberships m join public.profiles p on p.id = m.user_id
      where m.course_id = study_sessions.course_id and m.user_id = auth.uid() and m.role = 'teacher'
        and p.role in ('teacher','administrator') and p.organization_id = study_sessions.organization_id and p.deleted_at is null
    )
  )
);

drop policy if exists "read own and assigned practice" on public.practice_attempts;
create policy "read own and assigned practice" on public.practice_attempts for select to authenticated using (
  deleted_at is null and (
    owner_id = auth.uid() or exists (
      select 1 from public.course_memberships m join public.profiles p on p.id = m.user_id
      where m.course_id = practice_attempts.course_id and m.user_id = auth.uid() and m.role = 'teacher'
        and p.role in ('teacher','administrator') and p.organization_id = practice_attempts.organization_id and p.deleted_at is null
    )
  )
);

drop policy if exists "read own and assigned progress" on public.learning_progress;
create policy "read own and assigned progress" on public.learning_progress for select to authenticated using (
  deleted_at is null and (
    owner_id = auth.uid() or exists (
      select 1 from public.course_memberships m join public.profiles p on p.id = m.user_id
      where m.course_id = learning_progress.course_id and m.user_id = auth.uid() and m.role = 'teacher'
        and p.role in ('teacher','administrator') and p.organization_id = learning_progress.organization_id and p.deleted_at is null
    )
  )
);

-- The contract calls contentId a required relationship. Keep it nullable in this
-- migration because the current product also supports personal, inline-note work
-- that has no persisted study_content row yet; APIs enforce owner scope meanwhile.
