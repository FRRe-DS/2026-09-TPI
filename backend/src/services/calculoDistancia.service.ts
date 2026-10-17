//es una simulacion de la respuesta del M4

import { Coordenadas } from './geocodificacion.service';

export interface ResultadoCalculoDistancia {
    distanciaKm: number;
}

// Convierte grados a radianes
function convertirARadianes(grados: number): number {
    return grados * (Math.PI / 180);
}

// Simulación del cálculo de distancia de M4
export async function calcularDistancia(
    origen: Coordenadas,
    destino: Coordenadas
): Promise<ResultadoCalculoDistancia> {

    const coordenadas = [
        origen.latitud,
        origen.longitud,
        destino.latitud,
        destino.longitud
    ];

    // Validar que las coordenadas sean números válidos
    if (coordenadas.some(valor => !Number.isFinite(valor))) {
        throw new Error('Las coordenadas deben ser números válidos');
    }

    // Validar rangos geográficos
    if (
        Math.abs(origen.latitud) > 90 ||
        Math.abs(destino.latitud) > 90 ||
        Math.abs(origen.longitud) > 180 ||
        Math.abs(destino.longitud) > 180
    ) {
        throw new Error('Las coordenadas están fuera del rango permitido');
    }

    // Radio aproximado de la Tierra en kilómetros
    const radioTierra = 6371;

    // Diferencia entre las coordenadas
    const diferenciaLatitud = convertirARadianes(
        destino.latitud - origen.latitud
    );

    const diferenciaLongitud = convertirARadianes(
        destino.longitud - origen.longitud
    );

    const latitudOrigen = convertirARadianes(origen.latitud);
    const latitudDestino = convertirARadianes(destino.latitud);

    // Fórmula de Haversine
    const a =
        Math.sin(diferenciaLatitud / 2) ** 2 +
        Math.cos(latitudOrigen) *
        Math.cos(latitudDestino) *
        Math.sin(diferenciaLongitud / 2) ** 2;

    const distanciaCentral = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(Math.max(0, 1 - a))
    );

    const distanciaKm = radioTierra * distanciaCentral;

    return {
        distanciaKm: Number(distanciaKm.toFixed(2))
    };
}