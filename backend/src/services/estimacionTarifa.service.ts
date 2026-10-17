// RF-9.4: Simulación del Módulo 7 (Tarifas)

export interface ResultadoEstimacionTarifa {
    tarifaEstimada: number;
}

export async function estimarTarifa(
    tipoVehiculo: 'AUTO' | 'MOTO'
): Promise<ResultadoEstimacionTarifa> {

    // Valores ficticios utilizados únicamente para pruebas
    const tarifaEstimada = tipoVehiculo === 'AUTO'
        ? 5000 //auto $5000
        : 3000; //moto $3000

    return {
        tarifaEstimada
    };
}