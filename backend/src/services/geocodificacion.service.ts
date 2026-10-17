
export interface Coordenadas {
    latitud: number;
    longitud: number;
}

// Coordenadas ficticias utilizadas únicamente para pruebas
const ubicacionesSimuladas: Record<string, Coordenadas> = {
    'UTN': {
        latitud: -27.45,
        longitud: -58.98
    },
    'Aeropuerto': {
        latitud: -27.44,
        longitud: -59.05
    },
    'Terminal de Ómnibus': {
        latitud: -27.46,
        longitud: -58.99
    }
};

// Simula la conversión de una dirección a coordenadas
export async function obtenerCoordenadas(
    direccion: string
): Promise<Coordenadas | null> {

    const direccionNormalizada = direccion.trim();

    const coordenadas = ubicacionesSimuladas[direccionNormalizada];

    return coordenadas ?? null;
}
