import fs from 'node:fs';
import path from 'node:path';

/**
 * Carrega `.env.local` (e `.env`) para scripts rodados fora do Next.
 * Variáveis já presentes no processo têm precedência.
 */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;

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

      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
