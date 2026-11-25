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

  it.each(['', '3s'])('TIMEOUT_MODULOS_MS="%s" usa el valor por defecto', async (valor) => {
    vi.stubEnv('TIMEOUT_MODULOS_MS', valor);
    vi.resetModules();
    const { config } = await import('../src/config/env');
    expect(config.timeoutModulosMs).toBe(3000);
  });

  it('KEYCLOAK_REALM y KEYCLOAK_CLIENT_ID vacíos usan los valores de la tarea', async () => {
    vi.stubEnv('KEYCLOAK_REALM', '');
    vi.stubEnv('KEYCLOAK_CLIENT_ID', '');
    vi.resetModules();
    const { config } = await import('../src/config/env');
    expect(config.keycloakRealm).toBe('ds-2026-realm');
    expect(config.keycloakClientId).toBe('grupo-09');
  });
});
