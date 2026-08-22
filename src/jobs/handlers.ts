import 'server-only';
import { AppError } from '@/lib/errors';
import { deliverOrder } from '@/services/delivery-service';
import { sendOrderNotification } from '@/services/notification-service';
import { generateFullSong, generatePreview } from '@/services/song-service';
import { processStory } from '@/services/story-service';
import type { JobRow } from '@/types/database';
import type { JobType, NotificationEventType } from '@/types/domain';

/** Cada tipo de job tem exatamente um handler. */
export type JobHandler = (job: JobRow) => Promise<void>;

function requireOrderId(job: JobRow): string {
  if (!job.order_id) {
    throw new AppError('VALIDATION_ERROR', `job ${job.id} do tipo ${job.type} exige order_id`, {
      retryable: false,
    });
  }
  return job.order_id;
}

export const JOB_HANDLERS: Record<JobType, JobHandler> = {
  PROCESS_STORY: async (job) => {
    await processStory(requireOrderId(job));
  },

  GENERATE_PREVIEW: async (job) => {
    await generatePreview(requireOrderId(job));
  },

  GENERATE_FULL_SONG: async (job) => {
    await generateFullSong(requireOrderId(job));
  },

  SEND_DELIVERY: async (job) => {
    await deliverOrder(requireOrderId(job));
  },

  SEND_NOTIFICATION: async (job) => {
    const eventType = job.payload.event_type;
    if (typeof eventType !== 'string') {
      throw new AppError('VALIDATION_ERROR', `job ${job.id} sem event_type`, { retryable: false });
    }
    await sendOrderNotification(requireOrderId(job), eventType as NotificationEventType);
  },
};
