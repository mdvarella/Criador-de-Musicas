import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { SongRequestRow } from '@/types/database';
import type { Json } from '@/types/domain';
import { unwrap, unwrapMaybe } from './errors';

export async function insertSongRequest(input: {
  orderId: string;
  originalStory: string;
  specialDetails: Record<string, Json>;
  mandatoryPhrase?: string;
}): Promise<SongRequestRow> {
  return unwrap(
    await supabaseAdmin()
      .from('song_requests')
      .insert({
        order_id: input.orderId,
        original_story: input.originalStory,
        special_details: input.specialDetails,
        mandatory_phrase: input.mandatoryPhrase ?? null,
      })
      .select('*')
      .single(),
    'song_requests.insert',
  );
}

export async function findSongRequestByOrderId(orderId: string): Promise<SongRequestRow | null> {
  return unwrapMaybe(
    await supabaseAdmin().from('song_requests').select('*').eq('order_id', orderId).maybeSingle(),
    'song_requests.findByOrderId',
  );
}

export async function updateSongRequest(
  orderId: string,
  patch: Partial<SongRequestRow>,
): Promise<SongRequestRow> {
  return unwrap(
    await supabaseAdmin()
      .from('song_requests')
      .update(patch)
      .eq('order_id', orderId)
      .select('*')
      .single(),
    'song_requests.update',
  );
}
