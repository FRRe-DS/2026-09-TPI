import type { Notificacion } from './puertos/INotificador.js';

export type EstadoNotificacion = 'PENDIENTE' | 'ENTREGADA';

export interface NotificacionPendienteProps {
  id: string;
  notificacion: Notificacion;
  estado: EstadoNotificacion;
  intentos: number;
  ultimoError: string | null;
  creadaEn: Date;
  entregadaEn: Date | null;
}

/**
 * Una notificación que no se pudo entregar (por ejemplo, porque el servicio
 * de Notificaciones estaba caído en la versión B). Queda PENDIENTE.
 * Esta versión no tiene reintento: registrarIntentoFallido() y marcarEntregada()
 * dejan el dominio preparado para agregar ese caso de uso más adelante.
 */
export class NotificacionPendiente {
  private constructor(private props: NotificacionPendienteProps) {}

  static registrar(id: string, notificacion: Notificacion, error: string, ahora: Date): NotificacionPendiente {
    return new NotificacionPendiente({
      id,
      notificacion,
      estado: 'PENDIENTE',
      intentos: 1,
      ultimoError: error,
      creadaEn: ahora,
      entregadaEn: null,
    });
  }

  static reconstituir(props: NotificacionPendienteProps): NotificacionPendiente {
    return new NotificacionPendiente({ ...props });
  }

  registrarIntentoFallido(error: string): void {
    this.props.intentos += 1;
    this.props.ultimoError = error;
  }

  marcarEntregada(ahora: Date): void {
    this.props.estado = 'ENTREGADA';
    this.props.entregadaEn = ahora;
  }

  get id(): string { return this.props.id; }
  get estado(): EstadoNotificacion { return this.props.estado; }
  get notificacion(): Notificacion { return this.props.notificacion; }

  aProps(): NotificacionPendienteProps {
    return { ...this.props };
  }
}
