import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { AUTH_HABILITADA: 'false' }, // Los tests de autenticación la habilitan de forma explícita.
    fileParallelism: false, // los archivos de prueba comparten la base: uno por vez
    testTimeout: 15000,
        coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 90 },
    },
  },
});
