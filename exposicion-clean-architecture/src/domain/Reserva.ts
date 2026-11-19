import { ErrorDeDominio } from './ErrorDeDominio.js';
import { ReglaAnticipacion } from './ReglaAnticipacion.js';

export type EstadoReserva = 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA';

export type TipoVehiculo = 'AUTO' | 'MOTO';

export interface DatosNuevaReserva {
  id: string;
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
}

/** Foto completa de una reserva. La usan los repositorios para guardar y reconstruir. */
export interface ReservaProps extends DatosNuevaReserva {
  estado: EstadoReserva;
  motivoCancelacion: string | null;
  creadaEn: Date;
  modificadaEn: Date;
}

const TIPOS_VEHICULO: readonly TipoVehiculo[] = ['AUTO', 'MOTO'];

/**
 * Entidad Reserva. Solo conoce sus reglas: estados, transiciones y ventana de
 * anticipación. No sabe de base de datos, HTTP ni notificaciones.
 *
 *   PENDIENTE ──confirmar()──> CONFIRMADA
 *       │                          │
 *       └──────cancelar()──────────┴──> CANCELADA (final)
 *
 * `ahora` se recibe como parámetro para que las reglas de tiempo se puedan
 * probar sin depender del reloj real.
 */
export class Reserva {
  private constructor(private props: ReservaProps) {}

  /** Crea una reserva nueva en estado PENDIENTE, validando datos y anticipación. */
  static crear(datos: DatosNuevaReserva, regla: ReglaAnticipacion, ahora: Date): Reserva {
    for (const campo of ['id', 'clienteId', 'origen', 'destino'] as const) {
      if (!datos[campo]?.trim()) {
        throw new ErrorDeDominio('DATOS_INVALIDOS', `El campo ${campo} es obligatorio`);
      }
    }
    if (!TIPOS_VEHICULO.includes(datos.tipoVehiculo)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', `Tipo de vehículo inválido: ${datos.tipoVehiculo}`);
    }
    if (!(datos.fechaHora instanceof Date) || Number.isNaN(datos.fechaHora.getTime())) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'La fecha y hora del viaje es inválida');
    }
    regla.validar(datos.fechaHora, ahora);

    return new Reserva({
      ...datos,
      estado: 'PENDIENTE',
      motivoCancelacion: null,
      creadaEn: ahora,
      modificadaEn: ahora,
    });
  }

  /** Reconstruye una reserva ya guardada, sin volver a validar la anticipación. */
  static reconstituir(props: ReservaProps): Reserva {
    return new Reserva({ ...props });
  }

  confirmar(ahora: Date): void {
    if (this.props.estado !== 'PENDIENTE') {
      throw new ErrorDeDominio(
        'TRANSICION_INVALIDA',
        `Solo se puede confirmar una reserva PENDIENTE (está ${this.props.estado})`,
      );
    }
    this.props.estado = 'CONFIRMADA';
    this.props.modificadaEn = ahora;
  }

  cancelar(motivo: string, ahora: Date): void {
    if (this.props.estado === 'CANCELADA') {
      throw new ErrorDeDominio('TRANSICION_INVALIDA', 'La reserva ya está cancelada');
    }
    if (!motivo?.trim()) {
      throw new ErrorDeDominio('MOTIVO_REQUERIDO', 'Para cancelar hay que indicar un motivo');
    }
    this.props.estado = 'CANCELADA';
    this.props.motivoCancelacion = motivo.trim();
    this.props.modificadaEn = ahora;
  }

  get id(): string { return this.props.id; }
  get clienteId(): string { return this.props.clienteId; }
  get estado(): EstadoReserva { return this.props.estado; }
  get fechaHora(): Date { return this.props.fechaHora; }

  /** Copia de los datos, para guardar o devolver por la API. */
  aProps(): ReservaProps {
    return { ...this.props };
  }
}
