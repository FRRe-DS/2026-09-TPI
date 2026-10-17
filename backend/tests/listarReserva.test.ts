import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';

describe('GET /reservas', () => {

    it('devuelve 400 cuando no se indica el clienteId', async () => {

        const respuesta = await request(app)
            .get('/reservas');

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.codigo).toBe('CLIENTE_ID_REQUERIDO');

    });

    it('devuelve las reservas de un cliente', async () => {

        // Usamos un cliente diferente para cada ejecución
        const clienteId = `CLIENTE_TEST_${randomUUID()}`;

        const fechaReserva = new Date(
            Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString();

        // Primero creamos una reserva
        const respuestaCreacion = await request(app)
            .post('/reservas')
            .send({
                clienteId: clienteId,
                origen: 'UTN',
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: fechaReserva,
                zonaHoraria: 'America/Argentina/Cordoba',
                claveIdempotencia: randomUUID()
            });

        expect(respuestaCreacion.status).toBe(201);

        const reservaId = respuestaCreacion.body.reserva.id;

        // Después consultamos las reservas del cliente
        const respuestaListado = await request(app)
            .get('/reservas')
            .query({ clienteId: clienteId });

        expect(respuestaListado.status).toBe(200);
        expect(Array.isArray(respuestaListado.body)).toBe(true);
        expect(respuestaListado.body).toHaveLength(1);
        expect(respuestaListado.body[0].id).toBe(reservaId);
        expect(respuestaListado.body[0].clienteId).toBe(clienteId);

    });

});