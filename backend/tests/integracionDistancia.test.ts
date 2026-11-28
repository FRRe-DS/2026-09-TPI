import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { app } from '../src/app';
import './m4Simulado';

it('crea una reserva con direcciones de texto mediante el contrato HTTP de M4', async () => {
  const respuesta = await request(app)
    .post('/reservas')
    .send({
      claveIdempotencia: randomUUID(),
      clienteId: '25',
      origen: 'UTN',
      destino: 'Aeropuerto',
      tipoVehiculo: 'AUTO',
      fechaHora: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      zonaHoraria: 'America/Argentina/Cordoba',
    });

  expect(respuesta.status).toBe(201);
  expect(respuesta.body.reserva).toMatchObject({
    origen: { direccion: 'UTN', latitud: -27.45, longitud: -58.98 },
    destino: { direccion: 'Aeropuerto', latitud: -27.44, longitud: -59.05 },
    tarifaEstimada: 3100,
  });
  const llamadas = vi.mocked(fetch).mock.calls;
  expect(llamadas).toContainEqual([
    'http://m4.prueba/api/v1/geocodificaciones',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ direccion: 'UTN', localidad: 'Resistencia', pais: 'AR' }) }),
  ]);
  expect(llamadas).toContainEqual([
    'http://m4.prueba/api/v1/rutas/estimacion?origen_latitud=-27.45&origen_longitud=-58.98&destino_latitud=-27.44&destino_longitud=-59.05&tipo_vehiculo=AUTO',
    expect.objectContaining({ method: 'GET' }),
  ]);
});
