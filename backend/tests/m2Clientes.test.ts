import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/integraciones/tokenServicio', () => ({
  obtenerTokenServicio: vi.fn(async () => 'token-de-prueba'),
}));

import { verificarClienteHabilitado } from '../src/integraciones/m2Clientes';
import { config } from '../src/config/env';

function respuesta(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const fetchSimulado = vi.fn();

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
  config.m2Url = 'http://m2.prueba';
});

describe('M2 - estado de cuenta del cliente (RF-9.3)', () => {
  it('llama a GET /api/v1/clientes/{clienteId}/estado-cuenta con el token de servicio', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(200, { clienteId: 'c1', estado: 'ACTIVO', bloqueosVigentes: [] }));
    expect(await verificarClienteHabilitado('c 1/x')).toBe(true);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe('http://m2.prueba/api/v1/clientes/c%201%2Fx/estado-cuenta');
    expect(opciones.method).toBe('GET');
    expect(opciones.headers.Authorization).toBe('Bearer token-de-prueba');
  });

  it('BLOQUEADO: el cliente no está habilitado', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(200, { clienteId: 'c1', estado: 'BLOQUEADO', bloqueosVigentes: [] }));
    expect(await verificarClienteHabilitado('c1')).toBe(false);
  });

  it.each([404, 400])('HTTP %i: 422 con regla CLIENTE_INEXISTENTE', async (status) => {
    fetchSimulado.mockResolvedValueOnce(respuesta(status, { codigo: 'X' }));
    await expect(verificarClienteHabilitado('c1')).rejects.toMatchObject({
      status: 422, codigo: 'REGLA_INCUMPLIDA', detalle: { regla: 'CLIENTE_INEXISTENTE' },
    });
  });

  it('respuesta inesperada (401 o estado desconocido): 503 SERVICIO_NO_DISPONIBLE de M2', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(401));
    await expect(verificarClienteHabilitado('c1')).rejects.toMatchObject({
      status: 503, codigo: 'SERVICIO_NO_DISPONIBLE', detalle: { modulo: 'M2' },
    });
    fetchSimulado.mockResolvedValueOnce(respuesta(200, { clienteId: 'c1', estado: 'OTRO' }));
    await expect(verificarClienteHabilitado('c1')).rejects.toMatchObject({ status: 503 });
  });

  it('M2 caído: 503 SERVICIO_NO_DISPONIBLE', async () => {
    fetchSimulado.mockRejectedValue(new TypeError('fetch failed'));
    await expect(verificarClienteHabilitado('c1')).rejects.toMatchObject({
      status: 503, codigo: 'SERVICIO_NO_DISPONIBLE', detalle: { modulo: 'M2' },
    });
  });
});
