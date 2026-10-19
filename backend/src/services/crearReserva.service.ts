// RF-9.1 a RF-9.5: crear una reserva.
// Usa las MISMAS reglas que confirmar y modificar (reserva.validaciones.ts + stubs de M2, M4 y M7)
// y deja en el historial la CREACION ('C') y la CONFIRMACION ('Y') (RF-9.12).
import { pool, transaccion } from '../db/pool';
import { AppError, errores } from '../errors/AppError';
import { Reserva, TipoVehiculo } from '../models/reserva';
import { registrarHistorial } from '../repositories/historial.repository';
import { buscarReservaPorClave, buscarReservaPorId, insertarReserva } from '../repositories/reserva.repository';
import { confirmarReserva } from './confirmarReserva.service';
import {
  resolverUbicacion,
  validarClienteHabilitado,
  validarOrigenDestinoDistintos,
  validarRutaYEstimarTarifa,
  validarVentana,
} from './reserva.validaciones';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UbicacionEntrada = string | { direccion: string; latitud: number; longitud: number };

interface EntradaCreacion {
  claveIdempotencia: string;
  clienteId: string;
  origen: UbicacionEntrada;
  destino: UbicacionEntrada;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
  zonaHoraria: string;
}

export interface ResultadoCreacion {
  reserva: Reserva;
  yaExistia: boolean; // true = reintento con la misma clave de idempotencia
  confirmada: boolean;
  motivo?: string;
}

// Acepta una dirección de texto o un objeto con coordenadas válidas
function esUbicacionValida(valor: unknown): valor is UbicacionEntrada {
  if (typeof valor === 'string') return valor.trim().length > 0;
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const u = valor as Record<string, unknown>;
  return (
    typeof u.direccion === 'string' && u.direccion.trim().length > 0 &&
    typeof u.latitud === 'number' && Number.isFinite(u.latitud) && Math.abs(u.latitud) <= 90 &&
    typeof u.longitud === 'number' && Number.isFinite(u.longitud) && Math.abs(u.longitud) <= 180
  );
}

function textoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

// Errores de formato: siempre 400 (datos mal enviados).
function validarEntrada(cuerpo: unknown): EntradaCreacion {
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (typeof datos.claveIdempotencia !== 'string' || !FORMATO_UUID.test(datos.claveIdempotencia)) {
    throw new AppError(400, 'CLAVE_IDEMPOTENCIA_INVALIDA', 'Debes enviar una clave de idempotencia con formato UUID');
  }
  if (
    !textoNoVacio(datos.clienteId) ||
    !esUbicacionValida(datos.origen) ||
    !esUbicacionValida(datos.destino) ||
    !textoNoVacio(datos.tipoVehiculo) ||
    !textoNoVacio(datos.fechaHora) ||
    !textoNoVacio(datos.zonaHoraria)
  ) {
    throw new AppError(400, 'DATOS_INCOMPLETOS', 'Faltan datos obligatorios o contienen valores inválidos');
  }
  if (datos.tipoVehiculo !== 'AUTO' && datos.tipoVehiculo !== 'MOTO') {
    throw new AppError(400, 'TIPO_VEHICULO_INVALIDO', 'El tipo de vehículo debe ser AUTO o MOTO');
  }
  try {
    new Intl.DateTimeFormat('es-AR', { timeZone: datos.zonaHoraria });
  } catch {
    throw new AppError(400, 'ZONA_HORARIA_INVALIDA', 'La zona horaria indicada no es válida');
  }
  const fechaHora = new Date(datos.fechaHora);
  if (isNaN(fechaHora.getTime())) {
    throw new AppError(400, 'FECHA_INVALIDA', 'La fecha y hora de la reserva no son válidas');
  }

  return {
    claveIdempotencia: datos.claveIdempotencia,
    clienteId: datos.clienteId,
    origen: datos.origen,
    destino: datos.destino,
    tipoVehiculo: datos.tipoVehiculo,
    fechaHora,
    zonaHoraria: datos.zonaHoraria,
  };
}

function mismaUbicacion(guardada: Reserva['origen'], recibida: UbicacionEntrada): boolean {
  if (typeof recibida === 'string') return guardada.direccion === recibida.trim();
  return (
    guardada.direccion === recibida.direccion &&
    guardada.latitud === recibida.latitud &&
    guardada.longitud === recibida.longitud
  );
}

// Reintento con la misma clave: mismos datos -> devuelve la reserva existente; otros datos -> 409.
function resolverReintento(existente: Reserva, entrada: EntradaCreacion): ResultadoCreacion {
  const coinciden =
    existente.clienteId === entrada.clienteId &&
    mismaUbicacion(existente.origen, entrada.origen) &&
    mismaUbicacion(existente.destino, entrada.destino) &&
    existente.tipoVehiculo === entrada.tipoVehiculo &&
    new Date(existente.fechaHora).getTime() === entrada.fechaHora.getTime() &&
    existente.zonaHoraria === entrada.zonaHoraria;

  if (!coinciden) {
    throw new AppError(409, 'CONFLICTO_IDEMPOTENCIA', 'La clave de idempotencia ya fue utilizada con datos diferentes');
  }
  return { reserva: existente, yaExistia: true, confirmada: existente.estado === 'CONFIRMADA' };
}

function esClaveDuplicada(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

export async function crearReserva(cuerpo: unknown): Promise<ResultadoCreacion> {
  const entrada = validarEntrada(cuerpo);

  // 1. Idempotencia: si la clave ya se usó, no se crea otra reserva.
  const existente = await buscarReservaPorClave(pool, entrada.claveIdempotencia);
  if (existente) return resolverReintento(existente, entrada);

  // 2. Reglas de negocio (422 si no se cumplen). Si alguna falla, no se guarda nada.
  validarVentana(entrada.fechaHora);
  await validarClienteHabilitado(entrada.clienteId);
  const origen = await resolverUbicacion(entrada.origen);
  const destino = await resolverUbicacion(entrada.destino);
  validarOrigenDestinoDistintos(origen, destino);
  const { tarifaEstimada } = await validarRutaYEstimarTarifa(origen, destino, entrada.tipoVehiculo);

  // 3. Guardar la reserva PENDIENTE y su 'C' en el historial, juntas en una transacción.
  let creada: Reserva;
  try {
    creada = await transaccion(async (db) => {
      const nueva = await insertarReserva(db, {
        clienteId: entrada.clienteId,
        origen,
        destino,
        tipoVehiculo: entrada.tipoVehiculo,
        fechaHora: entrada.fechaHora,
        zonaHoraria: entrada.zonaHoraria,
        estado: 'PENDIENTE',
        tarifaEstimada,
        claveIdempotencia: entrada.claveIdempotencia,
      });
      await registrarHistorial(db, {
        reservaId: nueva.id, tipoCambio: 'CREACION', campoModificado: 'estado',
        valorAnterior: null, valorNuevo: 'PENDIENTE', actorId: entrada.clienteId, rolActor: 'CLIENTE',
      });
      return nueva;
    });
  } catch (error) {
    // Dos pedidos con la misma clave al mismo tiempo: la base deja pasar uno solo.
    if (esClaveDuplicada(error)) {
      const ganadora = await buscarReservaPorClave(pool, entrada.claveIdempotencia);
      if (ganadora) return resolverReintento(ganadora, entrada);
    }
    throw error;
  }

  // 4. RF-9.5: confirmar en otra transacción. Si falla, la reserva queda PENDIENTE (no se pierde).
  try {
    const confirmada = await confirmarReserva(creada.id);
    return { reserva: confirmada, yaExistia: false, confirmada: true };
  } catch (error) {
    console.error('No se pudo confirmar automáticamente la reserva:', error);
    const motivo = error instanceof AppError ? error.message : 'No se pudo confirmar automáticamente la reserva';
    const actual = await buscarReservaPorId(pool, creada.id);
    return { reserva: actual ?? creada, yaExistia: false, confirmada: false, motivo };
  }
}

// Usado por GET /reservas/:id
export async function consultarReserva(id: string): Promise<Reserva> {
  if (!FORMATO_UUID.test(id)) {
    throw new AppError(400, 'ID_INVALIDO', 'El identificador de la reserva debe tener formato UUID');
  }
  const reserva = await buscarReservaPorId(pool, id);
  if (!reserva) throw errores.noEncontrada(id);
  return reserva;
}
