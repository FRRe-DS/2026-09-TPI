export type TipoVehiculo = 'AUTO' | 'MOTO';

export type EstadoReserva =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'CANCELADA'
  | 'ACTIVADA'
  | 'VENCIDA';

// Así devuelve el backend el origen y el destino
export interface Direccion {
  direccion: string;
  latitud: number;
  longitud: number;
  alias?: string | null;
  piso?: string | null;
  indicaciones?: string | null;
}

export interface Reserva {
  id: string; // UUID
  clienteId: string;
  origen: Direccion;
  destino: Direccion;
  tipoVehiculo: TipoVehiculo;
  fechaHora: string;   // en UTC, ej: "2026-10-23T09:00:00.000Z"
  zonaHoraria: string; // ej: "America/Argentina/Buenos_Aires"
  estado: EstadoReserva;
  tarifaEstimada: number | null;
  motivoCancelacion: string | null;
  solicitudDespachoId: string | null; // vacío hasta que M5 crea la solicitud
  creadaEn: string;
  modificadaEn?: string;
}

// Al crear, origen y destino se mandan como texto; el backend busca las coordenadas
export interface NuevaReserva {
  clienteId: string;
  origen: string;
  destino: string;
  tipoVehiculo: TipoVehiculo;
  fechaHora: string;
  zonaHoraria: string;
}

// Formato de error acordado: código, mensaje y detalle
export interface ErrorApi {
  codigo: string;
  mensaje: string;
  detalle?: unknown;
}