/** Tipos de domínio compartilhados entre banco, serviços e interface. */

export const ORDER_STATUSES = [
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
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const GENERATION_TYPES = ['PREVIEW', 'FULL'] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

export const GENERATION_STATUSES = ['QUEUED', 'RUNNING', 'READY', 'FAILED', 'CANCELLED'] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'IN_PROCESS',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
  'CHARGED_BACK',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const JOB_TYPES = [
  'PROCESS_STORY',
  'GENERATE_PREVIEW',
  'GENERATE_FULL_SONG',
  'SEND_DELIVERY',
  'SEND_NOTIFICATION',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['EMAIL', 'WHATSAPP', 'SMS'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_EVENTS = [
  'preview_ready',
  'payment_approved',
  'song_generating',
  'song_ready',
  'generation_failed',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number];

export const PLANS = ['STANDARD', 'PREMIUM'] as const;
export type Plan = (typeof PLANS)[number];

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
