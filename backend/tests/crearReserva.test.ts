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

    it('devuelve 422 cuando la anticipación es insuficiente', async () => {

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

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.codigo).toBe('REGLA_INCUMPLIDA');
    expect(respuesta.body.detalle.regla).toBe('ANTICIPACION_INSUFICIENTE');

});
it('devuelve 422 cuando se supera la anticipación máxima', async () => {

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

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.codigo).toBe('REGLA_INCUMPLIDA');
    expect(respuesta.body.detalle.regla).toBe('ANTICIPACION_EXCEDIDA');

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
it('devuelve 422 cuando el origen está fuera de cobertura', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: {
                direccion: 'Ruta 11 km 1000 FUERA DE ZONA',
                latitud: -26.18,
                longitud: -58.17
            },
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.codigo).toBe('REGLA_INCUMPLIDA');
    expect(respuesta.body.detalle.regla).toBe('FUERA_DE_COBERTURA');

});
it('devuelve 422 cuando el cliente está bloqueado', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: 'bloqueado-001',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.codigo).toBe('REGLA_INCUMPLIDA');
    expect(respuesta.body.detalle.regla).toBe('CLIENTE_NO_HABILITADO');

});
// Tarifa simulada de M7: 1000 + 300 por km (AUTO) o 200 por km (MOTO). UTN -> Aeropuerto = 7 km.
it('crea una reserva AUTO con tarifa estimada según los km (3100)', async () => {

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
    expect(Number(respuesta.body.reserva.tarifaEstimada)).toBe(3100);
    expect(respuesta.body.reserva.estado).toBe('CONFIRMADA');

});
it('crea una reserva MOTO con tarifa estimada según los km (2400)', async () => {

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
    expect(Number(respuesta.body.reserva.tarifaEstimada)).toBe(2400);
    expect(respuesta.body.reserva.estado).toBe('CONFIRMADA');

});

it('crea una reserva con coordenadas enviadas desde el mapa', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: {
                direccion: 'French 414, Resistencia',
                latitud: -27.4606,
                longitud: -58.9839
            },
            destino: {
                direccion: 'Aeropuerto Resistencia',
                latitud: -27.4497,
                longitud: -59.0561
            },
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(201);

    expect(respuesta.body.reserva.origen).toEqual({
        direccion: 'French 414, Resistencia',
        latitud: -27.4606,
        longitud: -58.9839
    });

    expect(respuesta.body.reserva.destino).toEqual({
        direccion: 'Aeropuerto Resistencia',
        latitud: -27.4497,
        longitud: -59.0561
    });

});

it('devuelve 400 cuando las coordenadas son inválidas', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: {
                direccion: 'French 414, Resistencia',
                latitud: -100,
                longitud: -58.9839
            },
            destino: {
                direccion: 'Aeropuerto Resistencia',
                latitud: -27.4497,
                longitud: -59.0561
            },
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('DATOS_INCOMPLETOS');

});

it('devuelve 400 cuando origen y destino tienen las mismas coordenadas', async () => {

    const fechaReserva = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString();

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: {
                direccion: 'French 414, Resistencia',
                latitud: -27.4606,
                longitud: -58.9839
            },
            destino: {
                direccion: 'Otro punto del mapa',
                latitud: -27.4606,
                longitud: -58.9839
            },
            tipoVehiculo: 'AUTO',
            fechaHora: fechaReserva,
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('ORIGEN_DESTINO_IGUALES');

});

it('todos los errores usan el formato { codigo, mensaje, detalle }', async () => {

    const respuesta = await request(app)
        .post('/reservas')
        .send({ claveIdempotencia: 'no-es-uuid' });

    expect(respuesta.status).toBe(400);
    expect(Object.keys(respuesta.body).sort()).toEqual(['codigo', 'detalle', 'mensaje']);

});

it('devuelve 422 cuando la fecha ya pasó', async () => {

    const respuesta = await request(app)
        .post('/reservas')
        .send({
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia: randomUUID()
        });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.detalle.regla).toBe('FECHA_PASADA');

});

});
