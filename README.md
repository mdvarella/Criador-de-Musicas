# Minha Música IA

Plataforma brasileira de criação e venda de músicas personalizadas. O cliente
conta a história dele, o sistema transforma essa história em letra e música,
entrega uma prévia curta e libera a música completa depois do pagamento.

> **Não vendemos inteligência artificial. Vendemos histórias transformadas em música.**

O nome comercial é configurável (`NEXT_PUBLIC_BRAND_NAME`) e não está fixo em
lugar nenhum do código.

---

## Índice

- [Objetivo](#objetivo)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Migrations](#migrations)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Execução](#execução)
- [Testes](#testes)
- [Providers](#providers)
- [Fila de jobs](#fila-de-jobs)
- [Webhooks](#webhooks)
- [Painel administrativo](#painel-administrativo)
- [Deploy](#deploy)
- [Segurança e privacidade](#segurança-e-privacidade)
- [Teste de ponta a ponta](#teste-de-ponta-a-ponta)
- [Limitações conhecidas](#limitações-conhecidas)

---

## Objetivo

Validar comercialmente, com tráfego de Instagram e TikTok, a venda de músicas
personalizadas. O sistema precisa: converter, cobrar corretamente, gerar a
música uma única vez por pedido, entregar de forma confiável, permitir
acompanhar a operação e medir custo e conversão.

## Arquitetura

Monolito modular em Next.js com camadas de dependência única:

```
Páginas → Serviços → { Repositories → Supabase, Providers → APIs externas }
```

- Nenhuma página chama API externa diretamente.
- Toda integração externa fica atrás de uma interface (`LLMProvider`,
  `MusicGenerationProvider`, `PaymentProvider`, `StorageProvider`,
  `NotificationProvider`).
- Nenhum valor de negócio fixo no código: preço, duração de prévia e provider
  ativo vêm da tabela `app_settings`.
- Trabalho demorado roda em jobs, nunca segurando uma requisição HTTP.

O documento completo — modelo de dados, máquina de estados, riscos e
limitações — está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

### Estrutura de pastas

```
src/
  app/            rotas (páginas, API, painel)
  components/     UI compartilhada
  features/       UI por domínio (orders, songs, payments, admin)
  providers/      integrações externas (llm, music, payment, notification, storage)
  services/       regra de negócio
  repositories/   acesso ao banco
  jobs/           worker e handlers da fila
  schemas/        validação Zod e catálogos do produto
  lib/            infraestrutura (env, log, erros, assinatura, dinheiro)
  types/          tipos de domínio e do banco
supabase/migrations/   SQL versionado
scripts/               seed de desenvolvimento
tests/                 testes automatizados
```

## Instalação

Requisitos: **Node.js 20.9+** e uma conta no Supabase.

```bash
git clone <repo>
cd Criador-de-Musicas
npm install
cp .env.example .env.local
```

No Windows (PowerShell), a última linha é `copy .env.example .env.local`.

## Configuração

### 1. Supabase

Crie um projeto em [supabase.com](https://supabase.com) e copie de
*Project Settings → API*:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **somente servidor**, ignora RLS, nunca no
  browser e nunca no repositório.

### 2. Segredos da aplicação

Gere dois segredos longos e aleatórios:

```bash
openssl rand -base64 48   # MEDIA_SIGNING_SECRET
openssl rand -base64 48   # JOBS_WORKER_SECRET
```

- `MEDIA_SIGNING_SECRET` assina as URLs temporárias de áudio.
- `JOBS_WORKER_SECRET` protege a rota do worker. **Na Vercel, use o mesmo valor
  de `CRON_SECRET`**, porque o cron envia `Authorization: Bearer $CRON_SECRET`.

### 3. Administradores

`ADMIN_ALLOWED_EMAILS` recebe os e-mails autorizados no `/admin`, separados por
vírgula. Cada um precisa existir como usuário no Supabase Auth
(*Authentication → Users → Add user*). Sem a lista preenchida, o painel fica
fechado para todos — falhar fechado é intencional.

## Migrations

O SQL está em `supabase/migrations/`, em ordem:

| Arquivo | Conteúdo |
| --- | --- |
| `0001_init.sql` | Enums, tabelas, índices e funções auxiliares |
| `0002_rls_and_functions.sql` | RLS, claim atômico de jobs, bucket privado |
| `0003_default_settings.sql` | Configurações operacionais padrão |
| `0004_phone_identity.sql` | WhatsApp como identidade; e-mail opcional |

**Via SQL Editor do Supabase:** cole e execute cada arquivo, na ordem.

**Via CLI:**

```bash
supabase link --project-ref <ref>
supabase db push
```

Depois de rodar, confirme:

- o bucket `songs` existe e está **privado**;
- todas as tabelas aparecem com RLS habilitado;
- `app_settings` tem 16 linhas.

### Dados de desenvolvimento

```bash
npm run db:seed          # cria 5 pedidos de teste cobrindo todos os cenários
npm run db:reset-seed    # remove apenas os registros de seed e recria
```

O seed cria: pedido aguardando pagamento com prévia pronta, pedido pago em
produção, música pronta e entregue, geração com erro e pedido recém-criado.
Tudo é marcado com `is_seed = true`, e o script **recusa rodar com
`NODE_ENV=production`**.

Não precisa do `npm run dev` rodando: o seed fala direto com o Supabase, lendo
as credenciais do `.env.local`.

## Variáveis de ambiente

Lista completa e comentada em [`.env.example`](.env.example). As essenciais:

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | sim | Links de entrega, `notification_url` do webhook |
| `NEXT_PUBLIC_BRAND_NAME` | não | Nome comercial exibido |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | sim | Banco e autenticação |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Acesso do servidor (ignora RLS) |
| `OPENAI_API_KEY` | em produção | Interpretação da história e letra |
| `ELEVENLABS_API_KEY` | em produção | Geração do áudio |
| `FAL_KEY` | se usar MiniMax | Provider musical alternativo |
| `MERCADO_PAGO_ACCESS_TOKEN` | em produção | Criação e consulta de pagamentos |
| `MERCADO_PAGO_WEBHOOK_SECRET` | em produção | Validação da assinatura do webhook |
| `MERCADO_PAGO_ALLOW_LIVE` | **em produção** | Trava de segurança: com `false`, pagamentos com dinheiro real são recusados |
| `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` | opcional | Habilita o pagamento com cartão |
| `MEDIA_SIGNING_SECRET` | sim | Assinatura das URLs de áudio |
| `JOBS_WORKER_SECRET` | sim | Proteção do worker da fila |
| `ADMIN_ALLOWED_EMAILS` | sim | Autorização do painel |
| `USE_MOCK_PROVIDERS` | não | `true` usa providers simulados, sem gastar crédito |

## Execução

```bash
npm run dev        # http://localhost:3000
npm run jobs:work  # worker da fila (ver abaixo — obrigatório em desenvolvimento)
npm run doctor     # diagnóstico: variáveis, configuração e providers efetivos
npm run build      # build de produção
npm start          # serve o build
npm run typecheck  # TypeScript sem emitir
npm test           # suíte de testes
```

> **Em desenvolvimento são dois terminais.** `npm run dev` sozinho serve as
> páginas, mas não processa a fila: o pedido é criado e fica parado em
> "compondo…" para sempre. Quem interpreta a história e gera a música é o
> worker.

### Diagnóstico: qual provider está sendo usado?

```bash
npm run doctor
```

Imprime o ambiente efetivo, a configuração lida do banco e **qual provider cada
serviço vai usar de verdade**, com o motivo da escolha. Nenhum segredo é
exibido, apenas se está definido.

É o primeiro comando a rodar quando "configurei e não pegou". Ele também aponta
chaves repetidas no `.env.local` — a causa clássica, porque quem copia o
`.env.example` herda linhas como `ELEVENLABS_API_KEY=` e cola o valor real mais
abaixo. **Vale a última ocorrência de cada chave.**

```
  .env.local: 62 linhas, 24 chaves
    ⚠  USE_MOCK_PROVIDERS aparece nas linhas 4, 62 — vale a linha 62

  === Providers que serão usados ===
  ⚠  USE_MOCK_PROVIDERS=true ignora o banco: TUDO roda em mock.
  llm        mock · mock-lyricist-1
  music      mock · mock-composer-1
```

### Desenvolvimento sem gastar crédito

Com `USE_MOCK_PROVIDERS=true`, o LLM e a geração musical usam implementações
simuladas: a letra sai pronta e o áudio é um WAV sintetizado de verdade, que
toca no player e pode ser baixado. O fluxo comercial inteiro roda offline.

Essa variável é uma **chave geral**: quando verdadeira, ignora o `app_settings`
e coloca os três serviços em mock de uma vez. Para integrar **um serviço por
vez**, deixe-a em `false` e use os campos `active_*_provider` em
`/admin/configuracoes` — assim dá para rodar música real com pagamento
simulado, por exemplo.

### Rodando a fila localmente

Em produção quem aciona a fila é o cron da Vercel. Em desenvolvimento não existe
cron, então o worker roda em um terminal próprio:

```bash
npm run jobs:work
```

Funciona igual em Windows, macOS e Linux. O script chama a **mesma** função
`runJobs()` que a rota HTTP chama — não é um caminho paralelo, é o mesmo worker
acionado por um laço local. Ele imprime uma linha só quando processa algo:

```
Worker local ativo. Verificando a fila a cada 5s.
[14:32:07] 1 job(s) · 1 ok · 812ms
```

Variações:

```bash
npm run jobs:work -- --once          # uma única passada, útil para depurar
npm run jobs:work -- --interval=2    # verifica a cada 2 segundos
```

#### Acionando pela rota HTTP

É como a produção funciona, e serve para conferir se a rota está de pé. Precisa
do `JOBS_WORKER_SECRET`:

```bash
# macOS / Linux
curl -H "Authorization: Bearer $JOBS_WORKER_SECRET" \
  http://localhost:3000/api/jobs/run
```

```powershell
# Windows (PowerShell) — use curl.exe, não `curl`, que é um alias diferente
curl.exe -H "Authorization: Bearer COLE_O_SEGREDO" http://localhost:3000/api/jobs/run
```

Não esconda a resposta com `-s` nem com `| Out-Null`: é ela que diz o que houve.

| Resposta | Significado |
| --- | --- |
| `{"claimed":1,"succeeded":1,...}` | processou |
| `{"claimed":0,...}` | não havia job pendente |
| `{"message":"não autorizado"}` | segredo errado, ou o `npm run dev` não foi reiniciado depois de editar o `.env.local` |
| `{"message":"worker não configurado"}` | `JOBS_WORKER_SECRET` vazio no `.env.local` |

Cada execução reserva até 3 jobs de uma vez, mas os jobs da fila são
encadeados: o `GENERATE_PREVIEW` só nasce **durante** o processamento do
`PROCESS_STORY`. Por isso uma chamada avulsa não leva o pedido até a prévia —
são necessárias pelo menos duas. O `npm run jobs:work` resolve isso sozinho.

## Testes

```bash
npm test              # tudo
npm run test:watch    # modo observação
```

Cobertura das regras que, se quebrarem, custam dinheiro ou confiança:

| Arquivo | O que garante |
| --- | --- |
| `pricing.test.ts` | Preço vem da configuração; valores inválidos são recusados; centavos sem erro de float |
| `order-status.test.ts` | Transições válidas; pedido pago não volta atrás; rótulos sem termo técnico |
| `song-form.test.ts` | Validação do formulário; preço enviado pelo cliente é descartado |
| `llm-parsing.test.ts` | Saída do LLM validada por schema; falha vira retentativa |
| `media-access.test.ts` | Token assinado, com escopo e prazo; música completa bloqueada antes do pagamento |
| `mercadopago.test.ts` | Assinatura do webhook; status desconhecido nunca vira "aprovado" |
| `webhook-idempotency.test.ts` | Notificação repetida gera **uma** música e **uma** aprovação; valor divergente não aprova |
| `song-generation.test.ts` | Música completa exige pagamento; corrida entre workers não duplica geração |
| `admin-authorization.test.ts` | Só e-mail da allowlist entra; sem allowlist, ninguém entra |

## Providers

Cada integração externa fica atrás de uma interface. Para trocar de fornecedor,
implemente a interface e mude a configuração — nenhum serviço muda.

```ts
interface MusicGenerationProvider {
  generatePreview(input: MusicGenerationInput): Promise<GenerationResult>;
  generateFullSong(input: MusicGenerationInput): Promise<GenerationResult>;
  getGenerationStatus(id: string): Promise<GenerationStatus>;
}
```

| Interface | Implementações | Chave de configuração |
| --- | --- | --- |
| `LLMProvider` | `OpenAIProvider`, `MockLLMProvider` | `active_llm_provider` |
| `MusicGenerationProvider` | `ElevenLabsMusicProvider`, `MinimaxMusicProvider`, `MockMusicProvider` | `active_music_provider` |
| `PaymentProvider` | `MercadoPagoProvider`, `MockPaymentProvider` | `active_payment_provider` |
| `StorageProvider` | `SupabaseStorageProvider` | — |
| `NotificationProvider` | `ConsoleNotificationProvider`, `ResendEmailProvider`, WhatsApp (preparado) | `NOTIFICATION_EMAIL_PROVIDER` |

### Comparando ElevenLabs e MiniMax

Dois providers musicais coexistem, para você ouvir os dois e decidir:

| | ElevenLabs | MiniMax (via fal) |
| --- | --- | --- |
| Custo da música completa (150s) | ~US$ 0,37 | ~US$ 0,03 |
| Controle de duração | sim (`music_length_ms`) | **não** |
| Como recebe a letra | seção a seção (`composition_plan.chunks`) | letra inteira (`lyrics_prompt`) |
| Treino licenciado | sim | não declarado |

**O MiniMax não controla duração** — o modelo decide o tamanho a partir da
letra. Uma prévia sairia com tamanho de música inteira, entregando o produto sem
cobrar. Por isso existe `active_preview_music_provider`: deixe-o em `elevenlabs`
enquanto a música completa estiver em `minimax`.

```
active_music_provider          minimax      ← música completa, barata
active_preview_music_provider  elevenlabs   ← prévia, com duração controlada
```

Vazio significa "o mesmo da música completa".

### Adicionando um provider musical

1. Implemente `MusicGenerationProvider` em `src/providers/music/`.
2. Registre no `switch` de `src/providers/music/index.ts`.
3. Mude `active_music_provider` no painel de configurações.

Se o serviço for assíncrono, devolva `{ kind: 'pending', providerGenerationId }`
e marque `supportsAsyncStatus = true`. A fila já sabe lidar com isso.

## Fila de jobs

| Job | Disparado por | Faz |
| --- | --- | --- |
| `PROCESS_STORY` | criação do pedido | Interpreta a história com o LLM |
| `GENERATE_PREVIEW` | fim do processamento da história | Gera o trecho de prévia |
| `GENERATE_FULL_SONG` | aprovação do pagamento | Gera a música completa |
| `SEND_DELIVERY` | música pronta | Emite o link e notifica o cliente |
| `SEND_NOTIFICATION` | vários pontos do fluxo | Envia um aviso específico |

Características:

- **Reserva atômica** via `FOR UPDATE SKIP LOCKED`: dois workers nunca pegam o
  mesmo job.
- **Deduplicação** por `dedupe_key`, com índice único parcial.
- **Retentativa com backoff** (1, 4, 9… minutos, teto de 30) e limite absoluto
  em `max_attempts` — sem loop infinito.
- **Recuperação de travados**: job cujo worker morreu volta à fila após 15
  minutos.

## Webhooks

### Mercado Pago

Cadastre no painel do gateway:

```
https://SEU-DOMINIO/api/webhooks/mercadopago
```

Marque o evento **Pagamentos** e copie a **chave secreta** para
`MERCADO_PAGO_WEBHOOK_SECRET`.

Como o endpoint se comporta:

1. Valida a assinatura HMAC-SHA256 sobre o manifesto
   `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Sem assinatura válida →
   **401** e nada é aplicado.
2. Reserva o evento em `webhook_events` (unicidade por `provider + event_key`).
   Reentrega do mesmo evento → **200 com `duplicate: true`**.
3. **Consulta `GET /v1/payments/{id}`.** O webhook só avisa; a verdade é a
   consulta.
4. Confere se o valor aprovado é o valor do pedido. Divergiu → registra e não
   aprova.
5. Move o pedido para `PAID` com atualização condicional. **Só quem consegue
   essa transição enfileira a geração da música completa.**

Falha transitória devolve **500** para que o gateway reentregue.

#### Testando localmente

O gateway precisa alcançar sua máquina pela internet — `localhost` não existe
para ele. É preciso um túnel público:

```bash
npx localtunnel --port 3000     # ou: ngrok http 3000
```

Depois, **aponte `NEXT_PUBLIC_APP_URL` para a URL do túnel** e reinicie o
`npm run dev`. É dessa variável que sai a `notification_url` enviada ao gateway;
esquecê-la é o erro mais comum, e a falha é silenciosa — o pagamento é aprovado
e a notificação simplesmente nunca chega.

Confira com:

```bash
npm run doctor
```

```
=== Webhook de pagamento ===
  notification_url        https://abc123.ngrok-free.app/api/webhooks/mercadopago
  ✓  Alcançável pela internet.
  segredo do webhook      definido
```

A URL do túnel muda a cada reinício nas versões gratuitas: quando isso
acontecer, atualize `NEXT_PUBLIC_APP_URL` **e** a URL cadastrada no painel do
gateway.

#### Credenciais de teste

No painel do desenvolvedor: **Suas integrações** → sua aplicação → **Contas de
teste** (crie uma de vendedor e uma de comprador). Use as credenciais da
aplicação com o alternador em **Credenciais de teste**.

**PIX não pode ser pago com credenciais de teste** — é limitação do gateway. O
QR é gerado, o que valida a criação, mas não há como quitá-lo em sandbox. O
caminho "aprovado" se testa com cartão de teste; o nome do titular determina o
desfecho (`APRO` aprova, `OTHE` recusa, `CONT` deixa pendente). Os números de
cartão estão na página *Cartões de teste* do painel.

## Painel administrativo

`/admin` — autenticado por Supabase Auth **e** restrito à allowlist de e-mails.

- **Visão geral**: pedidos, vendas, faturamento, prévias, pagamentos, músicas
  completas, pedidos com erro, conversão prévia → pagamento e custos estimados.
- **Pedidos**: lista com filtros (período, status, pago/não pago, estilo) e
  busca por nome, e-mail, WhatsApp ou ID.
- **Detalhe do pedido**: cliente, história original, letra e direção, prévia e
  música com player, pagamentos, notificações, fila, origem do cliente e linha
  do tempo completa.
- **Ações**: reprocessar história, regenerar prévia, regenerar música, reenviar
  entrega, cancelar pedido, marcar para revisão. As destrutivas e as que geram
  custo pedem confirmação.
- **Configurações**: preço, prévia, providers, limites e modo manutenção — sem
  novo deploy.

## Deploy

### Vercel

1. Importe o repositório.
2. Preencha as variáveis de ambiente (todas as de `.env.example`).
3. Defina `NEXT_PUBLIC_APP_URL` com o domínio final.
4. Defina `CRON_SECRET` **com o mesmo valor de `JOBS_WORKER_SECRET`**.
5. Faça o deploy. O cron de `vercel.json` chama `/api/jobs/run` a cada minuto.

> Cron de um minuto exige plano **Pro**. No plano Hobby a frequência mínima é
> diária: use um agendador externo (cron-job.org, GitHub Actions) chamando a
> mesma rota com o header `Authorization: Bearer <JOBS_WORKER_SECRET>`.

### Checklist pós-deploy

- [ ] Migrations aplicadas e bucket `songs` privado
- [ ] Webhook cadastrado no Mercado Pago com a chave secreta configurada
- [ ] `USE_MOCK_PROVIDERS` **ausente ou `false`** em produção
- [ ] `MERCADO_PAGO_ALLOW_LIVE=true` — sem isso, **nenhum pagamento real é aceito**
- [ ] `ADMIN_ALLOWED_EMAILS` preenchido e usuários criados no Supabase Auth
- [ ] `MEDIA_SIGNING_SECRET` e `JOBS_WORKER_SECRET` longos e distintos
- [ ] Pagamento de teste concluído de ponta a ponta
- [ ] Páginas `/privacidade` e `/termos` revisadas juridicamente

## Segurança e privacidade

- **Segredos só no servidor.** Módulos sensíveis importam `server-only`, o que
  quebra o build se vazarem para o cliente.
- **RLS negando por padrão.** Todas as tabelas têm RLS ligado e nenhuma policy
  para `anon`/`authenticated`. O acesso é feito no servidor, pela service role,
  depois da autorização da aplicação.
- **Áudio protegido em três camadas**: bucket privado, token assinado com escopo
  e prazo, e verificação do status do pedido. A música completa não existe em
  URL alcançável antes do pagamento.
- **Preço sempre do servidor.** O schema do checkout sequer aceita valor.
- **Nenhum dado de cartão toca o sistema.** Os campos são digitados no ambiente
  do gateway; recebemos apenas um token.
- **Rate limiting** nos endpoints sensíveis (criação de pedido, checkout,
  status, analytics).
- **Logs estruturados com redação automática** de qualquer chave que pareça
  segredo, e com correlação por `request_id`, `order_id`, `payment_id`.
- **Erro técnico nunca chega ao consumidor**: cada `AppError` carrega uma
  mensagem acolhedora separada da mensagem técnica.
- **LGPD**: consentimentos com data registrada, páginas de privacidade e termos,
  e histórias jamais usadas publicamente sem autorização explícita.
- **Recuperação de pedido** (`/minhas-musicas`) exige WhatsApp **e** nome do
  destinatário, tem rate limit apertado e responde de forma idêntica quando não
  encontra — seja porque o número não existe, seja porque o nome não bate.
  Distinguir os dois casos revelaria quais telefones têm pedido.

## Teste de ponta a ponta

Roteiro que define o MVP como pronto (item 43 da especificação):

Garanta que `USE_MOCK_PROVIDERS=true` está no `.env.local` — sem isso o worker
tenta usar OpenAI e ElevenLabs de verdade. Depois de editar o arquivo,
**reinicie o `npm run dev`**: o Next só lê as variáveis na inicialização.

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run jobs:work
```

1. Abra `http://localhost:3000` e clique em **Criar minha música**.
2. Preencha os oito passos e envie.
3. Acompanhe em `/musica/[token]` — a prévia aparece sozinha.
4. Ouça a prévia e clique em **Quero minha música completa**.
5. No checkout, gere o PIX simulado.
6. Aprove o pagamento (com providers simulados, aprove pelo painel ou dispare o
   webhook manualmente).
7. A geração completa dispara **uma única vez**.
8. O link de entrega aparece na página do pedido.
9. Ouça e baixe em `/sua-musica/[delivery-token]`.
10. Confira tudo em `/admin`.

## Limitações conhecidas

Registradas de propósito, conforme o item 41 da especificação:

1. **Eleven Music é síncrona** e não expõe consulta de status por id. A
   abstração já contempla providers assíncronos.
2. **A API de música não devolve custo nem duração exata.** O que aparece no
   painel é estimativa calculada a partir da duração e da configuração de custo.
3. **Não há seleção de voz por gênero na API de música.** A preferência entra no
   prompt, sem garantia dura.
4. **WhatsApp ativo depende de conta aprovada na plataforma da Meta.** O canal
   está modelado e registra a intenção de envio, mas não envia — e não usamos
   automação frágil como substituto.
5. **Cartão exige a chave pública do gateway.** Sem ela, apenas PIX aparece.
6. **Custos de IA ficam em dólar** no painel: converter sem cotação real seria
   inventar número.
7. **Prova social vem vazia.** A estrutura existe, mas nenhum depoimento,
   avaliação ou contador é exibido enquanto não houver dado real e autorizado.
