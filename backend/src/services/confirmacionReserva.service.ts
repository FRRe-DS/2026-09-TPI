
import { validarCliente } from './ValidacionCliente.service';
import { validarUbicacion } from './validacionUbicacion.service';
import { pool } from '../db/pool';
import {
    buscarReservaPorId,
    actualizarEstadoReserva
} from '../repositories/reserva.repository';

// Resultado de la validación de confirmación
export interface ResultadoConfirmacion {
    confirmada: boolean;
    motivo?: string;
}

// FUNCIÓN 1: Verificar si una reserva cumple las condiciones
export async function verificarConfirmacion(
    clienteId: string,
    origen: string,
    destino: string
): Promise<ResultadoConfirmacion> {

    // 1. Verificar que el cliente esté habilitado
    const resultadoCliente = await validarCliente(clienteId);

    if (!resultadoCliente.habilitado) {
        return {
            confirmada: false,
            motivo: resultadoCliente.motivo
                ?? 'El cliente no está habilitado'
        };
    }

    // 2. Verificar que las ubicaciones sean válidas
    const resultadoUbicacion = await validarUbicacion(
        origen,
        destino
    );

    if (!resultadoUbicacion.valido) {
        return {
            confirmada: false,
            motivo: resultadoUbicacion.motivo
                ?? 'El origen o destino no es válido'
        };
    }

    // 3. Todas las validaciones fueron correctas
    return {
        confirmada: true
    };
}

// FUNCIÓN 2: Confirmar automáticamente una reserva existente
export async function confirmarReservaAutomaticamente(
    reservaId: string
): Promise<ResultadoConfirmacion> {

    // 1. Buscar la reserva en PostgreSQL
    const reserva = await buscarReservaPorId(pool, reservaId);

    if (!reserva) {
        return {
            confirmada: false,
            motivo: 'La reserva no existe'
        };
    }

    // 2. Verificar que la reserva esté pendiente
    if (reserva.estado !== 'PENDIENTE') {
        return {
            confirmada: false,
            motivo: 'La reserva no está pendiente'
        };
    }

    // 3. Validar el cliente y las ubicaciones
    const resultado = await verificarConfirmacion(
        reserva.clienteId,
        reserva.origen.direccion,
        reserva.destino.direccion
    );

    if (!resultado.confirmada) {
        return resultado;
    }

    // 4. Cambiar el estado de PENDIENTE a CONFIRMADA
    // Obtener una conexión para ejecutar una transacción
const cliente = await pool.connect();

try {
    await cliente.query('BEGIN');

    // 1. Actualizar el estado de la reserva
    const reservaConfirmada = await actualizarEstadoReserva(
        cliente,
        reserva.id,
        'CONFIRMADA'
    );

    if (!reservaConfirmada) {
        await cliente.query('ROLLBACK');

        return {
            confirmada: false,
            motivo: 'La reserva ya no está pendiente'
        };
    }


 // PostgreSQL registra automáticamente el cambio en el historial.

 // Confirmar la actualización del estado.
    await cliente.query('COMMIT');

} catch (error) {
    await cliente.query('ROLLBACK');
    throw error;

} finally {
    cliente.release();
}
    // 5. Confirmación exitosa
    return {
        confirmada: true
    };
}
