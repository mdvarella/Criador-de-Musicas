import fs from 'node:fs';
import path from 'node:path';

/**
 * Carrega `.env.local` (e `.env`) para scripts rodados fora do Next.
 *
 * Duas regras de precedência, ambas iguais às do dotenv que o Next usa — e essa
 * igualdade é o ponto: worker e aplicação web precisam enxergar exatamente o
 * mesmo ambiente.
 *
 *   1. Variável já presente no processo vence o arquivo.
 *   2. Dentro de um arquivo, a ÚLTIMA ocorrência de uma chave vence.
 *
 * A regra 2 importa na prática: quem copia o `.env.example` herda linhas
 * vazias como `ELEVENLABS_API_KEY=` e costuma colar a chave real mais abaixo.
 * Fazendo a primeira ocorrência vencer, o worker leria string vazia enquanto a
 * aplicação leria a chave — e o job falharia dizendo que a variável não existe.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;

    const parsed = new Map<string, string>();

    for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Sobrescreve deliberadamente: a última linha do arquivo é a que vale.
      parsed.set(key, value);
    }

    for (const [key, value] of parsed) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
