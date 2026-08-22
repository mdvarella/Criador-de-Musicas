'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { getAnonymousId, readAttribution } from '@/lib/analytics';
import {
  EMOTIONAL_TONES,
  MUSIC_STYLES,
  OCCASIONS,
  RELATIONSHIPS,
  VOICE_PREFERENCES,
} from '@/schemas/catalog';
import {
  STORY_MAX_LENGTH,
  customerSchema,
  songFormSchema,
  type CustomerValues,
  type SongFormValues,
} from '@/schemas/song-form';
import { ChipGroup, ProgressBar, TextArea, TextField } from './form-controls';

/**
 * Formulário de criação (item 6 da especificação).
 *
 * Em passos curtos e com linguagem afetiva: quem está do outro lado está
 * pensando em alguém que ama, não preenchendo um cadastro. Cada passo valida
 * apenas o próprio conteúdo, para que o cliente nunca fique preso sem entender
 * o motivo.
 */

type Draft = {
  recipientName: string;
  relationship: string | null;
  relationshipOther: string;
  occasion: string | null;
  occasionOther: string;
  story: string;
  city: string;
  importantDate: string;
  nickname: string;
  children: string;
  specialPlaces: string;
  otherDetails: string;
  mandatoryPhrase: string;
  musicStyle: string | null;
  voicePreference: string;
  emotionalTone: string | null;
  firstName: string;
  email: string;
  whatsapp: string;
  acceptedTerms: boolean;
  marketingOptIn: boolean;
};

const EMPTY_DRAFT: Draft = {
  recipientName: '',
  relationship: null,
  relationshipOther: '',
  occasion: null,
  occasionOther: '',
  story: '',
  city: '',
  importantDate: '',
  nickname: '',
  children: '',
  specialPlaces: '',
  otherDetails: '',
  mandatoryPhrase: '',
  musicStyle: null,
  voicePreference: 'SURPRESA',
  emotionalTone: null,
  firstName: '',
  email: '',
  whatsapp: '',
  acceptedTerms: false,
  marketingOptIn: false,
};

const STEP_TITLES = [
  'Para quem é a música?',
  'Qual é a ocasião?',
  'Conte a história',
  'Detalhes que fazem diferença',
  'Que estilo combina com essa história?',
  'Como você imagina a voz?',
  'Qual é o clima da música?',
  'Para onde enviamos sua música?',
];

const TOTAL_STEPS = STEP_TITLES.length;

export function SongWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (!started) {
      setStarted(true);
      track('form_started');
    }
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  /** Validação por passo: só o que está na tela é cobrado do cliente. */
  function validateStep(index: number): boolean {
    const next: Record<string, string> = {};

    if (index === 0) {
      if (draft.recipientName.trim().length < 1) next.recipientName = 'Conte para quem é a música.';
      if (!draft.relationship) next.relationship = 'Escolha a relação.';
    }
    if (index === 1 && !draft.occasion) next.occasion = 'Escolha a ocasião.';
    if (index === 2 && draft.story.trim().length < 30) {
      next.story = 'Conte um pouco mais — pelo menos algumas frases sobre essa história.';
    }
    if (index === 4 && !draft.musicStyle) next.musicStyle = 'Escolha o estilo musical.';
    if (index === 6 && !draft.emotionalTone) next.emotionalTone = 'Escolha o clima da música.';

    if (index === 7) {
      const parsed = customerSchema.safeParse({
        firstName: draft.firstName,
        email: draft.email,
        whatsapp: draft.whatsapp,
        acceptedTerms: draft.acceptedTerms,
        marketingOptIn: draft.marketingOptIn,
      });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          next[key] = issue.message;
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    track('form_step_completed', { step: step + 1, title: STEP_TITLES[step] });

    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    void submit();
  }

  function goBack() {
    if (step === 0) return;
    setStep(step - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);

    let song: SongFormValues;
    let customer: CustomerValues;

    try {
      song = songFormSchema.parse({
        recipientName: draft.recipientName,
        relationship: draft.relationship,
        relationshipOther: draft.relationshipOther,
        occasion: draft.occasion,
        occasionOther: draft.occasionOther,
        story: draft.story,
        specialDetails: {
          city: draft.city,
          importantDate: draft.importantDate,
          nickname: draft.nickname,
          children: draft.children,
          specialPlaces: draft.specialPlaces,
          otherDetails: draft.otherDetails,
        },
        mandatoryPhrase: draft.mandatoryPhrase,
        musicStyle: draft.musicStyle,
        voicePreference: draft.voicePreference,
        emotionalTone: draft.emotionalTone,
      });

      customer = customerSchema.parse({
        firstName: draft.firstName,
        email: draft.email,
        whatsapp: draft.whatsapp,
        acceptedTerms: draft.acceptedTerms,
        marketingOptIn: draft.marketingOptIn,
      });
    } catch {
      // Rede de segurança: a validação por passo já cobre os casos normais.
      setSubmitError('Alguns dados precisam de um ajuste. Revise os passos anteriores.');
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song,
          customer,
          attribution: readAttribution(),
          anonymousId: getAnonymousId(),
        }),
      });

      const body = (await response.json()) as { publicToken?: string; message?: string };

      if (!response.ok || !body.publicToken) {
        setSubmitError(body.message ?? 'Não conseguimos enviar sua história agora.');
        setSubmitting(false);
        return;
      }

      router.push(`/musica/${body.publicToken}`);
    } catch {
      setSubmitError(
        'Não conseguimos enviar sua história agora. Verifique sua conexão e tente novamente.',
      );
      setSubmitting(false);
    }
  }

  const isLastStep = step === TOTAL_STEPS - 1;
  const stepTitle = useMemo(() => STEP_TITLES[step] ?? '', [step]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ProgressBar current={step} total={TOTAL_STEPS} />

      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl">{stepTitle}</h1>

        <div className="mt-6 space-y-5">
          {step === 0 ? (
            <>
              <TextField
                label="Nome de quem vai receber"
                value={draft.recipientName}
                onChange={(v) => set('recipientName', v)}
                placeholder="Ex.: Marina"
                maxLength={80}
                error={errors.recipientName}
              />
              <div>
                <span className="field-label">Quem é essa pessoa para você?</span>
                <ChipGroup
                  name="Relação"
                  options={RELATIONSHIPS}
                  value={draft.relationship}
                  onChange={(v) => set('relationship', v)}
                />
                {errors.relationship ? (
                  <span className="field-error">{errors.relationship}</span>
                ) : null}
              </div>
              {draft.relationship === 'OUTRO' ? (
                <TextField
                  label="Conte em uma palavra"
                  value={draft.relationshipOther}
                  onChange={(v) => set('relationshipOther', v)}
                  placeholder="Ex.: madrinha"
                  maxLength={60}
                />
              ) : null}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <ChipGroup
                name="Ocasião"
                options={OCCASIONS}
                value={draft.occasion}
                onChange={(v) => set('occasion', v)}
              />
              {errors.occasion ? <span className="field-error">{errors.occasion}</span> : null}
              {draft.occasion === 'OUTRA' ? (
                <TextField
                  label="Qual é a ocasião?"
                  value={draft.occasionOther}
                  onChange={(v) => set('occasionOther', v)}
                  placeholder="Ex.: formatura"
                  maxLength={60}
                />
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <TextArea
              label="Conte os momentos mais importantes dessa história."
              value={draft.story}
              onChange={(v) => set('story', v)}
              maxLength={STORY_MAX_LENGTH}
              rows={10}
              placeholder={
                'Você pode contar como se conheceram, momentos marcantes, viagens, apelidos, ' +
                'frases especiais, dificuldades que superaram e tudo o que gostaria de ouvir na música.'
              }
              hint="Quanto mais detalhes de verdade, mais a música vai parecer feita para vocês."
              error={errors.story}
            />
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-sm text-ink-soft">
                Tudo aqui é opcional — preencha só o que fizer sentido.
              </p>
              <TextField
                label="Cidade onde se conheceram"
                value={draft.city}
                onChange={(v) => set('city', v)}
                maxLength={120}
              />
              <TextField
                label="Data importante"
                value={draft.importantDate}
                onChange={(v) => set('importantDate', v)}
                placeholder="Ex.: 12 de junho de 2019"
                maxLength={60}
              />
              <TextField
                label="Apelido carinhoso"
                value={draft.nickname}
                onChange={(v) => set('nickname', v)}
                maxLength={120}
              />
              <TextField
                label="Filhos"
                value={draft.children}
                onChange={(v) => set('children', v)}
                placeholder="Nomes, se quiser que apareçam"
                maxLength={300}
              />
              <TextField
                label="Lugares especiais"
                value={draft.specialPlaces}
                onChange={(v) => set('specialPlaces', v)}
                maxLength={300}
              />
              <TextField
                label="Uma frase que precisa aparecer na música"
                value={draft.mandatoryPhrase}
                onChange={(v) => set('mandatoryPhrase', v)}
                maxLength={200}
                hint="Ela será cantada exatamente como você escrever."
              />
              <TextArea
                label="Outros detalhes"
                value={draft.otherDetails}
                onChange={(v) => set('otherDetails', v)}
                maxLength={1000}
                rows={4}
              />
            </>
          ) : null}

          {step === 4 ? (
            <>
              <ChipGroup
                name="Estilo musical"
                options={MUSIC_STYLES}
                value={draft.musicStyle}
                onChange={(v) => set('musicStyle', v)}
                columns={1}
              />
              {errors.musicStyle ? <span className="field-error">{errors.musicStyle}</span> : null}
            </>
          ) : null}

          {step === 5 ? (
            <>
              <ChipGroup
                name="Voz"
                options={VOICE_PREFERENCES}
                value={draft.voicePreference}
                onChange={(v) => set('voicePreference', v)}
                columns={1}
              />
              <p className="text-sm text-ink-soft">
                Escolhemos a interpretação que melhor combina com a história e com o estilo pedido.
              </p>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <ChipGroup
                name="Clima"
                options={EMOTIONAL_TONES}
                value={draft.emotionalTone}
                onChange={(v) => set('emotionalTone', v)}
              />
              {errors.emotionalTone ? (
                <span className="field-error">{errors.emotionalTone}</span>
              ) : null}
            </>
          ) : null}

          {step === 7 ? (
            <>
              <TextField
                label="Seu primeiro nome"
                value={draft.firstName}
                onChange={(v) => set('firstName', v)}
                autoComplete="given-name"
                maxLength={60}
                error={errors.firstName}
              />
              <TextField
                label="WhatsApp"
                value={draft.whatsapp}
                onChange={(v) => set('whatsapp', v)}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                hint="É por aqui que avisamos quando sua música ficar pronta."
                error={errors.whatsapp}
              />
              <TextField
                label="E-mail"
                value={draft.email}
                onChange={(v) => set('email', v)}
                type="email"
                inputMode="email"
                autoComplete="email"
                error={errors.email}
              />

              <label className="flex items-start gap-3 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-wine-600"
                  checked={draft.acceptedTerms}
                  onChange={(e) => set('acceptedTerms', e.target.checked)}
                />
                <span>
                  Li e aceito os{' '}
                  <Link href="/termos" target="_blank" className="underline">
                    termos de uso
                  </Link>{' '}
                  e a{' '}
                  <Link href="/privacidade" target="_blank" className="underline">
                    política de privacidade
                  </Link>
                  , e autorizo o uso da minha história para criar esta música.
                </span>
              </label>
              {errors.acceptedTerms ? (
                <span className="field-error">{errors.acceptedTerms}</span>
              ) : null}

              <label className="flex items-start gap-3 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-wine-600"
                  checked={draft.marketingOptIn}
                  onChange={(e) => set('marketingOptIn', e.target.checked)}
                />
                <span>Quero receber novidades e ofertas (opcional).</span>
              </label>
            </>
          ) : null}
        </div>

        {submitError ? (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-wine-50 px-4 py-3 text-sm text-wine-700"
          >
            {submitError}
          </p>
        ) : null}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 ? (
            <button type="button" onClick={goBack} className="btn-ghost" disabled={submitting}>
              Voltar
            </button>
          ) : null}

          <button
            type="button"
            onClick={goNext}
            className="btn-primary flex-1"
            disabled={submitting}
          >
            {submitting ? 'Enviando sua história…' : isLastStep ? 'Criar minha música' : 'Continuar'}
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">
        Sua história é usada apenas para criar a sua música.
      </p>
    </div>
  );
}
