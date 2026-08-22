import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/support/setup.ts'],
  },
  resolve: {
    alias: {
      // `server-only` só existe para quebrar o build quando um módulo de
      // servidor vaza para o cliente; nos testes ele vira um módulo vazio.
      'server-only': fileURLToPath(new URL('./tests/support/server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
