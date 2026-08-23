import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../scripts/load-env';

/**
 * O worker local e a aplicação web precisam enxergar o MESMO ambiente.
 *
 * Este teste existe porque eles divergiram: o `.env.example` traz linhas vazias
 * como `ELEVENLABS_API_KEY=`, quem copia o modelo cola a chave real mais
 * abaixo, e a regra de precedência antiga fazia a linha vazia vencer no worker
 * enquanto o Next lia a chave. O job falhava dizendo que a variável não existia.
 */

let tempDir: string;
let previousCwd: string;

const KEYS = ['TESTE_CHAVE', 'TESTE_EXISTENTE', 'TESTE_ASPAS', 'TESTE_VAZIO'];

beforeEach(() => {
  previousCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'));
  process.chdir(tempDir);
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  process.chdir(previousCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
  for (const key of KEYS) delete process.env[key];
});

function writeEnv(content: string) {
  fs.writeFileSync(path.join(tempDir, '.env.local'), content);
}

describe('carregamento do .env para scripts', () => {
  it('a última ocorrência da chave vence, como no dotenv', () => {
    writeEnv(['TESTE_CHAVE=', '# comentário', 'TESTE_CHAVE=valor-real'].join('\n'));

    loadEnv();

    expect(process.env.TESTE_CHAVE).toBe('valor-real');
  });

  it('linha vazia do modelo não apaga a chave colada depois', () => {
    // Reprodução exata do caso que quebrou a geração de música.
    writeEnv(
      [
        '# --- ElevenLabs ---',
        'ELEVENLABS_API_KEY=',
        '',
        'ELEVENLABS_API_KEY=sk_chave_real',
      ].join('\n'),
    );

    delete process.env.ELEVENLABS_API_KEY;
    loadEnv();

    expect(process.env.ELEVENLABS_API_KEY).toBe('sk_chave_real');
    delete process.env.ELEVENLABS_API_KEY;
  });

  it('variável já definida no processo vence o arquivo', () => {
    process.env.TESTE_EXISTENTE = 'do-processo';
    writeEnv('TESTE_EXISTENTE=do-arquivo');

    loadEnv();

    expect(process.env.TESTE_EXISTENTE).toBe('do-processo');
  });

  it('remove aspas ao redor do valor', () => {
    writeEnv(['TESTE_ASPAS="com aspas"', "TESTE_VAZIO='outro'"].join('\n'));

    loadEnv();

    expect(process.env.TESTE_ASPAS).toBe('com aspas');
    expect(process.env.TESTE_VAZIO).toBe('outro');
  });

  it('ignora comentários e linhas sem separador', () => {
    writeEnv(['# TESTE_CHAVE=comentado', 'linha solta', 'TESTE_CHAVE=ok'].join('\n'));

    loadEnv();

    expect(process.env.TESTE_CHAVE).toBe('ok');
  });

  it('não quebra quando o arquivo não existe', () => {
    expect(() => loadEnv()).not.toThrow();
  });
});
