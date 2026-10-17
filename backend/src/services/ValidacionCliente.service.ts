// Simulación de la validación de clientes del Módulo 2

export interface ResultadoValidacionCliente {
    habilitado: boolean;
    motivo?: string;
}

export async function validarCliente(
    clienteId: string
): Promise<ResultadoValidacionCliente> {

    // Cliente deshabilitado para nuestras pruebas
    if (clienteId === 'CLIENTE_BLOQUEADO') {
        return {
            habilitado: false,
            motivo: 'El cliente no está habilitado para realizar reservas'
        };
    }

    // Cliente habilitado simulado
    return {
        habilitado: true
    };
}