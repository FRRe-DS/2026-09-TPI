import { describe, it, expect } from 'vitest';

import { validarUbicacion } from '../src/services/validacionUbicacion.service';

describe('Integración simulada con M4 - Ubicaciones', () => {
it('acepta ubicaciones válidas', async () => {

    const resultado = await validarUbicacion('UTN', 'Aeropuerto');

    expect(resultado.valido).toBe(true);
    expect(resultado.motivo).toBeUndefined();

});

    it('rechaza ubicaciones fuera de cobertura', async () => {

        const resultado = await validarUbicacion(
            'FUERA_COBERTURA',
            'Aeropuerto'
        );

        expect(resultado.valido).toBe(false);
        expect(resultado.motivo).toBe(
    'El origen o destino está fuera de la zona de cobertura'
);

    });

    it('rechaza cuando origen y destino son iguales', async () => {

        const resultado = await validarUbicacion('UTN', 'UTN');

        expect(resultado.valido).toBe(false);

    });

    it('rechaza ubicaciones vacías', async () => {

    const resultado = await validarUbicacion(
        '   ',
        'Aeropuerto'
    );

    expect(resultado.valido).toBe(false);

    expect(resultado.motivo).toBe(
        'El origen y el destino son obligatorios'
    );

});
});