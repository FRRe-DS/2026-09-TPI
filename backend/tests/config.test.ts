import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('config/env', () => {
  it('lanza un error claro si falta TEST_DATABASE_URL', async () => {
    vi.stubEnv('TEST_DATABASE_URL', '');
    vi.resetModules();
    await expect(import('../src/config/env')).rejects.toThrow('TEST_DATABASE_URL');
  });
});