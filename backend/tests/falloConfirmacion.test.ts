import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { pool } from '../src/db/pool';

// Simulamos un error técnico en la confirmación automática
vi.mock('../src/services/confirmacionReserva.service', () => ({
    confirmarReservaAutomaticamente: vi.fn().mockRejectedValue(
        new Error('Error técnico simulado durante la confirmación')
    )
}));

import { app } from '../src/app';

describe('Fallo técnico durante la confirmación automática', () => {

    it('conserva la reserva PENDIENTE si falla la confirmación', async () => {

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

        // Intentamos crear la reserva
        const respuesta = await request(app)
            .post('/reservas')
            .send(datosReserva);

        // La creación debe ser exitosa
        expect(respuesta.status).toBe(201);

        // La reserva debe quedar pendiente
        expect(respuesta.body.reserva.estado).toBe('PENDIENTE');

        // Consultamos directamente PostgreSQL
        const resultado = await pool.query(
            'SELECT id, estado FROM reserva WHERE clave_idempotencia = $1',
            [claveIdempotencia]
        );

        // Debe existir una sola reserva
        expect(resultado.rows).toHaveLength(1);

        expect(resultado.rows[0].estado).toBe('P');

        const reservaId = resultado.rows[0].id;

        // No debe existir un historial de confirmación
        const historial = await pool.query(
            `SELECT id FROM historial_reserva
            WHERE reserva_id = $1
            AND tipo_cambio = 'CAMBIO_ESTADO'
            AND valor_nuevo = 'CONFIRMADA'`,
            [reservaId]
        );

        expect(historial.rows).toHaveLength(0);

    });

});