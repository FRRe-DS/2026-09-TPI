import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { randomUUID } from 'crypto';

describe('POST /reservas', () => {

    it('devuelve 400 cuando faltan datos obligatorios', async () => {

        const respuesta = await request(app)
            .post('/reservas')
            .send({
                clienteId: '25',
                origen: '',
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: '2026-10-20T09:00:00-03:00',
                zonaHoraria: 'America/Argentina/Cordoba',
                claveIdempotencia: '550e8400-e29b-41d4-a716-446655440020'
            });

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.codigo).toBe('DATOS_INCOMPLETOS');

    });

    it('devuelve 400 cuando el tipo de vehículo es inválido', async () => {

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'CAMION',
            fechaHora: '2026-10-20T09:00:00-03:00',
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: '550e8400-e29b-41d4-a716-446655440021'
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('TIPO_VEHICULO_INVALIDO');

    });

    it('devuelve 400 cuando la anticipación es insuficiente', async () => {

    // Programamos la reserva para dentro de 10 minutos
    const fechaReserva = new Date(
        Date.now() + 10 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: '550e8400-e29b-41d4-a716-446655440022'
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('ANTICIPACION_INSUFICIENTE');

});
it('devuelve 400 cuando se supera la anticipación máxima', async () => {

    // Programamos la reserva para dentro de 31 días
    const fechaReserva = new Date(
        Date.now() + 31 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: '550e8400-e29b-41d4-a716-446655440023'
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('ANTICIPACION_EXCEDIDA');

});

it('devuelve 400 cuando la fecha de la reserva es inválida', async () => {

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: 'fecha-incorrecta',
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: '550e8400-e29b-41d4-a716-446655440024'
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('FECHA_INVALIDA');

});
it('devuelve 400 cuando la zona horaria es inválida', async () => {

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: '2026-10-20T09:00:00-03:00',
            zonaHoraria: 'Argentina123',
            claveIdempotencia: '550e8400-e29b-41d4-a716-446655440025'
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('ZONA_HORARIA_INVALIDA');

});
it('devuelve 400 cuando el origen está fuera de cobertura', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'FUERA_COBERTURA',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('UBICACION_INVALIDA');

});
it('devuelve 403 cuando el cliente está bloqueado', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: 'CLIENTE_BLOQUEADO',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.codigo).toBe('CLIENTE_NO_HABILITADO');

});
it('crea una reserva AUTO con tarifa estimada de 5000', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(201);
    expect(Number(respuesta.body.reserva.tarifaEstimada)).toBe(5000);
    expect(respuesta.body.reserva.estado).toBe('CONFIRMADA');

});
it('crea una reserva MOTO con tarifa estimada de 3000', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'MOTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(201);
    expect(Number(respuesta.body.reserva.tarifaEstimada)).toBe(3000);
    expect(respuesta.body.reserva.estado).toBe('CONFIRMADA');

});
});