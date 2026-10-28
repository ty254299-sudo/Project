-- Backend entities for the content -> study -> practice -> progress workflow.
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.study_content (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 100),
  source_type text not null check (source_type in ('text','markdown','pdf')),
  storage_path text not null check (char_length(storage_path) between 1 and 512),
  status text not null default 'active' check (status in ('active','archived')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (created_by, request_id)
);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  course_id uuid references public.courses(id) on delete restrict,
  content_id uuid references public.study_content(id) on delete restrict,
  request_id uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  question text not null check (char_length(question) between 1 and 2000),
  answer text not null check (char_length(answer) between 1 and 8000),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  status text not null default 'active' check (status in ('active','completed','archived')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (actor_id, request_id)
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  course_id uuid references public.courses(id) on delete restrict,
  content_id uuid references public.study_content(id) on delete restrict,
  request_id uuid not null,
  request_hash text not null check (char_length(request_hash) = 64),
  question text not null check (char_length(question) between 1 and 2000),
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  score smallint not null check (score between 0 and 100),
  feedback text not null check (char_length(feedback) between 1 and 3000),
  status text not null default 'submitted' check (status in ('submitted','reviewed')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (actor_id, request_id)
);

create table if not exists public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  course_id uuid references public.courses(id) on delete restrict,
  content_id uuid references public.study_content(id) on delete restrict,
  progress_key uuid generated always as (coalesce(content_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored,
  completion smallint not null default 0 check (completion between 0 and 100),
  last_practiced_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (actor_id, progress_key)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  activity text not null check (activity in ('assistant','practice')),
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_id, request_id, activity)
);

create index if not exists study_content_course_recent_idx on public.study_content(course_id, created_at desc) where deleted_at is null;
create index if not exists study_content_org_recent_idx on public.study_content(organization_id, created_at desc) where deleted_at is null;
create index if not exists study_sessions_actor_recent_idx on public.study_sessions(actor_id, created_at desc) where deleted_at is null;
create index if not exists study_sessions_course_recent_idx on public.study_sessions(course_id, created_at desc) where deleted_at is null and course_id is not null;
create index if not exists practice_attempts_actor_recent_idx on public.practice_attempts(actor_id, created_at desc) where deleted_at is null;
create index if not exists practice_attempts_course_recent_idx on public.practice_attempts(course_id, created_at desc) where deleted_at is null and course_id is not null;
create index if not exists learning_progress_actor_recent_idx on public.learning_progress(actor_id, updated_at desc) where deleted_at is null;
create index if not exists learning_progress_course_recent_idx on public.learning_progress(course_id, updated_at desc) where deleted_at is null and course_id is not null;
create index if not exists ai_usage_actor_recent_idx on public.ai_usage_events(actor_id, created_at desc);

alter table public.study_content enable row level security;
alter table public.study_sessions enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.learning_progress enable row level security;
alter table public.ai_usage_events enable row level security;

drop policy if exists "read organization profile" on public.organizations;
create policy "read organization profile" on public.organizations for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = organizations.id and p.deleted_at is null)
);

drop policy if exists "read course study content" on public.study_content;
create policy "read course study content" on public.study_content for select to authenticated using (
  deleted_at is null and exists (
    select 1 from public.course_memberships m
    join public.profiles p on p.id = m.user_id
    where m.course_id = study_content.course_id and m.user_id = auth.uid()
      and p.organization_id = study_content.organization_id and p.deleted_at is null
      and ((p.role = 'student' and m.role = 'student') or (p.role in ('teacher','administrator') and m.role = 'teacher'))
  )
);

drop policy if exists "read own and assigned study sessions" on public.study_sessions;
create policy "read own and assigned study sessions" on public.study_sessions for select to authenticated using (
  deleted_at is null and (
    actor_id = auth.uid() or exists (
      select 1 from public.course_memberships m join public.profiles p on p.id = m.user_id
      where m.course_id = study_sessions.course_id and m.user_id = auth.uid() and m.role = 'teacher'
        and p.role in ('teacher','administrator') and p.organization_id = study_sessions.organization_id and p.deleted_at is null
    )
  )
);

drop policy if exists "read own and assigned practice" on public.practice_attempts;
create policy "read own and assigned practice" on public.practice_attempts for select to authenticated using (
  deleted_at is null and (
    actor_id = auth.uid() or exists (
      select 1 from public.course_memberships m join public.profiles p on p.id = m.user_id
      where m.course_id = practice_attempts.course_id and m.user_id = auth.uid() and m.role = 'teacher'
        and p.role in ('teacher','administrator') and p.organization_id = practice_attempts.organization_id and p.deleted_at is null
    )
  )
);

drop policy if exists "read own and assigned progress" on public.learning_progress;
create policy "read own and assigned progress" on public.learning_progress for select to authenticated using (
  deleted_at is null and (
    actor_id = auth.uid() or exists (
      select 1 from public.course_memberships m join public.profiles p on p.id = m.user_id
      where m.course_id = learning_progress.course_id and m.user_id = auth.uid() and m.role = 'teacher'
        and p.role in ('teacher','administrator') and p.organization_id = learning_progress.organization_id and p.deleted_at is null
    )
  )
);

drop policy if exists "read own ai usage" on public.ai_usage_events;
create policy "read own ai usage" on public.ai_usage_events for select to authenticated using (actor_id = auth.uid());

-- The Edge Function uses the service key only after verifying the user's JWT and enforcing ownership.
revoke all on public.study_content, public.study_sessions, public.practice_attempts, public.learning_progress, public.ai_usage_events from anon, authenticated;
grant select on public.study_content, public.study_sessions, public.practice_attempts, public.learning_progress, public.ai_usage_events to authenticated;
grant select, update (display_name, version, deleted_at) on public.profiles to authenticated;
-- Retire the prototype write path so clients cannot bypass the validated API contract.
drop policy if exists "insert own learning" on public.learning_records;
revoke insert, update, delete on public.learning_records from anon, authenticated;

-- Service-role-only atomic quota reservation. Retries with the same request ID do not consume a second slot.
create or replace function public.reserve_ai_usage(p_actor_id uuid, p_request_id uuid, p_activity text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  existing_status text;
  daily_count integer;
begin
  if p_activity not in ('assistant','practice') then return 'limited'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text || p_activity, 0));
  select e.status into existing_status from public.ai_usage_events e
    where e.actor_id = p_actor_id and e.request_id = p_request_id and e.activity = p_activity for update;
  if existing_status = 'completed' then return 'replay'; end if;
  if existing_status = 'reserved' and exists (
    select 1 from public.ai_usage_events e where e.actor_id = p_actor_id and e.request_id = p_request_id
      and e.activity = p_activity and e.updated_at > now() - interval '90 seconds'
  ) then return 'busy'; end if;
  if existing_status is not null then
    update public.ai_usage_events set status = 'reserved', updated_at = now(), created_at = now()
      where actor_id = p_actor_id and request_id = p_request_id and activity = p_activity;
    return 'reserved';
  end if;
  select count(*)::integer into daily_count from public.ai_usage_events e
    where e.actor_id = p_actor_id and e.created_at >= now() - interval '24 hours';
  if daily_count >= 30 then return 'limited'; end if;
  insert into public.ai_usage_events (actor_id, request_id, activity) values (p_actor_id, p_request_id, p_activity);
  return 'reserved';
end;
$$;
revoke all on function public.reserve_ai_usage(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, uuid, text) to service_role;

-- Recompute progress only from saved server-created sessions and attempts; never from client scores or flags.
create or replace function public.recalculate_learning_progress(p_actor_id uuid, p_content_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  activity_count integer;
  latest_activity timestamptz;
  org_id uuid;
  assigned_course uuid;
  computed_completion smallint;
begin
  select p.organization_id into org_id from public.profiles p where p.id = p_actor_id and p.deleted_at is null;
  if not found then return; end if;
  if p_content_id is not null then
    select c.organization_id, c.course_id into org_id, assigned_course from public.study_content c where c.id = p_content_id;
    if not found then return; end if;
  else
    assigned_course := null;
  end if;
  select (
    (select count(*) from public.study_sessions s where s.actor_id = p_actor_id and s.content_id is not distinct from p_content_id and s.deleted_at is null)
    + (select count(*) from public.practice_attempts a where a.actor_id = p_actor_id and a.content_id is not distinct from p_content_id and a.deleted_at is null)
  )::integer into activity_count;
  select max(stamp) into latest_activity from (
    select s.created_at as stamp from public.study_sessions s where s.actor_id = p_actor_id and s.content_id is not distinct from p_content_id and s.deleted_at is null
    union all
    select a.created_at as stamp from public.practice_attempts a where a.actor_id = p_actor_id and a.content_id is not distinct from p_content_id and a.deleted_at is null
  ) activities;
  computed_completion := least(100, activity_count * 20)::smallint;
  insert into public.learning_progress (actor_id, organization_id, course_id, content_id, completion, last_practiced_at, status, updated_at)
  values (p_actor_id, org_id, assigned_course, p_content_id, computed_completion, latest_activity,
    case when computed_completion = 100 then 'completed' else 'in_progress' end, now())
  on conflict (actor_id, progress_key) do update set
    organization_id = excluded.organization_id, course_id = excluded.course_id, completion = excluded.completion,
    last_practiced_at = excluded.last_practiced_at,
    status = case when public.learning_progress.status = 'completed' then 'completed' else 'in_progress' end,
    deleted_at = null, updated_at = now(), version = public.learning_progress.version + 1;
end;
$$;
revoke all on function public.recalculate_learning_progress(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recalculate_learning_progress(uuid, uuid) to service_role;

create or replace function public.refresh_my_learning_progress(p_content_id uuid default null)
returns setof public.learning_progress language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_content_id is not null and not exists (
    select 1 from public.study_content c join public.course_memberships m on m.course_id = c.course_id
    join public.profiles p on p.id = auth.uid()
    where c.id = p_content_id and c.deleted_at is null and c.organization_id = p.organization_id
      and m.user_id = auth.uid() and m.role = 'student' and p.role = 'student' and p.deleted_at is null
  ) then raise exception 'content access denied' using errcode = '42501'; end if;
  perform public.recalculate_learning_progress(auth.uid(), p_content_id);
  return query select * from public.learning_progress lp where lp.actor_id = auth.uid()
    and lp.progress_key = coalesce(p_content_id, '00000000-0000-0000-0000-000000000000'::uuid) and lp.deleted_at is null;
end;
$$;
revoke all on function public.refresh_my_learning_progress(uuid) from public, anon;
grant execute on function public.refresh_my_learning_progress(uuid) to authenticated;

create or replace function public.refresh_learning_progress_after_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_learning_progress(old.actor_id, old.content_id);
    return old;
  end if;
  perform public.recalculate_learning_progress(new.actor_id, new.content_id);
  if tg_op = 'UPDATE' and (old.actor_id, old.content_id) is distinct from (new.actor_id, new.content_id) then
    perform public.recalculate_learning_progress(old.actor_id, old.content_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_progress_for_study_session on public.study_sessions;
create trigger refresh_progress_for_study_session after insert or update of deleted_at or delete on public.study_sessions
for each row execute function public.refresh_learning_progress_after_activity();
drop trigger if exists refresh_progress_for_practice_attempt on public.practice_attempts;
create trigger refresh_progress_for_practice_attempt after insert or update of deleted_at or delete on public.practice_attempts
for each row execute function public.refresh_learning_progress_after_activity();

-- Private note storage. Paths are organization_id/course_id/file-name.
insert into storage.buckets (id, name, public) values ('course-notes','course-notes',false)
on conflict (id) do update set public = false;
drop policy if exists "read notes for course members" on storage.objects;
create policy "read notes for course members" on storage.objects for select to authenticated using (
  bucket_id = 'course-notes' and exists (
    select 1 from public.courses c join public.course_memberships m on m.course_id = c.id
    join public.profiles p on p.id = m.user_id
    where c.id::text = (storage.foldername(name))[2] and c.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = auth.uid() and p.organization_id = c.organization_id and p.deleted_at is null
      and ((p.role = 'student' and m.role = 'student') or (p.role in ('teacher','administrator') and m.role = 'teacher'))
  )
);
drop policy if exists "teachers upload course notes" on storage.objects;
create policy "teachers upload course notes" on storage.objects for insert to authenticated with check (
  bucket_id = 'course-notes' and exists (
    select 1 from public.courses c join public.course_memberships m on m.course_id = c.id
    join public.profiles p on p.id = m.user_id
    where c.id::text = (storage.foldername(name))[2] and c.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = auth.uid() and m.role = 'teacher' and p.role in ('teacher','administrator')
      and p.organization_id = c.organization_id and p.deleted_at is null
  )
);
drop policy if exists "teachers update course notes" on storage.objects;
create policy "teachers update course notes" on storage.objects for update to authenticated using (
  bucket_id = 'course-notes' and exists (
    select 1 from public.courses c join public.course_memberships m on m.course_id = c.id
    join public.profiles p on p.id = m.user_id
    where c.id::text = (storage.foldername(name))[2] and c.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = auth.uid() and m.role = 'teacher' and p.role in ('teacher','administrator')
      and p.organization_id = c.organization_id and p.deleted_at is null
  )
) with check (
  bucket_id = 'course-notes' and exists (
    select 1 from public.courses c join public.course_memberships m on m.course_id = c.id
    join public.profiles p on p.id = m.user_id
    where c.id::text = (storage.foldername(name))[2] and c.organization_id::text = (storage.foldername(name))[1]
      and m.user_id = auth.uid() and m.role = 'teacher' and p.role in ('teacher','administrator')
      and p.organization_id = c.organization_id and p.deleted_at is null
  )
);
