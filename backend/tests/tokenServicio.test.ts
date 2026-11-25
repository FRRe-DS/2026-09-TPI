import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { obtenerTokenServicio, olvidarTokenServicio } from '../src/integraciones/tokenServicio';
import { AppError } from '../src/errors/AppError';
import { config } from '../src/config/env';

const original = { ...config };
let fetchSimulado: ReturnType<typeof vi.fn>;

function respuestaToken(token: string, expiraEnSeg = 300): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiraEnSeg }), { status: 200 });
}

async function capturarError(promesa: Promise<unknown>): Promise<AppError> {
  try {
    await promesa;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba un error y no hubo');
}

beforeEach(() => {
  olvidarTokenServicio();
  config.keycloakUrl = 'http://keycloak.test';
  config.keycloakRealm = 'ds-2026-realm';
  config.keycloakClientId = 'grupo-09';
  config.keycloakClientSecret = 'secreto-de-prueba';
  fetchSimulado = vi.fn();
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  Object.assign(config, original);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('tokenServicio.obtenerTokenServicio', () => {
  it('pide el token con client_credentials al realm configurado', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaToken('tok-1'));

    const token = await obtenerTokenServicio();

    expect(token).toBe('tok-1');
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe('http://keycloak.test/realms/ds-2026-realm/protocol/openid-connect/token');
    expect(opciones.method).toBe('POST');
    const cuerpo = new URLSearchParams(opciones.body);
    expect(cuerpo.get('grant_type')).toBe('client_credentials');
    expect(cuerpo.get('client_id')).toBe('grupo-09');
    expect(cuerpo.get('client_secret')).toBe('secreto-de-prueba');
  });

  it('reutiliza el token guardado mientras no esté por vencer', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaToken('tok-1', 300));

    await obtenerTokenServicio();
    const segundo = await obtenerTokenServicio();

    expect(segundo).toBe('tok-1');
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('lo renueva 30 segundos antes de que venza', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
    fetchSimulado
      .mockResolvedValueOnce(respuestaToken('tok-1', 300))
      .mockResolvedValueOnce(respuestaToken('tok-2', 300));

    await obtenerTokenServicio();
    vi.setSystemTime(new Date('2026-12-01T10:04:29Z')); // faltan 31 s: sigue el mismo
    expect(await obtenerTokenServicio()).toBe('tok-1');
    vi.setSystemTime(new Date('2026-12-01T10:04:31Z')); // faltan 29 s: se renueva
    expect(await obtenerTokenServicio()).toBe('tok-2');
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
  });

  it('si llegan pedidos juntos, hace un solo pedido a Keycloak', async () => {
    fetchSimulado.mockResolvedValueOnce(respuestaToken('tok-1'));

    const tokens = await Promise.all([obtenerTokenServicio(), obtenerTokenServicio()]);

    expect(tokens).toEqual(['tok-1', 'tok-1']);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
  });

  it('sin KEYCLOAK_URL o sin secreto: 503 sin llamar a Keycloak', async () => {
    config.keycloakClientSecret = '';

    const error = await capturarError(obtenerTokenServicio());

    expect(error.status).toBe(503);
    expect(error.codigo).toBe('SERVICIO_NO_DISPONIBLE');
    expect(error.detalle).toEqual({ modulo: 'KEYCLOAK' });
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('Keycloak caído: 503', async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError('fetch failed'));

    const error = await capturarError(obtenerTokenServicio());

    expect(error.status).toBe(503);
  });

  it('Keycloak rechaza el pedido (secreto incorrecto): 503 y no guarda nada', async () => {
    fetchSimulado
      .mockResolvedValueOnce(new Response('{"error":"unauthorized_client"}', { status: 401 }))
      .mockResolvedValueOnce(respuestaToken('tok-ok'));

    const error = await capturarError(obtenerTokenServicio());
    expect(error.status).toBe(503);
    expect(error.message).toContain('401');

    expect(await obtenerTokenServicio()).toBe('tok-ok');
  });

  it.each([['una página HTML', '<html></html>'], ['null', 'null']])('respuesta que es %s: 503', async (_caso, texto) => {
    fetchSimulado.mockResolvedValueOnce(new Response(texto, { status: 200 }));

    const error = await capturarError(obtenerTokenServicio());

    expect(error.status).toBe(503);
    expect(error.detalle).toEqual({ modulo: 'KEYCLOAK' });
  });

  it('respuesta sin access_token: 503', async () => {
    fetchSimulado.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const error = await capturarError(obtenerTokenServicio());

    expect(error.status).toBe(503);
  });
});
