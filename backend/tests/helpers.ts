// Ayudas para las pruebas (las usa todo el equipo).
import { randomUUID } from 'crypto';
import { pool } from '../src/db/pool';
import { config } from '../src/config/env';
import { Reserva, EstadoReserva } from '../src/models/reserva';
import { insertarReserva } from '../src/repositories/reserva.repository';

// Borra todo de la base DE PRUEBA. Se niega a correr contra Supabase.
export async function limpiarBase() {
  if (config.databaseUrl?.includes('supabase')) {
    throw new Error('PELIGRO: las pruebas apuntan a Supabase. Revisá TEST_DATABASE_URL en tu .env');
  }
  await pool.query('TRUNCATE historial_reserva, reserva CASCADE');
}

// Una fecha X horas en el futuro, en formato ISO.
export function enHoras(horas: number): string {
  return new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
}

const ORIGEN = { direccion: 'Origen de prueba, Resistencia', latitud: -27.4512, longitud: -58.9866 };
const DESTINO = { direccion: 'Destino de prueba, Resistencia', latitud: -27.4601, longitud: -58.9735 };

// Datos válidos para crear una reserva por la API.
export function datosValidos(cambios: Record<string, unknown> = {}) {
  return {
    clienteId: 'cli-001',
    origen: ORIGEN,
    destino: DESTINO,
    tipoVehiculo: 'AUTO',
    fechaHora: enHoras(24),
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    ...cambios,
  };
}

// Inserta una reserva directo en la base (sin pasar por la API) en el estado que quieras.
export async function crearReservaDePrueba(
  estado: EstadoReserva = 'CONFIRMADA',
  horas = 24,
): Promise<Reserva> {
  return insertarReserva(pool, {
    clienteId: 'cli-test',
    origen: ORIGEN,
    destino: DESTINO,
    tipoVehiculo: 'AUTO',
    fechaHora: enHoras(horas),
    zonaHoraria: 'America/Argentina/Buenos_Aires',
    estado,
    tarifaEstimada: 4750,
    claveIdempotencia: randomUUID(),
  });
}

export async function cerrarBase() {
  await pool.end();
}