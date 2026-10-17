
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';

vi.mock('../src/services/calculoDistancia.service', () => ({
    calcularDistancia: vi.fn().mockResolvedValue({
        distanciaKm: 7.25
    })
}));

import { app } from '../src/app';
import { calcularDistancia } from '../src/services/calculoDistancia.service';

describe('Integración M9 con M4 - Cálculo de distancia', () => {

    it('envía las coordenadas al crear una reserva', async () => {

        const respuesta = await request(app)
            .post('/reservas')
            .send({
                claveIdempotencia: randomUUID(),
                clienteId: '25',
                origen: 'UTN',
                destino: 'Aeropuerto',
                tipoVehiculo: 'AUTO',
                fechaHora: new Date(
                    Date.now() + 2 * 24 * 60 * 60 * 1000
                ).toISOString(),
                zonaHoraria: 'America/Argentina/Cordoba'
            });

        expect(respuesta.status).toBe(201);

        expect(vi.mocked(calcularDistancia)).toHaveBeenCalledWith(
            { latitud: -27.45, longitud: -58.98 },
            { latitud: -27.44, longitud: -59.05 }
        );

    });

});
