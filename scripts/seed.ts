import { randomUUID } from 'node:crypto';
import { loadEnv } from './load-env';

loadEnv();

/**
 * Seed de desenvolvimento (item 37 da especificação).
 *
 * Cria pedidos cobrindo os cinco cenários que precisam ser testados no painel e
 * no fluxo do cliente:
 *   1. aguardando pagamento (com prévia pronta)
 *   2. pago, música em produção
 *   3. música pronta e entregue
 *   4. geração com erro
 *   5. pedido recém-criado, história ainda sendo lida
 *
 * Salvaguardas: tudo é marcado com `is_seed = true`, o script recusa rodar em
 * produção e `--reset` apaga exclusivamente os registros de seed.
 */

const RESET = process.argv.includes('--reset');
const FORCE = process.argv.includes('--force');

async function main() {
  if (process.env.NODE_ENV === 'production' && !FORCE) {
    console.error(
      'Recusando rodar o seed com NODE_ENV=production. ' +
        'Dados de teste nunca devem se misturar com produção. Use --force apenas se souber o que está fazendo.',
    );
    process.exit(1);
  }

  const { supabaseAdmin } = await import('../src/lib/supabase/admin');
  const { synthesizeWav } = await import('../src/providers/music/mock-provider');
  const { generateToken } = await import('../src/lib/ids');

  const db = supabaseAdmin();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'songs';

  if (RESET) {
    console.log('Removendo registros de seed anteriores…');
    const { data: seedOrders } = await db.from('orders').select('id').eq('is_seed', true);

    for (const order of seedOrders ?? []) {
      await db.storage.from(bucket).remove([
        `orders/${order.id}/preview-seed.wav`,
        `orders/${order.id}/full-seed.wav`,
      ]);
    }

    // As demais tabelas caem por ON DELETE CASCADE.
    await db.from('orders').delete().eq('is_seed', true);
    await db.from('customers').delete().like('email', 'seed+%@exemplo.com.br');
    console.log('Seed anterior removido.');
  }

  const scenarios = [
    {
      label: 'aguardando pagamento (prévia pronta)',
      status: 'PREVIEW_READY' as const,
      recipient: 'Marina',
      relationship: 'NAMORADA',
      occasion: 'ANIVERSARIO_NAMORO',
      style: 'ROMANTICA',
      tone: 'ROMANTICO',
      story:
        'A gente se conheceu numa festa junina em Campinas, em 2019. Ela usava um vestido amarelo e eu não consegui parar de olhar. Dançamos a noite inteira e desde então nunca mais nos separamos. Nosso apelido é "bem".',
      withPreview: true,
      withFull: false,
      paid: false,
      failed: false,
    },
    {
      label: 'pago, música em produção',
      status: 'FULL_SONG_GENERATING' as const,
      recipient: 'Dona Cleusa',
      relationship: 'MAE',
      occasion: 'DIA_DAS_MAES',
      style: 'MPB',
      tone: 'EMOCIONANTE',
      story:
        'Minha mãe criou eu e meus dois irmãos sozinha, trabalhando como costureira em Belo Horizonte. Ela sempre dizia que a gente ia longe. Hoje eu sou professor e devo tudo a ela.',
      withPreview: true,
      withFull: false,
      paid: true,
      failed: false,
    },
    {
      label: 'música pronta e entregue',
      status: 'DELIVERED' as const,
      recipient: 'Rafael',
      relationship: 'MARIDO',
      occasion: 'ANIVERSARIO_CASAMENTO',
      style: 'ACUSTICA',
      tone: 'DELICADO',
      story:
        'Fazem dez anos de casamento. Passamos por uma mudança de cidade, um período difícil de desemprego e a chegada da Lia, nossa filha. Ele nunca soltou minha mão.',
      withPreview: true,
      withFull: true,
      paid: true,
      failed: false,
    },
    {
      label: 'geração com erro',
      status: 'FAILED' as const,
      recipient: 'Beto',
      relationship: 'AMIGO',
      occasion: 'AMIZADE',
      style: 'ROCK_LEVE',
      tone: 'DIVERTIDO',
      story:
        'O Beto é meu amigo desde a quinta série. A gente tocava numa banda de garagem horrível e até hoje ele me manda áudio de dez minutos falando de futebol.',
      withPreview: false,
      withFull: false,
      paid: false,
      failed: true,
    },
    {
      label: 'recém-criado, história sendo lida',
      status: 'STORY_PROCESSING' as const,
      recipient: 'Nina',
      relationship: 'PET',
      occasion: 'HOMENAGEM',
      style: 'PIANO_E_VOZ',
      tone: 'SAUDOSO',
      story:
        'A Nina foi minha cachorra por catorze anos. Ela me esperava na porta todo dia e dormia do meu lado quando eu ficava doente. Ela partiu no mês passado.',
      withPreview: false,
      withFull: false,
      paid: false,
      failed: false,
    },
  ];

  console.log(`Criando ${scenarios.length} pedidos de teste…\n`);

  for (const [index, scenario] of scenarios.entries()) {
    const email = `seed+${index + 1}@exemplo.com.br`;

    const { data: customer, error: customerError } = await db
      .from('customers')
      .upsert(
        {
          name: ['Ana', 'João', 'Camila', 'Pedro', 'Luiza'][index] ?? 'Cliente',
          email,
          phone: `551199999000${index + 1}`,
          accepted_terms_at: new Date().toISOString(),
          accepted_privacy_at: new Date().toISOString(),
          marketing_opt_in: index % 2 === 0,
        },
        { onConflict: 'email' },
      )
      .select('*')
      .single();

    if (customerError || !customer) {
      console.error(`  ✗ cliente: ${customerError?.message}`);
      continue;
    }

    const publicToken = generateToken();
    const paidAt = scenario.paid ? new Date(Date.now() - 3_600_000).toISOString() : null;

    const { data: order, error: orderError } = await db
      .from('orders')
      .insert({
        customer_id: customer.id,
        public_token: publicToken,
        delivery_token: scenario.withFull ? generateToken(24) : null,
        status: scenario.status,
        plan: 'STANDARD',
        occasion: scenario.occasion,
        recipient_name: scenario.recipient,
        relationship: scenario.relationship,
        music_style: scenario.style,
        voice_preference: 'SURPRESA',
        emotional_tone: scenario.tone,
        amount_cents: 4990,
        currency: 'BRL',
        paid_at: paidAt,
        delivered_at: scenario.status === 'DELIVERED' ? new Date().toISOString() : null,
        is_seed: true,
        last_error_message: scenario.failed
          ? 'provider indisponível durante a geração (registro de teste)'
          : null,
      })
      .select('*')
      .single();

    if (orderError || !order) {
      console.error(`  ✗ pedido: ${orderError?.message}`);
      continue;
    }

    const lyrics = buildLyrics(scenario.recipient);

    await db.from('song_requests').insert({
      order_id: order.id,
      original_story: scenario.story,
      special_details: { city: 'Campinas' },
      mandatory_phrase: null,
      structured_story:
        scenario.status === 'STORY_PROCESSING'
          ? null
          : {
              recipient: { name: scenario.recipient, relationship: scenario.relationship },
              occasion: scenario.occasion,
              story_summary: scenario.story.slice(0, 200),
              important_facts: [],
              mandatory_phrases: [],
              emotional_tone: scenario.tone,
              music_style: scenario.style,
              voice_preference: 'SURPRESA',
              song_structure: {
                intro: 'Violão',
                verse_1: 'Verso 1',
                chorus: 'Refrão',
                verse_2: 'Verso 2',
                bridge: 'Ponte',
                final_chorus: 'Refrão final',
              },
              lyrics,
              music_generation_prompt: 'balada brasileira com violão e cordas',
              music_direction: 'Andamento moderado.',
              preview_hook: `${scenario.recipient}, é você que faz o meu tempo valer.`,
            },
      lyrics: scenario.status === 'STORY_PROCESSING' ? null : lyrics,
      music_direction: 'Andamento moderado, violão base.',
      music_generation_prompt: 'balada brasileira com violão e cordas',
      story_summary: scenario.story.slice(0, 200),
      llm_provider: 'mock',
      llm_model: 'mock-lyricist-1',
      llm_input_tokens: 900,
      llm_output_tokens: 700,
      llm_estimated_cost: 0.008,
    });

    if (scenario.withPreview) {
      await createGeneration(db, bucket, order.id, 'PREVIEW', 15, synthesizeWav(15));
    }

    if (scenario.withFull) {
      await createGeneration(db, bucket, order.id, 'FULL', 150, synthesizeWav(150));
    }

    if (scenario.failed) {
      await db.from('generations').insert({
        order_id: order.id,
        type: 'PREVIEW',
        status: 'FAILED',
        provider: 'mock',
        model: 'mock-composer-1',
        operation: 'generatePreview',
        attempt_count: 3,
        max_attempts: 3,
        error_message: 'provider indisponível durante a geração (registro de teste)',
        finished_at: new Date().toISOString(),
      });
    }

    if (scenario.paid) {
      await db.from('payments').insert({
        order_id: order.id,
        provider: 'mock',
        provider_payment_id: `mock_${randomUUID().slice(0, 12)}`,
        method: 'pix',
        status: 'APPROVED',
        raw_status: 'approved',
        amount_cents: 4990,
        currency: 'BRL',
        approved_at: paidAt,
      });
    }

    await db.from('order_attribution').insert({
      order_id: order.id,
      utm_source: index % 2 === 0 ? 'instagram' : 'tiktok',
      utm_medium: 'paid_social',
      utm_campaign: 'lancamento',
      landing_path: '/',
    });

    await db.from('order_events').insert({
      order_id: order.id,
      event_type: 'order_created',
      message: 'Pedido de teste criado pelo seed',
      metadata: { seed: true },
      actor: 'seed',
    });

    console.log(`  ✓ ${scenario.label}`);
    console.log(`    /musica/${publicToken}`);
    if (order.delivery_token) console.log(`    /sua-musica/${order.delivery_token}`);
  }

  console.log('\nSeed concluído. Todos os registros estão marcados com is_seed = true.');
  console.log('Para limpar: npm run db:reset-seed');
}

async function createGeneration(
  db: Awaited<ReturnType<typeof import('../src/lib/supabase/admin')['supabaseAdmin']>>,
  bucket: string,
  orderId: string,
  type: 'PREVIEW' | 'FULL',
  durationSeconds: number,
  audio: Uint8Array,
) {
  const path = `orders/${orderId}/${type.toLowerCase()}-seed.wav`;

  const { error: uploadError } = await db.storage
    .from(bucket)
    .upload(path, audio as unknown as ArrayBuffer, {
      contentType: 'audio/wav',
      upsert: true,
    });

  if (uploadError) {
    console.error(`    ! falha ao subir áudio de teste: ${uploadError.message}`);
    return;
  }

  await db.from('generations').insert({
    order_id: orderId,
    type,
    status: 'READY',
    provider: 'mock',
    model: 'mock-composer-1',
    operation: type === 'PREVIEW' ? 'generatePreview' : 'generateFullSong',
    prompt: 'balada brasileira com violão e cordas',
    storage_path: path,
    audio_mime_type: 'audio/wav',
    audio_size_bytes: audio.byteLength,
    duration_seconds: durationSeconds,
    attempt_count: 1,
    estimated_cost: type === 'FULL' ? 0.75 : 0.08,
    actual_cost: type === 'FULL' ? 0.75 : 0.08,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    finished_at: new Date().toISOString(),
  });
}

function buildLyrics(name: string): string {
  return [
    '[Intro]',
    'Violão dedilhado, entrada suave da voz',
    '',
    '[Verso 1]',
    `Foi assim que tudo começou com ${name}`,
    'Um encontro comum que virou lugar de voltar',
    '',
    '[Refrão]',
    `${name}, é você que faz o meu tempo valer`,
    'Cada dia comum virou história pra contar',
    '',
    '[Verso 2]',
    'O tempo passou e a gente aprendeu a ficar',
    '',
    '[Ponte]',
    'E se um dia o caminho apertar',
    '',
    '[Refrão Final]',
    `${name}, é você que faz o meu tempo valer`,
  ].join('\n');
}

main().catch((error) => {
  console.error('Seed falhou:', error);
  process.exit(1);
});
