import type {
  GenerationResult,
  GenerationStatus,
  MusicGenerationInput,
  MusicGenerationProvider,
} from './types';

/**
 * Provider musical de desenvolvimento.
 *
 * Sintetiza um WAV real (arpejo simples em Dó maior) para que o player, o
 * download, o storage e a página de entrega possam ser testados de ponta a
 * ponta sem gastar crédito e sem depender de rede.
 */
export class MockMusicProvider implements MusicGenerationProvider {
  readonly name = 'mock';
  readonly model = 'mock-composer-1';
  readonly supportsAsyncStatus = false;

  async generatePreview(input: MusicGenerationInput): Promise<GenerationResult> {
    return this.build(input, Math.min(input.targetDurationSeconds, 20));
  }

  async generateFullSong(input: MusicGenerationInput): Promise<GenerationResult> {
    return this.build(input, input.targetDurationSeconds);
  }

  async getGenerationStatus(_id: string): Promise<GenerationStatus> {
    return { state: 'completed', audio: { data: synthesizeWav(5), mimeType: 'audio/wav', durationSeconds: 5 } };
  }

  private build(input: MusicGenerationInput, durationSeconds: number): GenerationResult {
    return {
      kind: 'completed',
      providerGenerationId: `mock_${input.generationId}`,
      audio: {
        data: synthesizeWav(durationSeconds),
        mimeType: 'audio/wav',
        durationSeconds,
      },
      model: this.model,
      estimatedCostUsd: 0,
    };
  }
}

const SAMPLE_RATE = 22_050;
/** Dó maior: C4, E4, G4, C5, G4, E4. */
const NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];

export function synthesizeWav(durationSeconds: number): Uint8Array {
  const totalSamples = Math.max(1, Math.floor(durationSeconds * SAMPLE_RATE));
  const noteSamples = Math.floor(SAMPLE_RATE * 0.5);

  const header = 44;
  const buffer = new ArrayBuffer(header + totalSamples * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  writeAscii(view, 36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  for (let i = 0; i < totalSamples; i += 1) {
    const noteIndex = Math.floor(i / noteSamples) % NOTES.length;
    const frequency = NOTES[noteIndex]!;
    const positionInNote = (i % noteSamples) / noteSamples;
    // Envelope suave para não estalar na troca de nota.
    const envelope = Math.sin(Math.PI * positionInNote) ** 0.6;
    const sample = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) * envelope * 0.28;
    view.setInt16(header + i * 2, Math.round(sample * 32_767), true);
  }

  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
