-- Minimal persistence for course-note Q&A and practice answers.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  role text not null default 'student' check (role in ('student','teacher','administrator')),
  created_at timestamptz not null default now()
);

create or replace function public.create_student_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role) values (new.id, 'student') on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists create_profile_for_new_user on auth.users;
create trigger create_profile_for_new_user after insert on auth.users
for each row execute function public.create_student_profile();

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.course_memberships (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('student','teacher')),
  primary key (course_id, user_id)
);

create table if not exists public.learning_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  kind text not null check (kind in ('question','quiz')),
  request_id uuid not null,
  prompt text not null check (char_length(prompt) between 1 and 2000),
  source_text text not null check (char_length(source_text) between 1 and 12000),
  response text not null,
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);

create index if not exists learning_records_owner_recent_idx on public.learning_records(user_id, created_at desc);
create index if not exists learning_records_course_recent_idx on public.learning_records(course_id, created_at desc) where course_id is not null;
create index if not exists course_memberships_user_course_idx on public.course_memberships(user_id, course_id, role);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.courses enable row level security;
alter table public.course_memberships enable row level security;
alter table public.learning_records enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "read courses by membership" on public.courses;
create policy "read courses by membership" on public.courses for select to authenticated using (
  exists (select 1 from public.course_memberships m where m.course_id = courses.id and m.user_id = auth.uid())
);
drop policy if exists "read own membership" on public.course_memberships;
create policy "read own membership" on public.course_memberships for select to authenticated using (user_id = auth.uid());
drop policy if exists "read own progress" on public.learning_records;
create policy "read own progress" on public.learning_records for select to authenticated using (user_id = auth.uid());
drop policy if exists "read assigned course progress" on public.learning_records;
create policy "read assigned course progress" on public.learning_records for select to authenticated using (
  course_id is not null and exists (
    select 1 from public.course_memberships m where m.course_id = learning_records.course_id
      and m.user_id = auth.uid() and m.role = 'teacher'
  )
);
drop policy if exists "insert own learning" on public.learning_records;
create policy "insert own learning" on public.learning_records for insert to authenticated with check (user_id = auth.uid());

-- Profile role / organization and course membership changes are trusted admin operations.
revoke insert, update, delete on public.profiles, public.courses, public.course_memberships from anon, authenticated;
grant select on public.profiles, public.courses, public.course_memberships to authenticated;
grant select on public.organizations to authenticated;
grant select, insert on public.learning_records to authenticated;
grant usage, select on all sequences in schema public to authenticated;
