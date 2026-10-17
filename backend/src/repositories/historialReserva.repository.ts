import { Ejecutor } from '../db/pool';

export async function registrarCambioEstado(
    db: Ejecutor,
    reservaId: string,
    estadoAnterior: string,
    estadoNuevo: string
): Promise<void> {

    await db.query(
        `INSERT INTO historial_reserva (
            reserva_id,
            tipo_cambio,
            campo_modificado,
            valor_anterior,
            valor_nuevo,
            actor_id,
            rol_actor,
            motivo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            reservaId,
            'CAMBIO_ESTADO',
            'estado',
            estadoAnterior,
            estadoNuevo,
            'SISTEMA_M9',
            'SISTEMA',
            'Confirmación automática de reserva'
        ]
    );
}