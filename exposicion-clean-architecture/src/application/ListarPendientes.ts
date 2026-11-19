import type { NotificacionPendiente, INotificacionPendienteRepository } from '../domain/index.js';

/** Caso de uso: listar las notificaciones que no se pudieron entregar (escenario 4). */
export class ListarPendientes {
  constructor(private readonly pendientes: INotificacionPendienteRepository) {}

  ejecutar(): Promise<NotificacionPendiente[]> {
    return this.pendientes.listarPendientes();
  }
}
