import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

// RF-9.12: cada cambio de estado deja su fila en historial_reserva, escrita por el backend.
function datosReserva() {
    return {
        clienteId: '25',
        origen: 'UTN',
        destino: 'Aeropuerto',
        tipoVehiculo: 'AUTO',
        fechaHora: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        zonaHoraria: 'America/Argentina/Cordoba',
        claveIdempotencia: randomUUID()
    };
}

async function filasDeHistorial(reservaId: string, tipoCambio: string) {
    const { rows } = await pool.query(
        `SELECT * FROM historial_reserva
         WHERE reserva_id = $1 AND tipo_cambio = $2 AND campo_modificado = 'estado'`,
        [reservaId, tipoCambio]
    );
    return rows;
}

describe('Historial de la reserva', () => {

    it('registra la creación (C) hecha por el cliente', async () => {

        const respuesta = await request(app).post('/reservas').send(datosReserva());
        expect(respuesta.status).toBe(201);

        const filas = await filasDeHistorial(respuesta.body.reserva.id, 'C');
        expect(filas).toHaveLength(1);
        expect(filas[0].valor_anterior).toBeNull();
        expect(filas[0].valor_nuevo).toBe('PENDIENTE');
        expect(filas[0].actor_id).toBe('25');
        expect(filas[0].rol_actor).toBe('C');

    });

    it('registra el cambio de PENDIENTE a CONFIRMADA (Y) hecho por el sistema', async () => {

        const respuesta = await request(app).post('/reservas').send(datosReserva());

        // Verificamos que se creó y confirmó
        expect(respuesta.status).toBe(201);
        expect(respuesta.body.reserva.estado).toBe('CONFIRMADA');

        // Debe existir exactamente un registro de confirmación
        const filas = await filasDeHistorial(respuesta.body.reserva.id, 'Y');
        expect(filas).toHaveLength(1);

        // Comprobamos los estados registrados
        expect(filas[0].valor_anterior).toBe('PENDIENTE');
        expect(filas[0].valor_nuevo).toBe('CONFIRMADA');

        // Comprobamos quién realizó el cambio
        expect(filas[0].actor_id).toBeNull();
        expect(filas[0].rol_actor).toBe('S');

    });

    it('el historial completo sale ordenado por GET /reservas/:id/historial', async () => {

        const creada = await request(app).post('/reservas').send(datosReserva());
        const id = creada.body.reserva.id;

        await request(app).post(`/reservas/${id}/activar`).expect(200);

        const historial = await request(app).get(`/reservas/${id}/historial`);
        expect(historial.status).toBe(200);
        expect(historial.body.map((h: { tipoCambio: string }) => h.tipoCambio))
            .toEqual(['CREACION', 'CONFIRMACION', 'ACTIVACION']);

    });

});
