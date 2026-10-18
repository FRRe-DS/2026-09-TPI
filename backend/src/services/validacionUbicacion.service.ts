
export interface ResultadoValidacionUbicacion {
    valido: boolean;
    motivo?: string;
}

// Validación simulada de ubicaciones
export async function validarUbicacion(
    origen: string,
    destino: string
): Promise<ResultadoValidacionUbicacion> {

    // Verificar que las direcciones no estén vacías
    if (!origen.trim() || !destino.trim()) {
        return {
            valido: false,
            motivo: 'El origen y el destino son obligatorios'
        };
    }

    // Simular una ubicación fuera de cobertura
    if (
        origen === 'FUERA_COBERTURA' ||
        destino === 'FUERA_COBERTURA'
    ) {
        return {
            valido: false,
            motivo: 'El origen o destino está fuera de la zona de cobertura'
        };
    }

    // El origen y destino no pueden ser iguales
    if (origen.trim().toLowerCase() === destino.trim().toLowerCase()) {
        return {
            valido: false,
            motivo: 'El origen y el destino deben ser diferentes'
        };
    }

    return {
        valido: true
    };
}
