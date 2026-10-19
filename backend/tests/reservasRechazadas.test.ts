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
                clienteId: 'bloqueado-001',
                origen: 'UTN',
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: new Date(
                    Date.now() + 2 * 24 * 60 * 60 * 1000
                ).toISOString(),
                zonaHoraria: 'America/Argentina/Cordoba',
                claveIdempotencia
            });

        expect(respuesta.status).toBe(422);
        expect(respuesta.body.codigo).toBe('REGLA_INCUMPLIDA');
        expect(respuesta.body.detalle.regla).toBe('CLIENTE_NO_HABILITADO');

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
                origen: {
                    direccion: 'Ruta 11 km 1000 FUERA DE ZONA',
                    latitud: -26.18,
                    longitud: -58.17
                },
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: new Date(
                    Date.now() + 2 * 24 * 60 * 60 * 1000
                ).toISOString(),
                zonaHoraria: 'America/Argentina/Cordoba',
                claveIdempotencia
            });

        expect(respuesta.status).toBe(422);
        expect(respuesta.body.codigo).toBe('REGLA_INCUMPLIDA');
        expect(respuesta.body.detalle.regla).toBe('FUERA_DE_COBERTURA');

        // Comprobamos que no se guardó en PostgreSQL
        const resultado = await pool.query(
            'SELECT id FROM reserva WHERE clave_idempotencia = $1',
            [claveIdempotencia]
        );

        expect(resultado.rows).toHaveLength(0);

    });

});