-- =============================================================================
-- Minha Musica IA - Row Level Security + funcoes operacionais
-- =============================================================================
-- Modelo de acesso do MVP:
--   * O cliente NAO autentica. Ele acessa o pedido por um token nao adivinhavel,
--     e toda leitura passa por rotas de servidor que filtram os campos expostos.
--   * O painel /admin autentica via Supabase Auth, mas as consultas continuam
--     sendo feitas no servidor com a service role APOS a checagem de permissao.
--   * Logo: nenhuma tabela recebe policy para anon/authenticated. RLS ligado sem
--     policy = negado por padrao. Somente a service role (que ignora RLS)
--     enxerga os dados.
-- =============================================================================

alter table customers            enable row level security;
alter table orders               enable row level security;
alter table song_requests        enable row level security;
alter table generations          enable row level security;
alter table payments             enable row level security;
alter table webhook_events       enable row level security;
alter table order_events         enable row level security;
alter table notification_events  enable row level security;
alter table jobs                 enable row level security;
alter table order_attribution    enable row level security;
alter table analytics_events     enable row level security;
alter table app_settings         enable row level security;
alter table rate_limits          enable row level security;

-- Bloqueio explicito e redundante: mesmo que alguem crie uma policy permissiva
-- por engano no futuro, revogamos os grants dos papeis publicos.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Claim atomico de jobs
-- -----------------------------------------------------------------------------
-- Usa SKIP LOCKED para que multiplas execucoes simultaneas do worker (cron da
-- Vercel + disparo manual, por exemplo) nunca peguem o mesmo job.
create or replace function claim_jobs(p_worker text, p_limit integer default 3)
returns setof jobs
language plpgsql
as $$
begin
  return query
  with picked as (
    select id
    from jobs
    where status = 'PENDING'
      and run_after <= now()
    order by run_after asc
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update jobs j
  set status = 'RUNNING',
      locked_at = now(),
      locked_by = p_worker,
      attempt_count = j.attempt_count + 1
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recuperacao de jobs travados (worker morreu no meio)
-- -----------------------------------------------------------------------------
create or replace function requeue_stuck_jobs(p_timeout_minutes integer default 15)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with reset as (
    update jobs
    set status = case
          when attempt_count >= max_attempts then 'FAILED'::job_status
          else 'PENDING'::job_status
        end,
        locked_at = null,
        locked_by = null,
        last_error = coalesce(last_error, 'worker timeout'),
        run_after = now(),
        finished_at = case when attempt_count >= max_attempts then now() else null end
    where status = 'RUNNING'
      and locked_at < now() - make_interval(mins => greatest(p_timeout_minutes, 1))
    returning 1
  )
  select count(*) into v_count from reset;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Limpeza da tabela de rate limit (chamada pelo worker)
-- -----------------------------------------------------------------------------
create or replace function prune_rate_limits(p_older_than_hours integer default 24)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with removed as (
    delete from rate_limits
    where window_start < now() - make_interval(hours => greatest(p_older_than_hours, 1))
    returning 1
  )
  select count(*) into v_count from removed;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para os audios
-- -----------------------------------------------------------------------------
-- O bucket e PRIVADO. Nenhum audio tem URL publica; o preview e servido por
-- rota assinada e a musica completa so e liberada apos o pagamento aprovado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'songs',
  'songs',
  false,
  52428800, -- 50 MB
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
