// Parte C: ningún llamado a otro módulo dentro de una transacción abierta, y cada módulo
// se llama una sola vez al crear. También el cargo de cancelación (M7) y la métrica de rechazos.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { cancelarReservaEnBase, buscarReservaPorId } from '../src/repositories/reserva.repository';
import { confirmarReserva } from '../src/services/confirmarReserva.service';
import { reservasCreadasCounter } from '../src/telemetry/metrics';
import { crearReservaDePrueba, datosValidos, limpiarBase } from './helpers';
import { activarModulosSimulados, contarLlamados, LlamadoSimulado, URL_M2, URL_M7 } from './modulosSimulados';

let llamados: LlamadoSimulado[];

beforeEach(async () => {
  await limpiarBase();
  vi.restoreAllMocks();
  llamados = activarModulosSimulados();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// Ejecuta "antes" justo cuando llega un llamado cuya URL contiene "ruta", y después responde normal.
function alLlamarA(ruta: string, antes: () => Promise<unknown>) {
  const fetchSimulado = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, opciones?: RequestInit) => {
    if (String(url).includes(ruta)) await antes();
    return fetchSimulado(url, opciones);
  });
}

async function historial(reservaId: string, tipoCambio: string) {
  const { rows } = await pool.query(
    'SELECT * FROM historial_reserva WHERE reserva_id = $1 AND tipo_cambio = $2', [reservaId, tipoCambio],
  );
  return rows;
}

describe('Crear una reserva', () => {
  it('llama una sola vez a M2 y una sola vez a M7 (la confirmación usa la tarifa ya estimada)', async () => {
    const res = await request(app).post('/reservas').send({ ...datosValidos(), claveIdempotencia: randomUUID() });
    expect(res.status).toBe(201);
    expect(res.body.reserva.estado).toBe('CONFIRMADA');
    expect(contarLlamados(llamados, URL_M2)).toBe(1);
    expect(contarLlamados(llamados, URL_M7)).toBe(1);
  });
});

describe('Confirmar una reserva', () => {
  it('si la reserva cambia de estado mientras se consulta a M7, responde 409 y no la confirma', async () => {
    const reserva = await crearReservaDePrueba('PENDIENTE');
    // Si hubiera una transacción abierta con la fila bloqueada, este UPDATE quedaría esperando.
    alLlamarA('/tarifas/estimaciones', () => cancelarReservaEnBase(pool, reserva.id, 'Cancelada en el medio'));
    await expect(confirmarReserva(reserva.id)).rejects.toMatchObject({ status: 409 });
    expect((await buscarReservaPorId(pool, reserva.id))?.estado).toBe('CANCELADA');
    expect(await historial(reserva.id, 'Y')).toHaveLength(0);
  });

  it('confirma una PENDIENTE validando con M2 y M7 y deja la Y en el historial', async () => {
    const reserva = await crearReservaDePrueba('PENDIENTE');
    expect(await confirmarReserva(reserva.id)).toMatchObject({ estado: 'CONFIRMADA' });
    expect(contarLlamados(llamados, URL_M2)).toBe(1);
    expect(contarLlamados(llamados, URL_M7)).toBe(1);
    expect(await historial(reserva.id, 'Y')).toHaveLength(1);
  });

  it('404 si no existe y 409 si no está PENDIENTE', async () => {
    await expect(confirmarReserva(randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(confirmarReserva(randomUUID(), 1000)).rejects.toMatchObject({ status: 404 });
    const confirmada = await crearReservaDePrueba('CONFIRMADA');
    await expect(confirmarReserva(confirmada.id)).rejects.toMatchObject({ status: 409 });
    await expect(confirmarReserva(confirmada.id, 1000)).rejects.toMatchObject({ status: 409 });
  });
});

describe('Modificar una reserva', () => {
  it('si la reserva cambia de estado mientras se consulta a M7, responde 409 y no la modifica', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');
    alLlamarA('/tarifas/estimaciones', () => cancelarReservaEnBase(pool, reserva.id, 'Cancelada en el medio'));
    const res = await request(app).patch(`/reservas/${reserva.id}`).send({ tipoVehiculo: 'MOTO' });
    expect(res.status).toBe(409);
    expect((await buscarReservaPorId(pool, reserva.id))?.tipoVehiculo).toBe('AUTO');
    expect(await historial(reserva.id, 'M')).toHaveLength(0);
  });

  it('reprogramar solo la fecha no llama a M7; si además cambia el vehículo, M7 recibe la nueva fecha', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA');
    const fechaHora = new Date(Date.now() + 48 * 3_600_000).toISOString();
    expect((await request(app).patch(`/reservas/${reserva.id}`).send({ fechaHora })).status).toBe(200);
    expect(contarLlamados(llamados, URL_M7)).toBe(0);

    const otraFecha = new Date(Date.now() + 72 * 3_600_000).toISOString();
    const res = await request(app).patch(`/reservas/${reserva.id}`).send({ fechaHora: otraFecha, tipoVehiculo: 'MOTO' });
    expect(res.status).toBe(200);
    const estimacion = llamados.find((l) => l.url === `${URL_M7}/api/v1/tarifas/estimaciones`);
    expect(estimacion?.cuerpo).toMatchObject({ tipo_vehiculo: 'moto', fecha_hora: otraFecha });
  });
});

describe('Cancelar una reserva (RF-9.7)', () => {
  const cargos = () => llamados.filter((l) => l.url === `${URL_M7}/api/v1/cargos-cancelacion`);

  it('CONFIRMADA a menos de 60 minutos del viaje: registra el cargo en M7 y cancela', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA', 0.75);
    const res = await request(app).post(`/reservas/${reserva.id}/cancelar`).send({ motivo: 'Me surgió algo' });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('CANCELADA');
    expect(cargos()).toHaveLength(1);
    expect(cargos()[0].encabezados['Idempotency-Key']).toBe(reserva.id);
    expect(cargos()[0].cuerpo).toMatchObject({ reserva_id: reserva.id, metodo: 'tarjeta', motivo: 'Me surgió algo' });
  });

  it('con 60 minutos o más de anticipación, o si está PENDIENTE: cancela sin cargo', async () => {
    const lejana = await crearReservaDePrueba('CONFIRMADA', 24);
    const pendiente = await crearReservaDePrueba('PENDIENTE', 0.75);
    for (const { id } of [lejana, pendiente]) {
      expect((await request(app).post(`/reservas/${id}/cancelar`).send({ motivo: 'Cambio de planes' })).status).toBe(200);
    }
    expect(cargos()).toHaveLength(0);
  });

  it('si M7 no responde, no cancela (503) y la reserva sigue CONFIRMADA', async () => {
    const reserva = await crearReservaDePrueba('CONFIRMADA', 0.75);
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/cargos-cancelacion')) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ access_token: 't', expires_in: 300 }), { status: 200 });
    });
    const res = await request(app).post(`/reservas/${reserva.id}/cancelar`).send({ motivo: 'Me surgió algo' });
    expect(res.status).toBe(503);
    expect((await buscarReservaPorId(pool, reserva.id))?.estado).toBe('CONFIRMADA');
    expect(await historial(reserva.id, 'X')).toHaveLength(0);
  });
});

describe('Métrica de rechazos al crear', () => {
  it('suma "rechazada" con la regla o el código como motivo; un reintento con la misma clave no cuenta', async () => {
    const add = vi.spyOn(reservasCreadasCounter, 'add');
    const bloqueado = { ...datosValidos({ clienteId: 'bloqueado-001' }), claveIdempotencia: randomUUID() };
    expect((await request(app).post('/reservas').send(bloqueado)).status).toBe(422);
    expect((await request(app).post('/reservas').send({ claveIdempotencia: randomUUID() })).status).toBe(400);
    expect(add).toHaveBeenNthCalledWith(1, 1, { resultado: 'rechazada', motivo: 'CLIENTE_NO_HABILITADO' });
    expect(add).toHaveBeenNthCalledWith(2, 1, { resultado: 'rechazada', motivo: 'DATOS_INCOMPLETOS' });

    add.mockClear();
    const valida = { ...datosValidos(), claveIdempotencia: randomUUID() };
    expect((await request(app).post('/reservas').send(valida)).status).toBe(201);
    expect((await request(app).post('/reservas').send(valida)).status).toBe(200);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(1, { resultado: 'creada', tipoVehiculo: 'AUTO' });
  });
});
