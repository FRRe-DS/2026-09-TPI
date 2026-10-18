import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

describe('Historial de confirmación automática', () => {

    it('registra el cambio de PENDIENTE a CONFIRMADA', async () => {

        // Programamos una reserva para dentro de 2 días
        const fechaReserva = new Date(
            Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString();

        // Creamos una reserva válida
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

        // Verificamos que se creó y confirmó
        expect(respuesta.status).toBe(201);
        expect(respuesta.body.reserva.estado).toBe('CONFIRMADA');

        // Obtenemos el ID de la reserva creada
        const reservaId = respuesta.body.reserva.id;

     // Consultamos el historial directamente en PostgreSQL
        const resultado = await pool.query(
    `SELECT *
    FROM historial_reserva
    WHERE reserva_id = $1
    AND tipo_cambio = 'Y'
    AND campo_modificado = 'estado'`,
    [reservaId]
);
        // Debe existir exactamente un registro de confirmación
        expect(resultado.rows).toHaveLength(1);

        const historial = resultado.rows[0];

        // Comprobamos los estados registrados
        expect(historial.valor_anterior).toBe('P');
        expect(historial.valor_nuevo).toBe('C');

        // Comprobamos quién realizó el cambio
        expect(historial.actor_id).toBeNull();
        expect(historial.rol_actor).toBe('S');

    });

});