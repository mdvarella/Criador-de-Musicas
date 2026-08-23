import type {
  GenerationStatus,
  GenerationType,
  JobStatus,
  JobType,
  Json,
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  PaymentStatus,
} from './domain';

/**
 * Tipagem do schema para o supabase-js.
 * Mantida à mão e alinhada com `supabase/migrations`.
 */

type Timestamps = { created_at: string };

export type CustomerRow = Timestamps & {
  id: string;
  name: string;
  /** Opcional: parte do público não usa e-mail. A identidade é o telefone. */
  email: string | null;
  phone: string;
  accepted_terms_at: string | null;
  accepted_privacy_at: string | null;
  marketing_opt_in: boolean;
  updated_at: string;
};

export type OrderRow = Timestamps & {
  id: string;
  customer_id: string;
  public_token: string;
  delivery_token: string | null;
  status: OrderStatus;
  plan: string;
  occasion: string;
  recipient_name: string;
  relationship: string;
  music_style: string;
  voice_preference: string;
  emotional_tone: string;
  amount_cents: number;
  currency: string;
  preview_generation_count: number;
  full_generation_count: number;
  admin_flagged: boolean;
  admin_notes: string | null;
  is_seed: boolean;
  last_error_message: string | null;
  updated_at: string;
  paid_at: string | null;
  delivered_at: string | null;
};

export type SongRequestRow = Timestamps & {
  id: string;
  order_id: string;
  original_story: string;
  special_details: Record<string, Json>;
  mandatory_phrase: string | null;
  structured_story: Json | null;
  lyrics: string | null;
  music_direction: string | null;
  music_generation_prompt: string | null;
  story_summary: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  llm_input_tokens: number | null;
  llm_output_tokens: number | null;
  llm_estimated_cost: number | null;
  llm_cost_currency: string;
  updated_at: string;
};

export type GenerationRow = Timestamps & {
  id: string;
  order_id: string;
  type: GenerationType;
  status: GenerationStatus;
  provider: string;
  provider_generation_id: string | null;
  model: string | null;
  operation: string | null;
  prompt: string | null;
  lyrics: string | null;
  storage_path: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  cost_currency: string;
  started_at: string | null;
  finished_at: string | null;
};

export type PaymentRow = Timestamps & {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string;
  method: string | null;
  status: PaymentStatus;
  raw_status: string | null;
  status_detail: string | null;
  amount_cents: number;
  currency: string;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_expires_at: string | null;
  checkout_url: string | null;
  updated_at: string;
  approved_at: string | null;
};

export type WebhookEventRow = Timestamps & {
  id: string;
  provider: string;
  event_key: string;
  event_type: string | null;
  signature_valid: boolean;
  payload: Json;
  processed_at: string | null;
  processing_error: string | null;
};

export type OrderEventRow = Timestamps & {
  id: string;
  order_id: string;
  event_type: string;
  message: string | null;
  metadata: Json;
  actor: string;
};

export type NotificationEventRow = Timestamps & {
  id: string;
  order_id: string;
  channel: NotificationChannel;
  event_type: string;
  status: NotificationStatus;
  provider: string | null;
  provider_id: string | null;
  error_message: string | null;
  sent_at: string | null;
};

export type JobRow = Timestamps & {
  id: string;
  type: JobType;
  status: JobStatus;
  order_id: string | null;
  payload: Record<string, Json>;
  dedupe_key: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  run_after: string;
  next_retry_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
  updated_at: string;
  finished_at: string | null;
};

export type OrderAttributionRow = Timestamps & {
  order_id: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  ttclid: string | null;
  gclid: string | null;
  landing_path: string | null;
  referrer: string | null;
};

export type AnalyticsEventRow = Timestamps & {
  id: string;
  event_name: string;
  order_id: string | null;
  anonymous_id: string | null;
  properties: Json;
  utm: Json;
};

export type AppSettingRow = {
  key: string;
  value: Json;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type TableDef<Row, Rel extends Relationship[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Rel;
};

/** Relação usada nos joins do painel: pedido -> cliente. */
type OrderToCustomer = [
  {
    foreignKeyName: 'orders_customer_id_fkey';
    columns: ['customer_id'];
    isOneToOne: false;
    referencedRelation: 'customers';
    referencedColumns: ['id'];
  },
];

type BelongsToOrder<Name extends string, OneToOne extends boolean = false> = [
  {
    foreignKeyName: Name;
    columns: ['order_id'];
    isOneToOne: OneToOne;
    referencedRelation: 'orders';
    referencedColumns: ['id'];
  },
];

export type Database = {
  public: {
    Tables: {
      customers: TableDef<CustomerRow>;
      orders: TableDef<OrderRow, OrderToCustomer>;
      song_requests: TableDef<SongRequestRow, BelongsToOrder<'song_requests_order_id_fkey', true>>;
      generations: TableDef<GenerationRow, BelongsToOrder<'generations_order_id_fkey'>>;
      payments: TableDef<PaymentRow, BelongsToOrder<'payments_order_id_fkey'>>;
      webhook_events: TableDef<WebhookEventRow>;
      order_events: TableDef<OrderEventRow, BelongsToOrder<'order_events_order_id_fkey'>>;
      notification_events: TableDef<NotificationEventRow, BelongsToOrder<'notification_events_order_id_fkey'>>;
      jobs: TableDef<JobRow>;
      order_attribution: TableDef<OrderAttributionRow, BelongsToOrder<'order_attribution_order_id_fkey', true>>;
      analytics_events: TableDef<AnalyticsEventRow>;
      app_settings: TableDef<AppSettingRow>;
      rate_limits: TableDef<{
        bucket: string;
        identifier: string;
        window_start: string;
        hits: number;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      claim_jobs: { Args: { p_worker: string; p_limit: number }; Returns: JobRow[] };
      requeue_stuck_jobs: { Args: { p_timeout_minutes: number }; Returns: number };
      prune_rate_limits: { Args: { p_older_than_hours: number }; Returns: number };
      increment_rate_limit: {
        Args: { p_bucket: string; p_identifier: string; p_window_start: string };
        Returns: number;
      };
    };
    Enums: {
      order_status: OrderStatus;
      generation_type: GenerationType;
      generation_status: GenerationStatus;
      payment_status: PaymentStatus;
      job_type: JobType;
      job_status: JobStatus;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
