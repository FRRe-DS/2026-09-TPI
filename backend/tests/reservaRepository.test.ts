// Pruebas de integración de las funciones de modificar y cancelar del repositorio.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db/pool';
import {
  actualizarDatosReserva,
  cancelarReservaEnBase,
} from '../src/repositories/reserva.repository';
import { limpiarBase, crearReservaDePrueba, cerrarBase, enHoras } from './helpers';

beforeEach(limpiarBase);
afterAll(cerrarBase);

const NUEVO_ORIGEN = { direccion: 'Nuevo origen 123', latitud: -27.46, longitud: -58.98 };
const NUEVO_DESTINO = { direccion: 'Nuevo destino 456', latitud: -27.47, longitud: -58.99 };

describe('actualizarDatosReserva', () => {
  it('modifica los datos de una reserva PENDIENTE', async () => {
    const reserva = await crearReservaDePrueba('PENDIENTE');
    const cambiada = await actualizarDatosReserva(pool, reserva.id, {
      origen: NUEVO_ORIGEN,
      destino: NUEVO_DESTINO,
      tipoVehiculo: 'MOTO',
      fechaHora: new Date(enHoras(48)),
      zonaHoraria: 'America/Argentina/Cordoba',
      tarifaEstimada: 1234,
    });
    expect(cambiada?.tipoVehiculo).toBe('MOTO');
    expect(cambiada?.tarifaEstimada).toBe(1234);
    expect(cambiada?.origen.direccion).toBe('Nuevo origen 123');
    expect(cambiada?.zonaHoraria).toBe('America/Argentina/Cordoba');
  });

  it('devuelve null si la reserva ya está ACTIVADA', async () => {
    const reserva = await crearReservaDePrueba('ACTIVADA');
    const cambiada = await actualizarDatosReserva(pool, reserva.id, { tarifaEstimada: 1 });
    expect(cambiada).toBeNull();
  });
});

describe('cancelarReservaEnBase', () => {
  it('cancela una reserva CONFIRMADA y guarda el motivo', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');
    const cancelada = await cancelarReservaEnBase(pool, reserva.id, 'Cambié de planes');
    expect(cancelada?.estado).toBe('CANCELADA');
    expect(cancelada?.motivoCancelacion).toBe('Cambié de planes');
  });

  it('devuelve null si la reserva ya está ACTIVADA', async () => {
    const reserva = await crearReservaDePrueba('ACTIVADA');
    const cancelada = await cancelarReservaEnBase(pool, reserva.id, 'Tarde');
    expect(cancelada).toBeNull();
  });
});