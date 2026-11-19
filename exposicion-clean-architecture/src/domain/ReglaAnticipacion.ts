import { ErrorDeDominio } from './ErrorDeDominio.js';

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

/**
 * Ventana de anticipación de una reserva (RF-9.2 del TPI): el viaje tiene que
 * ser al menos `minimaMinutos` después de ahora y como mucho `maximaDias`.
 * Por defecto, de 60 minutos a 30 días, igual que el contrato de M9.
 *
 * Los valores se reciben por constructor; quien los lee de variables de
 * entorno es la composición de dependencias, no el dominio.
 */
export class ReglaAnticipacion {
  constructor(
    public readonly minimaMinutos: number = 60,
    public readonly maximaDias: number = 30,
  ) {
    if (minimaMinutos < 0 || maximaDias <= 0 || minimaMinutos * MS_POR_MINUTO >= maximaDias * MS_POR_DIA) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'La ventana de anticipación es inválida');
    }
  }

  validar(fechaHora: Date, ahora: Date): void {
    const diferencia = fechaHora.getTime() - ahora.getTime();
    if (diferencia <= 0) {
      throw new ErrorDeDominio('FECHA_PASADA', 'La fecha del viaje ya pasó');
    }
    if (diferencia < this.minimaMinutos * MS_POR_MINUTO) {
      throw new ErrorDeDominio(
        'ANTICIPACION_INSUFICIENTE',
        `La reserva debe realizarse con al menos ${this.minimaMinutos} minutos de anticipación`,
      );
    }
    if (diferencia > this.maximaDias * MS_POR_DIA) {
      throw new ErrorDeDominio(
        'ANTICIPACION_EXCEDIDA',
        `La reserva no puede hacerse con más de ${this.maximaDias} días de anticipación`,
      );
    }
  }
}
