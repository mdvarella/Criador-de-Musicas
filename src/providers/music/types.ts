/**
 * Contrato do provider de geração musical.
 *
 * Nenhuma regra de negócio conhece a ElevenLabs. O serviço de músicas fala
 * apenas com esta interface, e o provider ativo vem de `active_music_provider`.
 */

export type MusicSection = {
  /** Letra da seção. Vazio em seções instrumentais. */
  text: string;
  durationSeconds: number;
  /** Estilos desejados (gênero, instrumentação, dinâmica). */
  positiveStyles: string[];
  /** Estilos a evitar. */
  negativeStyles: string[];
};

export type MusicGenerationInput = {
  /** Identificador do nosso lado, usado em logs e correlação. */
  generationId: string;
  orderId: string;
  /** Prompt descritivo do estilo, instrumentação, clima e idioma. */
  prompt: string;
  /** Letra completa da música (ou o trecho, no caso da prévia). */
  lyrics: string;
  /** Estrutura por seção. Quando presente, o provider pode usá-la. */
  sections?: MusicSection[];
  targetDurationSeconds: number;
  instrumental?: boolean;
};

export type GeneratedAudio = {
  data: Uint8Array;
  mimeType: string;
  /** Duração real quando o provider informa; caso contrário, a duração alvo. */
  durationSeconds: number;
};

/**
 * Resultado de uma geração.
 *
 * `completed` cobre providers síncronos (a ElevenLabs devolve o áudio na
 * própria resposta) e `pending` cobre providers assíncronos que devolvem um id
 * para consulta posterior. A fila lida com os dois casos sem mudar de forma.
 */
export type GenerationResult =
  | {
      kind: 'completed';
      providerGenerationId: string | null;
      audio: GeneratedAudio;
      model: string;
      estimatedCostUsd: number;
    }
  | {
      kind: 'pending';
      providerGenerationId: string;
      model: string;
      estimatedCostUsd: number;
    };

export type GenerationStatus =
  | { state: 'pending' }
  | { state: 'running' }
  | { state: 'completed'; audio: GeneratedAudio }
  | { state: 'failed'; error: string };

export interface MusicGenerationProvider {
  readonly name: string;
  readonly model: string;
  /**
   * Alguns providers (a ElevenLabs entre eles) são síncronos e não expõem
   * consulta de status. A fila checa esta flag antes de tentar `getGenerationStatus`.
   */
  readonly supportsAsyncStatus: boolean;

  generatePreview(input: MusicGenerationInput): Promise<GenerationResult>;
  generateFullSong(input: MusicGenerationInput): Promise<GenerationResult>;
  getGenerationStatus(providerGenerationId: string): Promise<GenerationStatus>;
}
