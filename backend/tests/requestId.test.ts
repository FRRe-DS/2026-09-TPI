import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../src/integraciones/tokenServicio', () => ({
  obtenerTokenServicio: vi.fn(async () => 'token-de-prueba'),
}));

import { requestId } from '../src/middlewares/requestId';
import { llamarModulo } from '../src/integraciones/httpCliente';

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSimulado = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// App mínima con el middleware real y una ruta que llama a otro módulo.
function appDePrueba() {
  const app = express();
  app.use(requestId);
  app.get('/prueba', async (_req, res) => {
    await new Promise((resolver) => setTimeout(resolver, 5));
    await llamarModulo({ modulo: 'M2', metodo: 'GET', url: 'http://m2.test/api/v1/x' });
    res.json({ ok: true });
  });
  return app;
}

describe('middleware requestId + httpCliente', () => {
  it('reenvía a los otros módulos el X-Request-Id que trajo el pedido', async () => {
    const respuesta = await request(appDePrueba()).get('/prueba').set('X-Request-Id', 'pedido-123');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['x-request-id']).toBe('pedido-123');
    expect(fetchSimulado.mock.calls[0][1].headers['X-Request-Id']).toBe('pedido-123');
  });

  it('si el pedido no trae X-Request-Id, reenvía el que genera el middleware', async () => {
    const respuesta = await request(appDePrueba()).get('/prueba');

    const generado = respuesta.headers['x-request-id'];
    expect(generado).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchSimulado.mock.calls[0][1].headers['X-Request-Id']).toBe(generado);
  });
});
