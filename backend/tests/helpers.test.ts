import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db/pool';
import { limpiarBase, crearReservaDePrueba, cerrarBase } from './helpers';

beforeEach(limpiarBase);
afterAll(cerrarBase);

describe('ayudas de prueba', () => {
  it('crea una reserva en el estado pedido', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');
    expect(reserva.estado).toBe('CONFIRMADA');
  });

  it('el trigger de la base deja una fila de historial de creación', async () => {
    const reserva = await crearReservaDePrueba();
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM historial_reserva WHERE reserva_id = $1 AND tipo_cambio = 'C'`,
      [reserva.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('limpiarBase vacía las tablas', async () => {
    await crearReservaDePrueba();
    await limpiarBase();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM reserva');
    expect(rows[0].n).toBe(0);
  });
});