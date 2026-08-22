'use server';

import { revalidatePath } from 'next/cache';
import { toUserMessage } from '@/lib/errors';
import { requireAdmin } from '@/services/admin-service';
import {
  adminCancelOrder,
  adminRegenerateFullSong,
  adminRegeneratePreview,
  adminReprocessStory,
  adminResendDelivery,
  adminToggleReviewFlag,
  type AdminActionResult,
} from '@/services/order-admin-service';
import {
  isSettingKey,
  updateSetting,
  type AppSettings,
  type SettingKey,
} from '@/services/settings-service';

/**
 * Server Actions do painel.
 *
 * Cada uma reautentica com `requireAdmin()`: uma Server Action é um endpoint
 * público como qualquer outro, e confiar no fato de ter sido renderizada dentro
 * do painel não é autorização.
 */

type ActionName =
  | 'reprocess_story'
  | 'regenerate_preview'
  | 'regenerate_full'
  | 'resend_delivery'
  | 'cancel_order'
  | 'toggle_flag';

export async function runOrderAction(
  orderId: string,
  action: ActionName,
): Promise<AdminActionResult> {
  try {
    const admin = await requireAdmin();

    const result = await (async () => {
      switch (action) {
        case 'reprocess_story':
          return adminReprocessStory(orderId, admin.email);
        case 'regenerate_preview':
          return adminRegeneratePreview(orderId, admin.email);
        case 'regenerate_full':
          return adminRegenerateFullSong(orderId, admin.email);
        case 'resend_delivery':
          return adminResendDelivery(orderId, admin.email);
        case 'cancel_order':
          return adminCancelOrder(orderId, admin.email);
        case 'toggle_flag':
          return adminToggleReviewFlag(orderId, admin.email);
      }
    })();

    revalidatePath(`/admin/pedidos/${orderId}`);
    revalidatePath('/admin/pedidos');
    return result;
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function saveSetting<K extends SettingKey>(
  key: K,
  value: AppSettings[K],
): Promise<AdminActionResult> {
  try {
    const admin = await requireAdmin();

    // A chave chega do cliente: só as conhecidas podem ser gravadas.
    if (!isSettingKey(key)) {
      return { ok: false, message: 'Configuração desconhecida.' };
    }

    await updateSetting(key, value, admin.email);
    revalidatePath('/admin/configuracoes');
    return { ok: true, message: 'Configuração salva.' };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
