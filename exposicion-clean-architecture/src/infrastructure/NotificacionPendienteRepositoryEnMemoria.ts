import {
  NotificacionPendiente,
  type INotificacionPendienteRepository,
  type NotificacionPendienteProps,
} from '../domain/index.js';

export class NotificacionPendienteRepositoryEnMemoria implements INotificacionPendienteRepository {
  private readonly datos = new Map<string, NotificacionPendienteProps>();

  async guardar(pendiente: NotificacionPendiente): Promise<void> {
    this.datos.set(pendiente.id, structuredClone(pendiente.aProps()));
  }

  async listarPendientes(): Promise<NotificacionPendiente[]> {
    return [...this.datos.values()]
      .filter((props) => props.estado === 'PENDIENTE')
      .sort((a, b) => a.creadaEn.getTime() - b.creadaEn.getTime())
      .map((props) => NotificacionPendiente.reconstituir(structuredClone(props)));
  }
}
