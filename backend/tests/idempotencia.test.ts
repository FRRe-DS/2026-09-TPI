import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';

describe('Idempotencia en POST /reservas', () => {

    it('no crea dos reservas con la misma clave y los mismos datos', async () => {

        const claveIdempotencia = randomUUID();

        const datosReserva = {
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: new Date(
                Date.now() + 2 * 24 * 60 * 60 * 1000
            ).toISOString(),
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia
        };

        // Primera solicitud
        const primeraRespuesta = await request(app)
            .post('/reservas')
            .send(datosReserva);

        expect(primeraRespuesta.status).toBe(201);

        // Repetimos exactamente la misma solicitud
        const segundaRespuesta = await request(app)
            .post('/reservas')
            .send(datosReserva);

        expect(segundaRespuesta.status).toBe(200);

        // Las dos respuestas deben referirse a la misma reserva
        expect(segundaRespuesta.body.reserva.id)
            .toBe(primeraRespuesta.body.reserva.id);

    });

    it('devuelve 409 si se reutiliza la clave con datos diferentes', async () => {

        const claveIdempotencia = randomUUID();

        const datosReserva = {
            clienteId: '25',
            origen: 'UTN',
            destino: 'Aeropuerto',
            tipoVehiculo: 'AUTO',
            fechaHora: new Date(
                Date.now() + 2 * 24 * 60 * 60 * 1000
            ).toISOString(),
            zonaHoraria: 'America/Argentina/Cordoba',
            claveIdempotencia
        };

        // Creamos una reserva
        const primeraRespuesta = await request(app)
            .post('/reservas')
            .send(datosReserva);

        expect(primeraRespuesta.status).toBe(201);

        // Reutilizamos la clave, pero cambiamos el destino
        const segundaRespuesta = await request(app)
            .post('/reservas')
            .send({
                ...datosReserva,
                destino: 'Terminal de Ómnibus'
            });

        expect(segundaRespuesta.status).toBe(409);
        expect(segundaRespuesta.body.codigo)
            .toBe('CONFLICTO_IDEMPOTENCIA');

    });

    it('no crea reservas duplicadas cuando llegan dos solicitudes simultáneas', async () => {

    const claveIdempotencia = randomUUID();

    const datosReserva = {
        clienteId: '25',
        origen: 'UTN',
        destino: 'Aeropuerto',
        tipoVehiculo: 'AUTO',
        fechaHora: new Date(
            Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        zonaHoraria: 'America/Argentina/Cordoba',
        claveIdempotencia
    };

    // Enviamos las dos solicitudes al mismo tiempo
    const [primeraRespuesta, segundaRespuesta] = await Promise.all([
        request(app).post('/reservas').send(datosReserva),
        request(app).post('/reservas').send(datosReserva)
    ]);

    // Una solicitud debe crear la reserva y la otra recuperarla
    const estados = [
        primeraRespuesta.status,
        segundaRespuesta.status
    ].sort();

    expect(estados).toEqual([200, 201]);

    // Las dos respuestas deben referirse a la misma reserva
    expect(primeraRespuesta.body.reserva.id)
        .toBe(segundaRespuesta.body.reserva.id);

});

it('devuelve 409 si se reutiliza la clave con coordenadas diferentes', async () => {

    const claveIdempotencia = randomUUID();

    const datosReserva = {
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
        fechaHora: new Date(
            Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
        zonaHoraria: 'America/Argentina/Cordoba',
        claveIdempotencia
    };

    // Primera solicitud: crea la reserva
    const primeraRespuesta = await request(app)
        .post('/reservas')
        .send(datosReserva);

    expect(primeraRespuesta.status).toBe(201);

    // Segunda solicitud: misma clave y dirección,
    // pero con una latitud diferente
    const segundaRespuesta = await request(app)
        .post('/reservas')
        .send({
            ...datosReserva,
            origen: {
                ...datosReserva.origen,
                latitud: -27.4700
            }
        });

    expect(segundaRespuesta.status).toBe(409);
    expect(segundaRespuesta.body.codigo)
        .toBe('CONFLICTO_IDEMPOTENCIA');

});

});