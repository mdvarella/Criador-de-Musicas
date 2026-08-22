import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { CtaButton } from '@/components/cta-button';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { brand } from '@/lib/brand';
import { OCCASIONS } from '@/schemas/catalog';
import { quotePrice } from '@/services/pricing-service';
import { centsToBRL } from '@/lib/money';
import { getSettings } from '@/services/settings-service';

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
};

// A landing lê preço e configurações do banco; revalida com folga para não
// bater no banco a cada visita vinda de anúncio.
export const revalidate = 60;

const STEPS = [
  {
    number: '1',
    title: 'Conte sua história',
    description:
      'Fale das pessoas, dos momentos marcantes, dos apelidos e das frases que só vocês entendem.',
    emoji: '✍️',
  },
  {
    number: '2',
    title: 'Criamos sua música',
    description:
      'Transformamos cada detalhe em letra, melodia e arranjo — feitos exclusivamente para essa história.',
    emoji: '🎼',
  },
  {
    number: '3',
    title: 'Surpreenda alguém',
    description:
      'Você recebe a música pronta para ouvir, baixar e compartilhar com quem ama.',
    emoji: '💝',
  },
];

export default async function LandingPage() {
  const [settings, price] = await Promise.all([getSettings(), safeQuote()]);

  return (
    <>
      <SiteHeader />

      <main>
        {/* ---------------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-wine-100),transparent_60%)]"
          />

          <div className="app-container relative py-14 sm:py-20">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-wine-700 shadow-sm">
              <span aria-hidden>❤️</span> Um presente que ninguém mais pode dar
            </p>

            <h1 className="max-w-3xl text-4xl leading-[1.1] sm:text-5xl md:text-6xl">
              Transforme sua história em uma música única.
            </h1>

            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Conte sua história. Nós transformamos seus momentos especiais em uma música
              personalizada, feita só para você.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <CtaButton location="hero">Criar minha música</CtaButton>
              {price ? (
                <p className="text-sm text-ink-soft">
                  A partir de <strong className="text-ink">{price}</strong> · prévia antes
                  de pagar
                </p>
              ) : null}
            </div>

            {/*
              Player de exemplo: o arquivo de demonstração fica em /public/exemplos.
              Enquanto não houver uma música autorizada para divulgação, o bloco
              não é exibido — nunca inventamos prova social.
            */}
            <ExampleSong />
          </div>
        </section>

        {/* -------------------------------------------------------- Como funciona */}
        <section className="app-container py-14 sm:py-20">
          <h2 className="text-3xl sm:text-4xl">Como funciona</h2>
          <p className="mt-3 max-w-xl text-ink-soft">
            Três passos simples. Todo o resto é com a gente.
          </p>

          <ol className="mt-10 grid gap-5 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.number} className="card p-6">
                <span className="text-3xl" aria-hidden>
                  {step.emoji}
                </span>
                <p className="mt-4 text-sm font-semibold tracking-wide text-wine-600">
                  PASSO {step.number}
                </p>
                <h3 className="mt-1 text-xl">{step.title}</h3>
                <p className="mt-2 text-ink-soft">{step.description}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------------------ Ocasiões */}
        <section className="bg-white/70 py-14 sm:py-20">
          <div className="app-container">
            <h2 className="text-3xl sm:text-4xl">Para todas as histórias</h2>
            <p className="mt-3 max-w-xl text-ink-soft">
              Toda ocasião merece uma trilha sonora própria.
            </p>

            <ul className="mt-8 flex flex-wrap gap-3">
              {OCCASIONS.filter((o) => o.value !== 'OUTRA').map((occasion) => (
                <li key={occasion.value} className="chip">
                  <span aria-hidden>{occasion.emoji}</span>
                  {occasion.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------- Prova social */}
        <SocialProof />

        {/* ------------------------------------------------------------ CTA final */}
        <section className="app-container py-16 sm:py-24">
          <div className="card overflow-hidden bg-gradient-to-br from-wine-700 to-wine-900 p-8 text-center text-white sm:p-14">
            <h2 className="text-3xl text-white sm:text-4xl">Sua história merece virar música.</h2>
            <p className="mx-auto mt-4 max-w-lg text-white/80">
              Conte os momentos. Nós criamos a música. Para sempre.
            </p>

            <div className="mt-8 flex justify-center">
              <CtaButton
                location="footer"
                className="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-base font-semibold text-wine-700 shadow-lg transition hover:bg-gold-200"
              >
                Criar minha música agora
              </CtaButton>
            </div>

            {settings.preview_enabled ? (
              <p className="mt-4 text-sm text-white/70">
                Você ouve uma prévia antes de decidir.
              </p>
            ) : null}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

async function safeQuote(): Promise<string | null> {
  try {
    const quote = await quotePrice('STANDARD');
    return centsToBRL(quote.amountCents);
  } catch {
    return null;
  }
}

/**
 * Exemplo de música na landing.
 *
 * Só aparece quando existe um arquivo autorizado em
 * `public/exemplos/exemplo.mp3`. Sem isso, nada é exibido: usar a história de
 * um cliente sem autorização explícita está fora de questão.
 */
function ExampleSong() {
  const filePath = path.join(process.cwd(), 'public', 'exemplos', 'exemplo.mp3');
  if (!fs.existsSync(filePath)) return null;

  return (
    <div className="mt-10 max-w-lg">
      <p className="mb-3 text-sm font-medium text-ink-soft">Ouça um exemplo</p>
      <audio
        controls
        preload="none"
        controlsList="nodownload"
        src="/exemplos/exemplo.mp3"
        className="w-full"
      />
    </div>
  );
}

/**
 * Prova social (item 5 da especificação).
 *
 * A estrutura está pronta, mas nenhum depoimento, nota ou contador é exibido
 * enquanto não houver dado real e autorizado. Inventar número aqui seria mentir
 * para o cliente — e é proibido pela especificação.
 */
function SocialProof() {
  const testimonials: Array<{ name: string; text: string; occasion: string }> = [];

  if (testimonials.length === 0) return null;

  return (
    <section className="app-container py-14 sm:py-20">
      <h2 className="text-3xl sm:text-4xl">Quem já emocionou alguém</h2>
      <ul className="mt-8 grid gap-5 sm:grid-cols-3">
        {testimonials.map((item) => (
          <li key={item.name} className="card p-6">
            <p className="text-ink-soft">“{item.text}”</p>
            <p className="mt-4 text-sm font-semibold">{item.name}</p>
            <p className="text-sm text-ink-soft">{item.occasion}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
