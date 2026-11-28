import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/integraciones/tokenServicio', () => ({
  obtenerTokenServicio: vi.fn(async () => 'token-de-prueba'),
}));

import {
  correspondeCargo, estimarTarifa, METODO_CARGO, MINUTOS_SIN_CARGO, registrarCargoCancelacion,
} from '../src/integraciones/m7Tarifas';
import { config } from '../src/config/env';

function respuesta(status: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

const fetchSimulado = vi.fn();
const fechaHora = new Date('2026-12-10T19:00:00.000Z');

beforeEach(() => {
  fetchSimulado.mockReset();
  vi.stubGlobal('fetch', fetchSimulado);
  config.m7Url = 'http://m7.prueba';
});

describe('M7 - estimación de tarifa (RF-9.4)', () => {
  it('envía tipo en minúscula, distancia, duración y fecha; devuelve desglose.total', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(200, { regla_id: 'r1', moneda: 'ARS', desglose: { total: 4750.5 } }));
    const total = await estimarTarifa({ tipoVehiculo: 'MOTO', distanciaKm: 7.25, duracionMin: 18, fechaHora });
    expect(total).toBe(4750.5);
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe('http://m7.prueba/api/v1/tarifas/estimaciones');
    expect(opciones.method).toBe('POST');
    expect(JSON.parse(opciones.body)).toEqual({
      tipo_vehiculo: 'moto', distancia_km: 7.25, duracion_estimada_min: 18, fecha_hora: '2026-12-10T19:00:00.000Z',
    });
  });

  it('respuesta sin desglose.total o con error: 503 de M7', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(200, { moneda: 'ARS' }));
    await expect(estimarTarifa({ tipoVehiculo: 'AUTO', distanciaKm: 1, duracionMin: 2, fechaHora }))
      .rejects.toMatchObject({ status: 503, codigo: 'SERVICIO_NO_DISPONIBLE', detalle: { modulo: 'M7' } });
    fetchSimulado.mockResolvedValueOnce(respuesta(422, { codigo: 'SIN_REGLA' }));
    await expect(estimarTarifa({ tipoVehiculo: 'AUTO', distanciaKm: 1, duracionMin: 2, fechaHora }))
      .rejects.toMatchObject({ status: 503 });
  });
});

describe('M7 - cargo de cancelación (RF-9.7)', () => {
  const ahora = new Date('2026-12-10T12:00:00.000Z');

  it(`sin cargo hasta ${MINUTOS_SIN_CARGO} minutos antes del viaje; después, con cargo`, () => {
    expect(correspondeCargo(new Date(ahora.getTime() + 61 * 60_000), ahora)).toBe(false);
    expect(correspondeCargo(new Date(ahora.getTime() + 60 * 60_000), ahora)).toBe(false);
    expect(correspondeCargo(new Date(ahora.getTime() + 59 * 60_000), ahora)).toBe(true);
  });

  it('envía el cargo con Idempotency-Key igual al id de la reserva', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(201, { cargo_id: 'x' }));
    await registrarCargoCancelacion({ reservaId: 'r-1', clienteId: 'c-1', tipoVehiculo: 'AUTO', motivo: 'Me surgió algo' });
    const [url, opciones] = fetchSimulado.mock.calls[0];
    expect(url).toBe('http://m7.prueba/api/v1/cargos-cancelacion');
    expect(opciones.headers['Idempotency-Key']).toBe('r-1');
    expect(JSON.parse(opciones.body)).toEqual({
      reserva_id: 'r-1', cliente_id: 'c-1', tipo_vehiculo: 'auto', metodo: METODO_CARGO, motivo: 'Me surgió algo',
    });
  });

  it('recorta el motivo a 500 caracteres, el máximo que acepta M7', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(201, {}));
    await registrarCargoCancelacion({ reservaId: 'r', clienteId: 'c', tipoVehiculo: 'AUTO', motivo: 'x'.repeat(600) });
    expect(JSON.parse(fetchSimulado.mock.calls[0][1].body).motivo).toHaveLength(500);
  });

  it.each([200, 409, 422])('HTTP %i: sigue sin error (ya registrado o sin cargo según M7)', async (status) => {
    fetchSimulado.mockResolvedValueOnce(respuesta(status, {}));
    await expect(registrarCargoCancelacion({ reservaId: 'r', clienteId: 'c', tipoVehiculo: 'MOTO', motivo: 'xyz' }))
      .resolves.toBeUndefined();
  });

  it('otra respuesta: 503 de M7', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(400, {}));
    await expect(registrarCargoCancelacion({ reservaId: 'r', clienteId: 'c', tipoVehiculo: 'MOTO', motivo: 'xyz' }))
      .rejects.toMatchObject({ status: 503, detalle: { modulo: 'M7' } });
  });
});
