-- =============================================================================
-- Minha Musica IA - configuracoes operacionais padrao
-- =============================================================================
-- Estes valores sao lidos em runtime por src/services/settings-service.ts.
-- Alterar aqui (ou pelo painel) muda o comportamento sem novo deploy.
-- =============================================================================

insert into app_settings (key, value, description) values
  ('product_price_cents',
   '4990'::jsonb,
   'Preco do plano STANDARD em centavos de BRL. Fonte unica de verdade da cobranca.'),

  ('product_price_premium_cents',
   '9990'::jsonb,
   'Preco do plano PREMIUM em centavos de BRL. Plano ainda nao exibido na loja.'),

  ('available_plans',
   '["STANDARD"]'::jsonb,
   'Planos visiveis no checkout. PREMIUM entra na lista quando for lancado.'),

  ('preview_enabled',
   'true'::jsonb,
   'Liga/desliga a geracao de previa. Desligado, o pedido vai direto ao checkout.'),

  ('preview_duration_seconds',
   '15'::jsonb,
   'Duracao alvo da previa, entre 10 e 20 segundos.'),

  ('full_song_duration_seconds',
   '150'::jsonb,
   'Duracao alvo da musica completa.'),

  ('active_music_provider',
   '"elevenlabs"'::jsonb,
   'Provider de geracao musical ativo (elevenlabs | mock).'),

  ('active_llm_provider',
   '"openai"'::jsonb,
   'Provider de LLM ativo (openai | mock).'),

  ('active_payment_provider',
   '"mercadopago"'::jsonb,
   'Provider de pagamento ativo (mercadopago | mock).'),

  ('max_generation_attempts',
   '3'::jsonb,
   'Numero maximo de tentativas por geracao antes de marcar o pedido como FAILED.'),

  ('maintenance_mode',
   'false'::jsonb,
   'Quando true, o formulario para de aceitar novos pedidos.'),

  ('payment_methods',
   '["pix", "card"]'::jsonb,
   'Metodos de pagamento habilitados no checkout.'),

  ('llm_cost_per_1m_input_tokens_usd',
   '1.25'::jsonb,
   'Custo estimado de entrada do modelo de texto, usado no calculo de margem.'),

  ('llm_cost_per_1m_output_tokens_usd',
   '10.0'::jsonb,
   'Custo estimado de saida do modelo de texto, usado no calculo de margem.'),

  ('music_cost_per_minute_usd',
   '0.30'::jsonb,
   'Custo estimado por minuto de audio gerado, usado no calculo de margem.'),

  ('payment_fee_percent',
   '4.99'::jsonb,
   'Taxa media do gateway em %, usada apenas para estimar a margem no painel.')
on conflict (key) do nothing;
