import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';

describe('GET /reservas/:id', () => {

    it('devuelve 200 cuando la reserva existe', async () => {

        // Primero creamos una reserva para tener un ID válido
        const fechaReserva = new Date(
            Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString();

        const respuestaCreacion = await request(app)
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

        expect(respuestaCreacion.status).toBe(201);

        // Obtenemos el ID de la reserva creada
        const reservaId = respuestaCreacion.body.reserva.id;

        // Consultamos la reserva mediante su ID
        const respuestaConsulta = await request(app)
            .get(`/reservas/${reservaId}`);

        expect(respuestaConsulta.status).toBe(200);
        expect(respuestaConsulta.body.id).toBe(reservaId);
        expect(respuestaConsulta.body.clienteId).toBe('25');
        expect(respuestaConsulta.body.estado).toBe('CONFIRMADA');

    });

    it('devuelve 404 cuando la reserva no existe', async () => {

        const idInexistente = randomUUID();

        const respuesta = await request(app)
            .get(`/reservas/${idInexistente}`);

        expect(respuesta.status).toBe(404);
        expect(respuesta.body.error).toBe('Reserva no encontrada');

    });

    it('devuelve 400 cuando el ID de la reserva es inválido', async () => {

    const respuesta = await request(app)
        .get('/reservas/abc123');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.codigo).toBe('ID_INVALIDO');

});

});