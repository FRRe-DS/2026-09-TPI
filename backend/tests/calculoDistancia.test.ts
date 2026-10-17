//comprobamos que M9 pueda pasar coordenadas validas al servicio simulado de M4 y recibir una distancia

import { describe, it, expect } from 'vitest';
import { calcularDistancia } from '../src/services/calculoDistancia.service';

describe('Integración simulada M9 con M4 - Distancias', () => {

    it('envía coordenadas válidas y recibe una distancia', async () => {

        const resultado = await calcularDistancia(
            { latitud: -27.45, longitud: -58.98 },
            { latitud: -27.44, longitud: -59.05 }
        );

        expect(resultado.distanciaKm).toBeGreaterThan(0);
        expect(resultado.distanciaKm).toBeLessThan(10);

    });

    it('rechaza coordenadas fuera del rango permitido', async () => {

        await expect(
            calcularDistancia(
                { latitud: 100, longitud: -58.98 },
                { latitud: -27.44, longitud: -59.05 }
            )
        ).rejects.toThrow(
            'Las coordenadas están fuera del rango permitido'
        );

    });

    it('rechaza coordenadas que no son números válidos', async () => {

        await expect(
            calcularDistancia(
                { latitud: NaN, longitud: -58.98 },
                { latitud: -27.44, longitud: -59.05 }
            )
        ).rejects.toThrow(
            'Las coordenadas deben ser números válidos'
        );

    });

});
