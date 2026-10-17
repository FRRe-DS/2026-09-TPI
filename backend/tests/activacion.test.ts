// Pruebas de la activación sin duplicados (la que hay que mostrar en la defensa).
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { limpiarBase, crearReservaDePrueba, cerrarBase } from './helpers';
import { solicitudesDeReserva, reiniciarStubM5 } from '../src/stubs/m5Despacho.stub';

beforeEach(async () => {
  await limpiarBase();
  reiniciarStubM5();
});
afterAll(cerrarBase);

describe('POST /reservas/:id/activar', () => {
  it('activa una reserva CONFIRMADA y guarda la solicitud de M5', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');
    const res = await request(app).post(`/reservas/${reserva.id}/activar`);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ACTIVADA');
    expect(res.body.solicitudDespachoId).toMatch(/^sol-/);
  });

  it('la segunda activación responde 409 y no crea otra solicitud', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');
    await request(app).post(`/reservas/${reserva.id}/activar`);
    const segunda = await request(app).post(`/reservas/${reserva.id}/activar`);
    expect(segunda.status).toBe(409);
    expect(solicitudesDeReserva(reserva.id)).toHaveLength(1);
  });

  it('CONCURRENCIA: 10 activaciones al mismo tiempo crean UNA sola solicitud', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');

    // Un único servidor encendido y "precalentado", para que los 10 pedidos
    // lleguen de verdad al mismo tiempo (si no, el primero se adelanta).
    const servidor = app.listen(0);
    await request(servidor).get('/health');

    // Disparamos 10 pedidos a la vez, sin esperar uno por uno
    const respuestas = await Promise.all(
      Array.from({ length: 10 }, () => request(servidor).post(`/reservas/${reserva.id}/activar`)),
    );
    servidor.close();

    const exitos = respuestas.filter((r) => r.status === 200);
    const rechazos = respuestas.filter((r) => r.status === 409);
    expect(exitos).toHaveLength(1);
    expect(rechazos).toHaveLength(9);
    expect(solicitudesDeReserva(reserva.id)).toHaveLength(1);

    // Y en la base quedó una sola línea de historial de activación
    const { rows } = await pool.query(
      `SELECT count(*)::int AS cantidad FROM historial_reserva
       WHERE reserva_id = $1 AND tipo_cambio = 'A'`,
      [reserva.id],
    );
    expect(rows[0].cantidad).toBe(1);
  });

  it('no activa una reserva CANCELADA (409)', async () => {
    const reserva = await crearReservaDePrueba('CANCELADA');
    const res = await request(app).post(`/reservas/${reserva.id}/activar`);
    expect(res.status).toBe(409);
    expect(solicitudesDeReserva(reserva.id)).toHaveLength(0);
  });

  it('responde 404 si la reserva no existe', async () => {
    const res = await request(app).post('/reservas/00000000-0000-0000-0000-000000000000/activar');
    expect(res.status).toBe(404);
  });
});