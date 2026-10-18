import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

describe('Reservas rechazadas', () => {

    it('no guarda una reserva cuando el cliente está bloqueado', async () => {

        const claveIdempotencia = randomUUID();

        const respuesta = await request(app)
            .post('/reservas')
            .send({
                clienteId: 'CLIENTE_BLOQUEADO',
                origen: 'UTN',
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: new Date(
                    Date.now() + 2 * 24 * 60 * 60 * 1000
                ).toISOString(),
                zonaHoraria: 'America/Argentina/Cordoba',
                claveIdempotencia
            });

        expect(respuesta.status).toBe(403);
        expect(respuesta.body.codigo).toBe('CLIENTE_NO_HABILITADO');

        // Comprobamos que no se guardó en PostgreSQL
        const resultado = await pool.query(
            'SELECT id FROM reserva WHERE clave_idempotencia = $1',
            [claveIdempotencia]
        );

        expect(resultado.rows).toHaveLength(0);

    });

    it('no guarda una reserva cuando la ubicación está fuera de cobertura', async () => {

        const claveIdempotencia = randomUUID();

        const respuesta = await request(app)
            .post('/reservas')
            .send({
                clienteId: '25',
                origen: 'FUERA_COBERTURA',
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: new Date(
                    Date.now() + 2 * 24 * 60 * 60 * 1000
                ).toISOString(),
                zonaHoraria: 'America/Argentina/Cordoba',
                claveIdempotencia
            });

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.codigo).toBe('UBICACION_INVALIDA');

        // Comprobamos que no se guardó en PostgreSQL
        const resultado = await pool.query(
            'SELECT id FROM reserva WHERE clave_idempotencia = $1',
            [claveIdempotencia]
        );

        expect(resultado.rows).toHaveLength(0);

    });

});