-- =============================================================================
-- Minha Musica IA - schema inicial
-- =============================================================================
-- Convencoes:
--   * Valores monetarios do produto ficam em CENTAVOS (integer) para evitar
--     qualquer erro de ponto flutuante em cobranca.
--   * Custos de IA ficam em numeric(14,6) porque sao fracoes de centavo.
--   * Todo timestamp e timestamptz em UTC.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type order_status as enum (
  'DRAFT',
  'STORY_RECEIVED',
  'STORY_PROCESSING',
  'STORY_PROCESSED',
  'PREVIEW_QUEUED',
  'PREVIEW_GENERATING',
  'PREVIEW_READY',
  'AWAITING_PAYMENT',
  'PAYMENT_PROCESSING',
  'PAID',
  'FULL_SONG_QUEUED',
  'FULL_SONG_GENERATING',
  'FULL_SONG_READY',
  'DELIVERY_PENDING',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'REFUNDED'
);

create type generation_type as enum ('PREVIEW', 'FULL');

create type generation_status as enum (
  'QUEUED',
  'RUNNING',
  'READY',
  'FAILED',
  'CANCELLED'
);

create type payment_status as enum (
  'PENDING',
  'IN_PROCESS',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
  'CHARGED_BACK'
);

create type job_type as enum (
  'PROCESS_STORY',
  'GENERATE_PREVIEW',
  'GENERATE_FULL_SONG',
  'SEND_DELIVERY',
  'SEND_NOTIFICATION'
);

create type job_status as enum ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

create type notification_channel as enum ('EMAIL', 'WHATSAPP', 'SMS');

create type notification_status as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- -----------------------------------------------------------------------------
-- Helper: updated_at automatico
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  -- Consentimentos LGPD registrados no momento do envio do formulario.
  accepted_terms_at timestamptz,
  accepted_privacy_at timestamptz,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_email_check check (position('@' in email) > 1),
  constraint customers_name_len check (char_length(name) between 1 and 120)
);

create unique index customers_email_key on customers (lower(email));
create index customers_phone_idx on customers (phone);
create index customers_created_at_idx on customers (created_at desc);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,

  -- Token publico usado nas paginas de preview/checkout (nao adivinhavel).
  public_token text not null,
  -- Token separado, emitido apenas apos o pagamento, para a pagina de entrega.
  delivery_token text,

  status order_status not null default 'DRAFT',
  plan text not null default 'STANDARD',

  occasion text not null,
  recipient_name text not null,
  relationship text not null,
  music_style text not null,
  voice_preference text not null default 'SURPRESA',
  emotional_tone text not null,

  -- Preco travado no servidor no momento da criacao do pedido.
  amount_cents integer not null default 0,
  currency text not null default 'BRL',

  -- Contadores de seguranca contra geracao duplicada.
  preview_generation_count integer not null default 0,
  full_generation_count integer not null default 0,

  admin_flagged boolean not null default false,
  admin_notes text,
  is_seed boolean not null default false,

  last_error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz,

  constraint orders_amount_check check (amount_cents >= 0),
  constraint orders_currency_check check (char_length(currency) = 3),
  constraint orders_recipient_len check (char_length(recipient_name) between 1 and 80)
);

create unique index orders_public_token_key on orders (public_token);
create unique index orders_delivery_token_key on orders (delivery_token) where delivery_token is not null;
create index orders_customer_idx on orders (customer_id);
create index orders_status_idx on orders (status);
create index orders_created_at_idx on orders (created_at desc);
create index orders_paid_at_idx on orders (paid_at desc) where paid_at is not null;
create index orders_style_idx on orders (music_style);
create index orders_seed_idx on orders (is_seed) where is_seed = true;

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- song_requests  (1:1 com orders)
-- -----------------------------------------------------------------------------
create table song_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders (id) on delete cascade,

  original_story text not null,
  special_details jsonb not null default '{}'::jsonb,
  mandatory_phrase text,

  -- Saida estruturada e validada do LLM.
  structured_story jsonb,
  lyrics text,
  music_direction text,
  music_generation_prompt text,
  story_summary text,

  llm_provider text,
  llm_model text,
  -- Custo da interpretação da história, para o cálculo de margem do painel.
  llm_input_tokens integer,
  llm_output_tokens integer,
  llm_estimated_cost numeric(14,6),
  llm_cost_currency text not null default 'USD',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint song_requests_story_len check (char_length(original_story) between 30 and 8000)
);

create index song_requests_order_idx on song_requests (order_id);

create trigger song_requests_set_updated_at
  before update on song_requests
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- generations
-- -----------------------------------------------------------------------------
create table generations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,

  type generation_type not null,
  status generation_status not null default 'QUEUED',

  provider text not null,
  provider_generation_id text,
  model text,
  operation text,

  prompt text,
  lyrics text,

  -- Caminho no bucket privado. A URL publica nunca e persistida.
  storage_path text,
  audio_mime_type text,
  audio_size_bytes bigint,
  duration_seconds numeric(8,2),

  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  error_message text,

  tokens_used integer,
  estimated_cost numeric(14,6),
  actual_cost numeric(14,6),
  cost_currency text not null default 'USD',

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  constraint generations_attempts_check check (attempt_count >= 0 and attempt_count <= 20)
);

create index generations_order_idx on generations (order_id);
create index generations_status_idx on generations (status);
create index generations_type_idx on generations (order_id, type);
create index generations_created_at_idx on generations (created_at desc);

-- Trava definitiva contra cobranca/geracao duplicada: no maximo UMA geracao
-- viva (QUEUED/RUNNING/READY) por pedido e por tipo. Regeneracoes
-- administrativas exigem cancelar/falhar a anterior primeiro.
create unique index generations_one_alive_per_type
  on generations (order_id, type)
  where status in ('QUEUED', 'RUNNING', 'READY');

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,

  provider text not null default 'mercadopago',
  provider_payment_id text not null,
  method text,
  status payment_status not null default 'PENDING',
  raw_status text,
  status_detail text,

  amount_cents integer not null,
  currency text not null default 'BRL',

  -- Dados nao sensiveis para exibir o PIX. Nunca guardamos dados de cartao.
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_expires_at timestamptz,
  checkout_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,

  constraint payments_amount_check check (amount_cents > 0)
);

create unique index payments_provider_payment_key on payments (provider, provider_payment_id);
create index payments_order_idx on payments (order_id);
create index payments_status_idx on payments (status);
create index payments_created_at_idx on payments (created_at desc);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- webhook_events  (idempotencia de webhooks de qualquer provider)
-- -----------------------------------------------------------------------------
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  -- Chave deterministica do evento. O unique abaixo garante processamento unico.
  event_key text not null,
  event_type text,
  signature_valid boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

create unique index webhook_events_provider_key on webhook_events (provider, event_key);
create index webhook_events_created_at_idx on webhook_events (created_at desc);

-- -----------------------------------------------------------------------------
-- order_events  (timeline auditavel do pedido)
-- -----------------------------------------------------------------------------
create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);

create index order_events_order_idx on order_events (order_id, created_at desc);
create index order_events_type_idx on order_events (event_type);

-- -----------------------------------------------------------------------------
-- notification_events
-- -----------------------------------------------------------------------------
create table notification_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  channel notification_channel not null,
  event_type text not null,
  status notification_status not null default 'PENDING',
  provider text,
  provider_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notification_events_order_idx on notification_events (order_id, created_at desc);
create index notification_events_status_idx on notification_events (status);
-- Evita reenviar a mesma notificacao para o mesmo pedido/canal.
create unique index notification_events_unique_sent
  on notification_events (order_id, channel, event_type)
  where status = 'SENT';

-- -----------------------------------------------------------------------------
-- jobs  (fila simples, processada por worker/cron)
-- -----------------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  type job_type not null,
  status job_status not null default 'PENDING',
  order_id uuid references orders (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,

  -- Chave opcional de deduplicacao (ex.: full-song:<order_id>).
  dedupe_key text,

  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,

  run_after timestamptz not null default now(),
  next_retry_at timestamptz,
  locked_at timestamptz,
  locked_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index jobs_dedupe_key_active
  on jobs (dedupe_key)
  where dedupe_key is not null and status in ('PENDING', 'RUNNING');
create index jobs_claim_idx on jobs (status, run_after);
create index jobs_order_idx on jobs (order_id);

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- order_attribution  (UTM / click ids)
-- -----------------------------------------------------------------------------
create table order_attribution (
  order_id uuid primary key references orders (id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  ttclid text,
  gclid text,
  landing_path text,
  referrer text,
  created_at timestamptz not null default now()
);

create index order_attribution_source_idx on order_attribution (utm_source, utm_campaign);

-- -----------------------------------------------------------------------------
-- analytics_events  (funil, first-party)
-- -----------------------------------------------------------------------------
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  order_id uuid references orders (id) on delete set null,
  anonymous_id text,
  properties jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_name_idx on analytics_events (event_name, created_at desc);
create index analytics_events_order_idx on analytics_events (order_id);
create index analytics_events_created_at_idx on analytics_events (created_at desc);

-- -----------------------------------------------------------------------------
-- app_settings  (configuracao operacional, sem valores fixos no codigo)
-- -----------------------------------------------------------------------------
create table app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- rate_limits  (janela fixa, compartilhada entre instancias serverless)
-- -----------------------------------------------------------------------------
create table rate_limits (
  bucket text not null,
  identifier text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, identifier, window_start)
);

create index rate_limits_window_idx on rate_limits (window_start);

create or replace function increment_rate_limit(
  p_bucket text,
  p_identifier text,
  p_window_start timestamptz
)
returns integer
language plpgsql
as $$
declare
  v_hits integer;
begin
  insert into rate_limits (bucket, identifier, window_start, hits)
  values (p_bucket, p_identifier, p_window_start, 1)
  on conflict (bucket, identifier, window_start)
  do update set hits = rate_limits.hits + 1
  returning hits into v_hits;

  return v_hits;
end;
$$;
