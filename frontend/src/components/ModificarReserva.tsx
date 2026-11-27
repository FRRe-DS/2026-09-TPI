import { useState } from 'react';
import type { FormEvent } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { CambiosReserva } from '../api/reservas';
import type { Direccion, Reserva, TipoVehiculo, Ubicacion } from '../types';
import { MapaSelector } from './MapaSelector';
import { Cargando } from './comunes/Cargando';
import { MensajeError } from './comunes/MensajeError';

interface Props {
  reserva: Reserva;
  onCerrar: () => void;
  // Avisa que la reserva cambió, para volver a pedir la lista y el historial
  onModificada: () => void;
}

// El input datetime-local trabaja con la hora local del navegador, sin zona: "2026-11-30T15:30"
function aFechaLocal(iso: string): string {
  const fecha = new Date(iso);
  const desfase = fecha.getTimezoneOffset() * 60_000;
  return new Date(fecha.getTime() - desfase).toISOString().slice(0, 16);
}

function aUbicacion(d: Direccion): Ubicacion {
  return { direccion: d.direccion, latitud: d.latitud, longitud: d.longitud };
}

function mismaUbicacion(a: Ubicacion, b: Direccion): boolean {
  return a.direccion === b.direccion && a.latitud === b.latitud && a.longitud === b.longitud;
}

export function ModificarReserva({ reserva, onCerrar, onModificada }: Props) {
  const [origen, setOrigen] = useState<Ubicacion | null>(aUbicacion(reserva.origen));
  const [destino, setDestino] = useState<Ubicacion | null>(aUbicacion(reserva.destino));
  const [tipoVehiculo, setTipoVehiculo] = useState<TipoVehiculo>(reserva.tipoVehiculo);
  const [fechaHora, setFechaHora] = useState(aFechaLocal(reserva.fechaHora));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [modificada, setModificada] = useState<Reserva | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!origen || !destino) {
      setError('Marcá el origen y el destino en el mapa');
      return;
    }

    // Se manda solo lo que cambió (contrato de PATCH /reservas/{id})
    const cambios: CambiosReserva = {};
    if (fechaHora !== aFechaLocal(reserva.fechaHora)) cambios.fechaHora = new Date(fechaHora).toISOString();
    if (!mismaUbicacion(origen, reserva.origen)) cambios.origen = origen;
    if (!mismaUbicacion(destino, reserva.destino)) cambios.destino = destino;
    if (tipoVehiculo !== reserva.tipoVehiculo) cambios.tipoVehiculo = tipoVehiculo;
    if (Object.keys(cambios).length === 0) {
      setError('No cambiaste ningún dato');
      return;
    }

    setGuardando(true);
    setError('');
    try {
      setModificada(await reservasApi.modificar(reserva.id, cambios));
      onModificada();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo modificar la reserva');
    } finally {
      setGuardando(false);
    }
  }

  if (modificada) {
    return (
      <div>
        <h3>Reserva modificada</h3>
        <p className="mensaje ok">
          Nueva tarifa estimada: {modificada.tarifaEstimada != null ? `$${modificada.tarifaEstimada}` : '-'}
        </p>
        <button type="button" className="secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={guardar}>
      <h3>Modificar o reprogramar</h3>

      <MapaSelector
        origen={origen}
        destino={destino}
        onCambio={(o, d) => {
          setOrigen(o);
          setDestino(d);
        }}
      />

      <label>
        Tipo de vehículo
        <select value={tipoVehiculo} onChange={(e) => setTipoVehiculo(e.target.value as TipoVehiculo)}>
          <option value="AUTO">Auto</option>
          <option value="MOTO">Moto</option>
        </select>
      </label>

      <label>
        Fecha y hora
        <input
          type="datetime-local"
          value={fechaHora}
          onChange={(e) => setFechaHora(e.target.value)}
          required
        />
      </label>

      {error && <MensajeError mensaje={error} />}
      {guardando ? (
        <Cargando texto="Guardando cambios…" />
      ) : (
        <>
          <button type="submit">Guardar cambios</button>
          <button type="button" className="secundario" onClick={onCerrar}>
            Volver
          </button>
        </>
      )}
    </form>
  );
}
