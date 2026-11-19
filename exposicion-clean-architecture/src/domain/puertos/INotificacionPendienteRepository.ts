import type { NotificacionPendiente } from '../NotificacionPendiente.js';

/**
 * Puerto de salida para guardar las notificaciones que no se pudieron entregar.
 * Implementación concreta: NotificacionPendienteRepositoryEnMemoria.
 * Lo usan: CrearReserva (guarda la notificación como PENDIENTE si falla) y ListarPendientes.
 */
export interface INotificacionPendienteRepository {
  /** Inserta o reemplaza (mismo id). Se usa al registrar la falla y al marcarla entregada. */
  guardar(pendiente: NotificacionPendiente): Promise<void>;

  /** Solo las que están en estado PENDIENTE, de la más vieja a la más nueva. */
  listarPendientes(): Promise<NotificacionPendiente[]>;
}
