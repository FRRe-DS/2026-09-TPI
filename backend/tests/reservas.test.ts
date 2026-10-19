import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PoolClient } from 'pg';
import type { Reserva } from '../src/models/reserva';

vi.mock('../src/config/env', () => ({ config: {
  anticipacionMinimaMinutos: 60, anticipacionMaximaDias: 30, corsOrigin: '*',
} }));
vi.mock('../src/db/pool', () => ({ pool: {}, transaccion: vi.fn() }));
vi.mock('../src/repositories/reserva.repository');
vi.mock('../src/repositories/historial.repository');

import { app } from '../src/app';
import { transaccion } from '../src/db/pool';
import { actualizarDatosReserva, buscarReservaPorId, cancelarReservaEnBase, confirmarReservaEnBase } from '../src/repositories/reserva.repository';
import { listarHistorial, registrarHistorial } from '../src/repositories/historial.repository';
import { confirmarReserva } from '../src/services/confirmarReserva.service';

const id = '11111111-1111-4111-8111-111111111111';
const db = {} as PoolClient;
let reserva: Reserva;

beforeEach(() => {
  vi.resetAllMocks();
  reserva = {
    id, clienteId: 'cli-001', estado: 'CONFIRMADA', tipoVehiculo: 'AUTO',
    origen: { direccion: 'Centro', latitud: -27.45, longitud: -58.98 },
    destino: { direccion: 'Aeropuerto', latitud: -27.44, longitud: -59.05 },
    fechaHora: new Date(Date.now() + 86_400_000), zonaHoraria: 'America/Argentina/Buenos_Aires',
    tarifaEstimada: 4750, motivoCancelacion: null, solicitudDespachoId: null,
    claveIdempotencia: id, creadaEn: new Date(), modificadaEn: new Date(),
  };
  vi.mocked(transaccion).mockImplementation(async (trabajo) => trabajo(db));
  vi.mocked(buscarReservaPorId).mockImplementation(async () => reserva);
  vi.mocked(actualizarDatosReserva).mockImplementation(async (_db, _id, cambios) => ({ ...reserva, ...cambios }));
  vi.mocked(confirmarReservaEnBase).mockImplementation(async (_db, _id, tarifa) => ({ ...reserva, estado: 'CONFIRMADA', tarifaEstimada: tarifa }));
  vi.mocked(cancelarReservaEnBase).mockImplementation(async (_db, _id, motivo) => ({ ...reserva, estado: 'CANCELADA', motivoCancelacion: motivo ?? null }));
});

describe('reservas con repositorios simulados (sin base de datos)', () => {
  it('confirma una pendiente y registra tarifa e historial en la transacción recibida', async () => {
    reserva.estado = 'PENDIENTE';
    // AUTO: 1000 + 300 por km; Centro -> Aeropuerto = 7 km
    expect(await confirmarReserva(id, db)).toMatchObject({ estado: 'CONFIRMADA', tarifaEstimada: 3100 });
    expect(transaccion).not.toHaveBeenCalled();
    expect(registrarHistorial).toHaveBeenCalledExactlyOnceWith(db, expect.objectContaining({ tipoCambio: 'CONFIRMACION' }));
  });

  it('rechaza la confirmación si el cliente no está habilitado', async () => {
    reserva.estado = 'PENDIENTE';
    reserva.clienteId = 'bloqueado-001';
    await expect(confirmarReserva(id)).rejects.toMatchObject({ status: 422 });
    expect(confirmarReservaEnBase).not.toHaveBeenCalled();
    expect(registrarHistorial).not.toHaveBeenCalled();
  });

  it('reprograma, cambia el vehículo y recalcula la tarifa', async () => {
    const fechaHora = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await request(app).patch(`/reservas/${id}`).send({ fechaHora, tipoVehiculo: 'MOTO' });
    expect(res.status).toBe(200);
    // Misma tarifa que al crear: 1000 + 200 por km en MOTO; Centro -> Aeropuerto = 7 km
    expect(res.body).toMatchObject({ fechaHora, tipoVehiculo: 'MOTO', tarifaEstimada: 2400 });
    expect(registrarHistorial).toHaveBeenCalledTimes(3);
  });

  it('impide modificar o cancelar reservas activadas y canceladas', async () => {
    for (const estado of ['ACTIVADA', 'CANCELADA'] as const) {
      reserva.estado = estado;
      expect((await request(app).patch(`/reservas/${id}`).send({ tipoVehiculo: 'MOTO' })).status).toBe(409);
      expect((await request(app).post(`/reservas/${id}/cancelar`).send({ motivo: 'Cambio de planes' })).status).toBe(409);
    }
    expect(actualizarDatosReserva).not.toHaveBeenCalled();
    expect(cancelarReservaEnBase).not.toHaveBeenCalled();
  });

  it('rechaza fechas fuera de la anticipación mínima y máxima', async () => {
    for (const minutos of [30, 31 * 24 * 60]) {
      const fechaHora = new Date(Date.now() + minutos * 60_000).toISOString();
      const res = await request(app).patch(`/reservas/${id}`).send({ fechaHora });
      expect(res.status).toBe(422);
      expect(res.body.codigo).toBe('REGLA_INCUMPLIDA');
    }
    expect(actualizarDatosReserva).not.toHaveBeenCalled();
  });

  it('acepta origen como texto, igual que al crear', async () => {
    const res = await request(app).patch(`/reservas/${id}`).send({ origen: 'UTN' });
    expect(res.status).toBe(200);
    expect(res.body.origen).toEqual({ direccion: 'UTN', latitud: -27.45, longitud: -58.98 });
  });

  it('rechaza modificar si origen y destino quedan en el mismo punto', async () => {
    const res = await request(app).patch(`/reservas/${id}`).send({ origen: 'Aeropuerto' });
    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('ORIGEN_DESTINO_IGUALES');
    expect(actualizarDatosReserva).not.toHaveBeenCalled();
  });

  it('cancela guardando el motivo en la reserva y el historial', async () => {
    const res = await request(app).post(`/reservas/${id}/cancelar`).send({ motivo: 'Cambié de planes' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'CANCELADA', motivoCancelacion: 'Cambié de planes' });
    expect(registrarHistorial).toHaveBeenCalledExactlyOnceWith(db, expect.objectContaining({ tipoCambio: 'CANCELACION', motivo: 'Cambié de planes' }));
  });

  it('rechaza cancelar sin motivo', async () => {
    const res = await request(app).post(`/reservas/${id}/cancelar`).send({});
    expect(res.status).toBe(400);
    expect(cancelarReservaEnBase).not.toHaveBeenCalled();
  });

  it('devuelve el historial de la reserva', async () => {
    vi.mocked(listarHistorial).mockResolvedValue([{
      id, reservaId: id, tipoCambio: 'CONFIRMACION', campoModificado: 'estado',
      valorAnterior: 'PENDIENTE', valorNuevo: 'CONFIRMADA', actorId: null,
      rolActor: 'SISTEMA', motivo: null, fechaCambio: new Date(),
    }]);
    const res = await request(app).get(`/reservas/${id}/historial`);
    expect(res.status).toBe(200);
    expect(res.body[0].tipoCambio).toBe('CONFIRMACION');
  });

  it('devuelve 404 cuando la reserva no existe', async () => {
    vi.mocked(buscarReservaPorId).mockResolvedValue(null);
    const res = await request(app).get(`/reservas/${id}/historial`);
    expect(res.status).toBe(404);
    expect(listarHistorial).not.toHaveBeenCalled();
  });
});
