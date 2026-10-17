
import { describe, it, expect } from 'vitest';
import { obtenerCoordenadas } from '../src/services/geocodificacion.service';

describe('M9 - Geocodificación de direcciones', () => {

    it('obtiene las coordenadas de una ubicación conocida', async () => {

        const resultado = await obtenerCoordenadas('UTN');

        expect(resultado).toEqual({
            latitud: -27.45,
            longitud: -58.98
        });

    });

    it('devuelve null cuando la dirección es desconocida', async () => {

        const resultado = await obtenerCoordenadas('DireccionDesconocida');

        expect(resultado).toBeNull();

    });

    it('elimina los espacios al principio y al final de la dirección', async () => {

        const resultado = await obtenerCoordenadas('  Aeropuerto  ');

        expect(resultado).toEqual({
            latitud: -27.44,
            longitud: -59.05
        });

    });

});
