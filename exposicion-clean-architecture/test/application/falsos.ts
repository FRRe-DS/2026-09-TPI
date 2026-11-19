/**
 * Implementaciones falsas de los puertos, solo para las pruebas.
 * Permiten probar los casos de uso sin base de datos, sin servidor y sin red.
 */
import {
  Reserva,
  NotificacionPendiente,
  ErrorDeNotificacion,
  type Notificacion,
  type IReservaRepository,
  type INotificador,
  type INotificacionPendienteRepository,
} from '../../src/domain/index.js';

export class ReservaRepositoryFalso implements IReservaRepository {
  readonly datos = new Map<string, ReturnType<Reserva['aProps']>>();

  async guardar(reserva: Reserva): Promise<void> {
    this.datos.set(reserva.id, reserva.aProps());
  }

  async buscarPorId(id: string): Promise<Reserva | null> {
    const props = this.datos.get(id);
    return props ? Reserva.reconstituir(props) : null;
  }

  async listarPorCliente(clienteId: string): Promise<Reserva[]> {
    return [...this.datos.values()].filter((p) => p.clienteId === clienteId).map(Reserva.reconstituir);
  }
}

/** Registra lo que se le pidió notificar. Con `fallar = true` simula Notificaciones caído. */
export class NotificadorFalso implements INotificador {
  readonly enviadas: Notificacion[] = [];
  fallar = false;

  async notificar(notificacion: Notificacion): Promise<void> {
    if (this.fallar) throw new ErrorDeNotificacion('Servicio de notificaciones no disponible');
    this.enviadas.push(notificacion);
  }
}

export class PendientesRepositoryFalso implements INotificacionPendienteRepository {
  readonly datos = new Map<string, ReturnType<NotificacionPendiente['aProps']>>();

  async guardar(pendiente: NotificacionPendiente): Promise<void> {
    this.datos.set(pendiente.id, pendiente.aProps());
  }

  async listarPendientes(): Promise<NotificacionPendiente[]> {
    return [...this.datos.values()]
      .filter((p) => p.estado === 'PENDIENTE')
      .map(NotificacionPendiente.reconstituir);
  }
}
