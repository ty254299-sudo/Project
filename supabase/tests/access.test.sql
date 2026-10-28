create extension if not exists pgtap with schema extensions;

begin;
select plan(17);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'student-a@example.test', '', now(), '{}'::jsonb, '{"display_name":"Student A"}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'student-b@example.test', '', now(), '{}'::jsonb, '{"display_name":"Student B"}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'teacher-a@example.test', '', now(), '{}'::jsonb, '{"display_name":"Teacher A"}'::jsonb, now(), now());

insert into public.organizations (id, name) values
  ('20000000-0000-4000-8000-000000000001', 'Organization A'),
  ('20000000-0000-4000-8000-000000000002', 'Organization B');

update public.profiles set organization_id = '20000000-0000-4000-8000-000000000001'
where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
update public.profiles set organization_id = '20000000-0000-4000-8000-000000000002'
where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set role = 'teacher' where id = '10000000-0000-4000-8000-000000000003';

insert into public.courses (id, organization_id, title) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Course A'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Course B');
insert into public.course_memberships (course_id, user_id, role) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'student'),
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'teacher'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'student');

insert into public.study_content (id, organization_id, course_id, created_by, request_id, request_hash, title, subject, source_type, storage_path)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', repeat('a',64), 'Note A', 'Biology', 'text', '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001/note-a.txt'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', repeat('b',64), 'Note B', 'Physics', 'text', '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002/note-b.txt');

insert into public.study_sessions (id, actor_id, organization_id, course_id, content_id, request_id, request_hash, question, answer)
values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', repeat('c',64), 'Question A', 'Answer A'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', repeat('d',64), 'Question B', 'Answer B');

insert into public.practice_attempts (id, actor_id, organization_id, course_id, content_id, request_id, request_hash, question, answers, score, feedback)
values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', repeat('e',64), 'Question A', '["Answer A"]', 80, 'Feedback A'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', repeat('f',64), 'Question B', '["Answer B"]', 70, 'Feedback B');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.study_content), 1::bigint, 'student reads only notes in assigned course');
select is((select count(*) from public.study_sessions), 1::bigint, 'student reads own session');
select is((select count(*) from public.practice_attempts), 1::bigint, 'student reads own practice');
select is((select count(*) from public.learning_progress), 1::bigint, 'student reads own progress');
select is((select completion from public.learning_progress where content_id = '40000000-0000-4000-8000-000000000001'), 40::smallint, 'saved question and practice answer each advance server progress');
select is((select count(*) from public.study_sessions where owner_id = '10000000-0000-4000-8000-000000000002'), 0::bigint, 'student cannot read another tenant session');
select throws_ok($$ update public.profiles set role = 'administrator' where id = '10000000-0000-4000-8000-000000000001' $$, '42501', null, 'student cannot update a trusted role');
select throws_ok($$ insert into public.learning_progress (actor_id, owner_id, completion) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 100) $$, '42501', null, 'student cannot write client-supplied progress');
select throws_ok($$ update public.study_sessions set answer = 'forged' where id = '60000000-0000-4000-8000-000000000001' $$, '42501', null, 'student cannot replace a validated answer');
update public.profiles set current_skills = array['biology'] where id = '10000000-0000-4000-8000-000000000001';
select is((select current_skills[1] from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 'biology', 'student can save user-confirmed profile skills');
select ok((select version > 1 from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 'profile updates advance the version automatically');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.study_content), 1::bigint, 'second student reads only their own course notes');
select is((select count(*) from public.study_sessions where owner_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'second student cannot read first student session');
select is((select completion from public.learning_progress where content_id = '40000000-0000-4000-8000-000000000002'), 40::smallint, 'second student receives only their own computed progress');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.study_sessions), 1::bigint, 'assigned teacher reads course sessions');
select is((select count(*) from public.practice_attempts), 1::bigint, 'assigned teacher reads course practice');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select * from public.study_sessions $$, '42501', null, 'signed-out caller cannot read sessions');

reset role;
select * from finish();
rollback;
