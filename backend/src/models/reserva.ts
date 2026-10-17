// Tipos de datos del módulo (nombres según las tablas de Supabase).
// En la base, estado / tipo de vehículo / tipo de cambio / rol se guardan como UNA letra.
// En el código usamos palabras completas y las traducimos con las tablas de este archivo.

export const TIPOS_VEHICULO = ['AUTO', 'MOTO'] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];

export const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'ACTIVADA', 'VENCIDA'] as const;
export type EstadoReserva = (typeof ESTADOS)[number];

export const TIPOS_CAMBIO = [
  'CREACION',
  'CONFIRMACION',
  'MODIFICACION',
  'CANCELACION',
  'ACTIVACION',
  'VENCIMIENTO',
] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];

export const ROLES_ACTOR = ['CLIENTE', 'OPERADOR', 'SISTEMA'] as const;
export type RolActor = (typeof ROLES_ACTOR)[number];

// Palabra -> letra que se guarda en la base
export const CODIGO_TIPO_VEHICULO: Record<TipoVehiculo, string> = { AUTO: 'A', MOTO: 'M' };
export const CODIGO_ESTADO: Record<EstadoReserva, string> = {
  PENDIENTE: 'P',
  CONFIRMADA: 'C',
  CANCELADA: 'X',
  ACTIVADA: 'A',
  VENCIDA: 'V',
};
export const CODIGO_TIPO_CAMBIO: Record<TipoCambio, string> = {
  CREACION: 'C',
  CONFIRMACION: 'Y',
  MODIFICACION: 'M',
  CANCELACION: 'X',
  ACTIVACION: 'A',
  VENCIMIENTO: 'V',
};
export const CODIGO_ROL_ACTOR: Record<RolActor, string> = {
  CLIENTE: 'C',
  OPERADOR: 'O',
  SISTEMA: 'S',
};

// Letra de la base -> palabra
function invertir<T extends string>(mapa: Record<T, string>): Record<string, T> {
  const resultado: Record<string, T> = {};
  for (const palabra of Object.keys(mapa) as T[]) resultado[mapa[palabra]] = palabra;
  return resultado;
}
export const TIPO_VEHICULO_DESDE_CODIGO = invertir(CODIGO_TIPO_VEHICULO);
export const ESTADO_DESDE_CODIGO = invertir(CODIGO_ESTADO);
export const TIPO_CAMBIO_DESDE_CODIGO = invertir(CODIGO_TIPO_CAMBIO);
export const ROL_ACTOR_DESDE_CODIGO = invertir(CODIGO_ROL_ACTOR);

// Origen y destino: en la base son un JSON con estas claves.
export interface Direccion {
  direccion: string;
  latitud: number;
  longitud: number;
  alias?: string | null;
  piso?: string | null;
  indicaciones?: string | null;
}

export interface Reserva {
  id: string;
  clienteId: string;
  origen: Direccion;
  destino: Direccion;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
  zonaHoraria: string;
  estado: EstadoReserva;
  tarifaEstimada: number | null;
  motivoCancelacion: string | null;
  solicitudDespachoId: string | null;
  claveIdempotencia: string | null;
  creadaEn: Date;
  modificadaEn: Date;
}

// Lo que hace falta para crear una reserva nueva.
export interface DatosNuevaReserva {
  clienteId: string;
  origen: Direccion;
  destino: Direccion;
  tipoVehiculo: TipoVehiculo;
  fechaHora: Date;
  zonaHoraria: string;
}

// Lo que se puede cambiar al modificar (todo opcional).
export type CambiosReserva = Partial<
  Pick<Reserva, 'origen' | 'destino' | 'tipoVehiculo' | 'fechaHora' | 'zonaHoraria' | 'tarifaEstimada'>
>;

export interface EntradaHistorial {
  id: string;
  reservaId: string;
  tipoCambio: string;
  campoModificado: string | null;
  valorAnterior: string | null;
  valorNuevo: string | null;
  actorId: string | null;
  rolActor: string;
  motivo: string | null;
  fechaCambio: Date;
}