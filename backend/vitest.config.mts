import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false, // los archivos de prueba comparten la base: uno por vez
    testTimeout: 15000,
  },
});