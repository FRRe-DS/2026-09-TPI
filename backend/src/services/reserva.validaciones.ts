import { config } from '../config/env';
import { errores } from '../errors/AppError';
import { CambiosReserva, Direccion } from '../models/reserva';

const CAMPOS = ['origen', 'destino', 'tipoVehiculo', 'fechaHora', 'zonaHoraria'];

// Compartida por creación, confirmación y modificación.
export function validarVentana(fecha: Date, ahora = new Date()): void {
  const anticipacion = fecha.getTime() - ahora.getTime();
  if (!Number.isFinite(anticipacion) || anticipacion <= 0 ||
      anticipacion < config.anticipacionMinimaMinutos * 60_000 ||
      anticipacion > config.anticipacionMaximaDias * 86_400_000) {
    throw errores.reglaIncumplida('La fecha está fuera de la ventana de anticipación permitida');
  }
}

function validarDireccion(valor: unknown): Direccion {
  const d = valor as Direccion | null;
  if (!d || typeof d.direccion !== 'string' || !d.direccion.trim() ||
      !Number.isFinite(d.latitud) || Math.abs(d.latitud) > 90 ||
      !Number.isFinite(d.longitud) || Math.abs(d.longitud) > 180 ||
      ['alias', 'piso', 'indicaciones'].some((campo) => {
        const dato = d[campo as keyof Direccion];
        return dato != null && typeof dato !== 'string';
      })) {
    throw errores.datosInvalidos(['La dirección debe incluir texto y coordenadas válidas']);
  }
  return d;
}

export function validarCambios(cuerpo: unknown): CambiosReserva {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || !Object.keys(cuerpo).length) {
    throw errores.datosInvalidos(['Mandá al menos un campo para modificar']);
  }
  if (Object.keys(cuerpo).some((campo) => !CAMPOS.includes(campo))) {
    throw errores.datosInvalidos([`Solo se puede modificar: ${CAMPOS.join(', ')}`]);
  }
  const datos = cuerpo as Record<string, unknown>;
  const cambios: CambiosReserva = {};
  if ('origen' in datos) cambios.origen = validarDireccion(datos.origen);
  if ('destino' in datos) cambios.destino = validarDireccion(datos.destino);
  if ('tipoVehiculo' in datos) {
    if (datos.tipoVehiculo !== 'AUTO' && datos.tipoVehiculo !== 'MOTO') {
      throw errores.datosInvalidos(['tipoVehiculo debe ser AUTO o MOTO']);
    }
    cambios.tipoVehiculo = datos.tipoVehiculo;
  }
  if ('fechaHora' in datos) {
    const valor = datos.fechaHora;
    const fecha = valor instanceof Date ? valor : typeof valor === 'string' ? new Date(valor) : null;
    if (!fecha || !Number.isFinite(fecha.getTime()) ||
        (typeof valor === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(valor))) {
      throw errores.datosInvalidos(['fechaHora debe ser una fecha válida con zona u offset']);
    }
    cambios.fechaHora = fecha;
  }
  if ('zonaHoraria' in datos) {
    try {
      if (typeof datos.zonaHoraria !== 'string' || !datos.zonaHoraria.trim()) throw new Error();
      new Intl.DateTimeFormat('es', { timeZone: datos.zonaHoraria }).format();
      cambios.zonaHoraria = datos.zonaHoraria;
    } catch {
      throw errores.datosInvalidos(['zonaHoraria no es válida']);
    }
  }
  return cambios;
}
