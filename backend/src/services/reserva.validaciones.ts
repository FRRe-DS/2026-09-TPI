import { config } from '../config/env';
import { AppError, errores } from '../errors/AppError';
import { CambiosReserva, Direccion, TipoVehiculo } from '../models/reserva';
import { verificarClienteHabilitado } from '../stubs/m2Clientes.stub';
import { consultarRuta } from '../stubs/m4Ubicacion.stub';
import { estimarTarifa } from '../stubs/m7Tarifas.stub';
import { obtenerCoordenadas } from './geocodificacion.service';

const CAMPOS = ['origen', 'destino', 'tipoVehiculo', 'fechaHora', 'zonaHoraria'];

// RF-9.2: compartida por creación, confirmación y modificación.
// Siempre responde 422 REGLA_INCUMPLIDA; en "detalle.regla" dice cuál regla falló.
export function validarVentana(fecha: Date, ahora = new Date()): void {
  const anticipacion = fecha.getTime() - ahora.getTime();
  if (!Number.isFinite(anticipacion)) {
    throw errores.datosInvalidos(['fechaHora no es una fecha válida']);
  }
  if (anticipacion <= 0) {
    throw errores.reglaIncumplida('La fecha y hora de la reserva deben ser futuras', {
      regla: 'FECHA_PASADA',
    });
  }
  if (anticipacion < config.anticipacionMinimaMinutos * 60_000) {
    throw errores.reglaIncumplida(
      `La reserva debe realizarse con al menos ${config.anticipacionMinimaMinutos} minutos de anticipación`,
      { regla: 'ANTICIPACION_INSUFICIENTE' },
    );
  }
  if (anticipacion > config.anticipacionMaximaDias * 86_400_000) {
    throw errores.reglaIncumplida(
      `La reserva no puede realizarse con más de ${config.anticipacionMaximaDias} días de anticipación`,
      { regla: 'ANTICIPACION_EXCEDIDA' },
    );
  }
}

// Origen y destino aceptan los MISMOS dos formatos en POST y en PATCH:
//  - texto ("UTN"): se buscan las coordenadas con la geocodificación simulada de M4
//  - objeto { direccion, latitud, longitud }: se usan las coordenadas recibidas (ej. desde el mapa)
export async function resolverUbicacion(valor: unknown): Promise<Direccion> {
  if (typeof valor === 'string') {
    const direccion = valor.trim();
    if (!direccion) throw errores.datosInvalidos(['La dirección no puede estar vacía']);
    const coordenadas = await obtenerCoordenadas(direccion);
    if (!coordenadas) {
      throw new AppError(400, 'COORDENADAS_NO_DISPONIBLES',
        'No se pudieron obtener las coordenadas del origen o destino', { direccion });
    }
    return { direccion, ...coordenadas };
  }
  return validarDireccion(valor);
}

// RF-9.3: cliente habilitado (simulación de M2). Igual al crear, confirmar y modificar.
export async function validarClienteHabilitado(clienteId: string): Promise<void> {
  if (!clienteId?.trim() || !await verificarClienteHabilitado(clienteId)) {
    throw errores.reglaIncumplida('El cliente no está habilitado para realizar reservas', {
      regla: 'CLIENTE_NO_HABILITADO',
    });
  }
}

// RF-9.3 y RF-9.4: cobertura y distancia (M4) y tarifa estimada (M7). Una sola "calculadora" para todos.
export async function validarRutaYEstimarTarifa(
  origen: Direccion,
  destino: Direccion,
  tipoVehiculo: TipoVehiculo,
): Promise<{ tarifaEstimada: number; distanciaKm: number }> {
  const ruta = await consultarRuta(origen, destino);
  if (!ruta.cubierta) {
    throw errores.reglaIncumplida('El origen o destino está fuera de la zona de cobertura', {
      regla: 'FUERA_DE_COBERTURA',
    });
  }
  const tarifaEstimada = await estimarTarifa(tipoVehiculo, ruta.distanciaKm);
  return { tarifaEstimada, distanciaKm: ruta.distanciaKm };
}

// Origen y destino no pueden ser el mismo punto (se usa al crear y al modificar).
export function validarOrigenDestinoDistintos(origen: Direccion, destino: Direccion): void {
  if (origen.latitud === destino.latitud && origen.longitud === destino.longitud) {
    throw new AppError(400, 'ORIGEN_DESTINO_IGUALES', 'El origen y el destino no pueden ser el mismo punto');
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
  // Se guarda solo lo permitido: nada de campos extra en la base.
  const limpia: Direccion = { direccion: d.direccion, latitud: d.latitud, longitud: d.longitud };
  for (const campo of ['alias', 'piso', 'indicaciones'] as const) {
    if (d[campo] !== undefined) limpia[campo] = d[campo];
  }
  return limpia;
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
