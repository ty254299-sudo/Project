-- Keep provider attempts bounded and record actual provider usage for evaluation.
alter table public.ai_usage_events
  add column if not exists attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  add column if not exists reserved_tokens integer not null default 0 check (reserved_tokens between 0 and 20000),
  add column if not exists input_tokens integer check (input_tokens >= 0),
  add column if not exists output_tokens integer check (output_tokens >= 0),
  add column if not exists latency_ms integer check (latency_ms >= 0),
  add column if not exists model text,
  add column if not exists estimated_cost_usd numeric(12,8) check (estimated_cost_usd >= 0);

drop function if exists public.reserve_ai_usage(uuid, uuid, text);
create or replace function public.reserve_ai_usage(p_actor_id uuid, p_request_id uuid, p_activity text, p_estimated_tokens integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  existing_status text;
  attempts smallint;
  daily_count integer;
  daily_tokens bigint;
begin
  if p_activity not in ('assistant','practice') or p_estimated_tokens < 1 or p_estimated_tokens > 6000 then return 'limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || p_request_id::text, 0));
  if exists (select 1 from public.ai_usage_events e where e.actor_id = p_actor_id and e.request_id = p_request_id and e.activity <> p_activity) then
    return 'key_conflict';
  end if;
  select e.status, e.attempt_count into existing_status, attempts from public.ai_usage_events e
    where e.actor_id = p_actor_id and e.request_id = p_request_id and e.activity = p_activity for update;
  if existing_status = 'completed' then return 'replay'; end if;
  if existing_status = 'reserved' and exists (
    select 1 from public.ai_usage_events e where e.actor_id = p_actor_id and e.request_id = p_request_id
      and e.activity = p_activity and e.updated_at > now() - interval '90 seconds'
  ) then return 'busy'; end if;
  if coalesce(attempts, 0) >= 3 then return 'attempt_limit'; end if;
  select count(*)::integer,
    coalesce(sum(coalesce(e.input_tokens,0) + coalesce(e.output_tokens,0) + e.reserved_tokens), 0)::bigint
    into daily_count, daily_tokens
    from public.ai_usage_events e where e.actor_id = p_actor_id and e.created_at >= now() - interval '24 hours';
  if daily_count >= 30 then return 'request_limit'; end if;
  if daily_tokens + p_estimated_tokens + 700 > 20000 then return 'token_limit'; end if;
  if existing_status is not null then
    update public.ai_usage_events set status = 'reserved', updated_at = now(), created_at = now(),
      attempt_count = attempt_count + 1, reserved_tokens = reserved_tokens + p_estimated_tokens + 700
      where actor_id = p_actor_id and request_id = p_request_id and activity = p_activity;
    return 'reserved';
  end if;
  insert into public.ai_usage_events (actor_id, request_id, activity, attempt_count, reserved_tokens)
    values (p_actor_id, p_request_id, p_activity, 1, p_estimated_tokens + 700);
  return 'reserved';
end;
$$;
revoke all on function public.reserve_ai_usage(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, uuid, text, integer) to service_role;

create or replace function public.finish_ai_usage(
  p_actor_id uuid, p_request_id uuid, p_activity text, p_status text,
  p_input_tokens integer, p_output_tokens integer, p_latency_ms integer,
  p_model text, p_estimated_cost_usd numeric
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('completed','failed') then return; end if;
  update public.ai_usage_events set
    status = p_status,
    updated_at = now(),
    input_tokens = coalesce(input_tokens,0) + coalesce(p_input_tokens,0),
    output_tokens = coalesce(output_tokens,0) + coalesce(p_output_tokens,0),
    latency_ms = coalesce(latency_ms,0) + coalesce(p_latency_ms,0),
    model = coalesce(p_model,model),
    estimated_cost_usd = case when p_estimated_cost_usd is null then estimated_cost_usd else coalesce(estimated_cost_usd,0) + p_estimated_cost_usd end,
    reserved_tokens = case when p_input_tokens is not null and p_output_tokens is not null then 0 else reserved_tokens end
  where actor_id = p_actor_id and request_id = p_request_id and activity = p_activity;
end;
$$;
revoke all on function public.finish_ai_usage(uuid, uuid, text, text, integer, integer, integer, text, numeric) from public, anon, authenticated;
grant execute on function public.finish_ai_usage(uuid, uuid, text, text, integer, integer, integer, text, numeric) to service_role;
