# Arquitetura — Minha Música IA

Documento de referência da arquitetura do MVP. Responde aos nove pontos pedidos
na "primeira tarefa" da especificação e registra as decisões que valem para
quem for evoluir o produto.

---

## 1. Visão geral

Aplicação **monolítica modular** em Next.js (App Router), organizada em camadas
com dependências em uma única direção:

```
  Páginas / Componentes  (React)
            │  só chamam serviços, nunca APIs externas
            ▼
        Serviços          (regra de negócio)
            │
     ┌──────┴──────┐
     ▼             ▼
 Repositories   Providers      (banco)        (integrações externas)
     │             │
     ▼             ▼
  Supabase    OpenAI · ElevenLabs · Mercado Pago · e-mail
```

Regras que sustentam o desenho:

- **Nenhuma página chama API externa.** Componentes falam com serviços; serviços
  falam com providers e repositories.
- **Toda integração externa vive atrás de uma interface.** Trocar de fornecedor
  é escrever uma classe nova e mudar uma linha de configuração no banco.
- **Nada de valor de negócio fixo no código.** Preço, duração de prévia,
  provider ativo e limites vêm da tabela `app_settings`.
- **Trabalho demorado nunca segura uma requisição HTTP.** Interpretação da
  história e geração musical rodam em jobs.

## 2. Fluxo do cliente

```
Anúncio (Instagram/TikTok)
        ↓
Landing (/)                              landing_view, create_song_clicked
        ↓
Formulário (/criar)                      form_started, form_step_completed
        ↓
POST /api/orders                         story_submitted
        ↓  cria pedido + job PROCESS_STORY
Acompanhamento (/musica/[token])
        ↓  job: LLM interpreta a história
        ↓  job: gera a prévia                preview_generation_started/ready
Cliente ouve a prévia                    preview_played
        ↓
Checkout (/checkout/[token])             checkout_started
        ↓  POST /api/checkout → PIX ou cartão   pix_created
Gateway processa
        ↓
POST /api/webhooks/mercadopago           (assinatura verificada)
        ↓  servidor consulta GET /v1/payments/{id}
Pedido = PAID                            payment_approved
        ↓  job GENERATE_FULL_SONG (uma única vez)
Música pronta                            full_generation_completed
        ↓  job SEND_DELIVERY (e-mail; WhatsApp preparado)
Entrega (/sua-musica/[delivery-token])   delivery_opened, song_downloaded
```

## 3. Modelo de dados

| Tabela | Papel |
| --- | --- |
| `customers` | Quem comprou. Sem conta: identificado por e-mail. Guarda os consentimentos de LGPD. |
| `orders` | O pedido. Carrega o status, o preço travado e os dois tokens (público e de entrega). |
| `song_requests` | A história crua e a interpretação do LLM (letra, direção, prompt) + custo da chamada. |
| `generations` | Cada geração de áudio: provider, modelo, tentativas, caminho no storage, duração e custo. |
| `payments` | Um registro por pagamento no gateway. Nunca guarda dado de cartão. |
| `webhook_events` | Registro de cada notificação recebida. É o mecanismo de idempotência. |
| `order_events` | Linha do tempo auditável do pedido. |
| `notification_events` | O que foi enviado, por qual canal, com qual resultado. |
| `jobs` | Fila de trabalho assíncrono, com retentativa e deduplicação. |
| `order_attribution` | UTMs e click ids associados ao pedido. |
| `analytics_events` | Funil first-party. |
| `app_settings` | Configuração operacional (preço, providers, limites). |
| `rate_limits` | Contadores de janela fixa para os endpoints sensíveis. |

Decisões que merecem destaque:

- **Dinheiro é `integer` em centavos.** Nenhum float toca a cobrança.
- **Custos de IA são `numeric(14,6)`**, porque são frações de centavo.
- **Dois tokens por pedido.** `public_token` serve à prévia e ao checkout;
  `delivery_token` nasce só depois do pagamento. Um link de prévia vazado nunca
  vira acesso à música completa.
- **Índice único parcial em `generations (order_id, type)`** para status vivos
  (`QUEUED`, `RUNNING`, `READY`). É a garantia final contra geração duplicada,
  no banco e não na aplicação.
- **Índice único parcial em `jobs (dedupe_key)`** para jobs vivos, pela mesma
  razão.
- **Unicidade em `webhook_events (provider, event_key)`**, que é o que torna o
  webhook idempotente.

## 4. Máquina de estados do pedido

```
DRAFT → STORY_RECEIVED → STORY_PROCESSING → STORY_PROCESSED
                                                │
                        ┌───────────────────────┴───────────┐
                        ▼ (preview_enabled)                 ▼ (sem prévia)
                 PREVIEW_QUEUED                      AWAITING_PAYMENT
                        ↓                                   │
                 PREVIEW_GENERATING                         │
                        ↓                                   │
                 PREVIEW_READY ────────────────────────────►│
                                                            ▼
                                                    PAYMENT_PROCESSING
                                                            ↓
                                                          PAID
                                                            ↓
                                                   FULL_SONG_QUEUED
                                                            ↓
                                                  FULL_SONG_GENERATING
                                                            ↓
                                                   FULL_SONG_READY
                                                            ↓
                                                    DELIVERY_PENDING
                                                            ↓
                                                        DELIVERED

Fora do caminho: FAILED (reprocessável), CANCELLED e REFUNDED (terminais).
```

O grafo vive em `src/services/order-status.ts` e é testado. Toda transição passa
por `updateOrderStatusIfIn`, um `UPDATE ... WHERE status IN (...)`: se outro
processo já mudou o status, a atualização não encontra linha e devolve `null`.
É essa atomicidade que impede que um webhook reentregue aprove o mesmo pedido
duas vezes.

## 5. Integrações externas

| Provider | Serviço | Endpoints usados | Observações |
| --- | --- | --- | --- |
| `LLMProvider` | OpenAI Responses API | `POST /v1/responses` com `text.format = json_schema` (strict) | A saída é revalidada com Zod mesmo com Structured Outputs. |
| `MusicGenerationProvider` | Eleven Music | `POST /v1/music` (prompt ou `composition_plan`) | **Síncrono**: o áudio volta no corpo. Não há consulta de status por id. |
| `PaymentProvider` | Mercado Pago | `POST /v1/payments`, `GET /v1/payments/{id}` | `X-Idempotency-Key` obrigatório na criação; webhook validado por HMAC-SHA256. |
| `StorageProvider` | Supabase Storage | bucket privado `songs` | Nenhum áudio tem URL pública. |
| `NotificationProvider` | Console (dev) / Resend (prod) | `POST /emails` | WhatsApp preparado, ainda não habilitado. |

### Limitações registradas

1. **Eleven Music é síncrona e não expõe status por id.** `supportsAsyncStatus`
   é `false` e `getGenerationStatus` lança erro explicativo. A arquitetura já
   trata o caso `pending`, então um provider assíncrono entra sem reescrita.
2. **A API de música não devolve custo nem duração exata.** O custo registrado é
   uma **estimativa** (duração × `music_cost_per_minute_usd`), e a duração
   registrada é a solicitada.
3. **Não há seleção de voz por gênero na API de música.** A preferência do
   cliente entra no prompt e nos estilos, sem garantia dura — por isso a opção
   "Surpresa" existe.
4. **WhatsApp ativo exige conta aprovada na WhatsApp Business Platform** com
   templates aprovados. Não é resolvível só em código, e automação frágil está
   fora de questão. O canal está modelado, registra a intenção de envio e
   devolve `SKIPPED`.
5. **Cartão depende do Payment Brick do Mercado Pago**, que exige a chave
   pública. Sem ela, o bloco de cartão não aparece e o PIX segue disponível.
6. **Câmbio não é integrado.** Custos de IA são exibidos em dólar e a margem do
   painel desconta apenas a taxa do gateway — somar sem cotação real seria
   inventar número.

## 6. Riscos técnicos

| Risco | Mitigação atual |
| --- | --- |
| Geração duplicada (custo dobrado) | Índice único parcial em `generations` + deduplicação de jobs + transição condicional de status. |
| Webhook forjado aprovando pedido | HMAC-SHA256 sobre o manifesto oficial; sem assinatura válida, 401 e nada é aplicado. |
| Webhook reentregue gerando duas músicas | Unicidade em `webhook_events` + só quem consegue a transição para `PAID` enfileira a geração. |
| Música completa vazando antes do pagamento | Bucket privado + token assinado com escopo + checagem do status do pedido na rota de mídia. |
| Preço manipulado pelo cliente | O schema do checkout não aceita valor; o preço vem do pedido no banco. |
| LLM devolvendo JSON quebrado | Structured Outputs + validação Zod; falha vira retentativa, nunca geração com dado meio formado. |
| LLM inventando fatos sobre pessoas reais | Regras negativas explícitas no prompt e revisão administrativa da letra antes de casos sensíveis. |
| Timeout da função serverless no meio da geração | Orçamento de tempo no worker, `maxDuration` na rota e recuperação de jobs travados. |
| Loop infinito de retentativa | `max_attempts` no job e na geração, com backoff exponencial limitado. |
| Custo de IA maior que a receita | Custo estimado por geração + painel de margem + `max_generation_attempts` configurável. |
| Vazamento de segredo | Segredos só no servidor; `server-only` nos módulos sensíveis; logger com redação automática. |
| Dados pessoais expostos por RLS mal configurado | RLS ligado sem policy em todas as tabelas: negado por padrão; acesso só pela service role no servidor. |

## 7. Estrutura de pastas

```
src/
  app/                    rotas (páginas e handlers HTTP)
    api/                  orders, checkout, media, analytics, webhooks, jobs
    admin/                painel (login fora da guarda, painel dentro)
  components/             UI compartilhada
  features/               UI por domínio (orders, songs, payments, admin)
  providers/              integrações externas atrás de interface
    llm/ music/ payment/ notification/ storage/
  services/               regra de negócio
  repositories/           acesso ao banco
  jobs/                   worker e handlers da fila
  schemas/                validação Zod + catálogos do produto
  lib/                    infraestrutura (env, log, erros, assinatura, dinheiro)
  types/                  tipos de domínio e do banco
supabase/migrations/      SQL versionado
scripts/                  seed de desenvolvimento
tests/                    testes automatizados
```

## 8. Plano de implementação (executado)

| Fase | Entrega | Estado |
| --- | --- | --- |
| 1 | Fundação: Next.js, TypeScript, Tailwind, estrutura, migrations, RLS | ✅ |
| 2 | Landing e formulário de 8 passos, criação de pedido | ✅ |
| 3 | `LLMProvider` + interpretação estruturada da história | ✅ |
| 4 | `MusicGenerationProvider` + integração de geração | ✅ |
| 5 | Prévia, player e página de venda | ✅ |
| 6 | Checkout, Mercado Pago, webhook idempotente | ✅ |
| 7 | Geração completa disparada apenas após pagamento aprovado | ✅ |
| 8 | Página de entrega com token próprio e download protegido | ✅ |
| 9 | Painel administrativo: métricas, lista, detalhe, ações | ✅ |
| 10 | Analytics, UTM, custos, observabilidade, testes, seed | ✅ |

## 9. O que ficou fora deste MVP

Registrado de propósito, para não parecer esquecimento:

- **WhatsApp ativo** — depende de aprovação na plataforma da Meta (limitação 4).
- **Fluxo de estorno automatizado** — o estorno é feito no painel do gateway; o
  sistema apenas reflete o status quando o webhook avisa.
- **Portal de autoatendimento de LGPD** — a arquitetura suporta (dados isolados
  por cliente e por pedido), mas a exclusão hoje é operada pela equipe.
- **Conversão cambial dos custos de IA** — precisa de fonte de cotação.
- **Testes end-to-end de navegador** — a cobertura atual é de unidade e
  integração nas regras críticas.
