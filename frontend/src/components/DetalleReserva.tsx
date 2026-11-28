import { useEffect, useState } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { EntradaHistorial } from '../api/reservas';
import type { Reserva } from '../types';
import { EstadoReserva } from './comunes/EstadoReserva';
import { Cargando } from './comunes/Cargando';
import { MensajeError } from './comunes/MensajeError';
import { SinResultados } from './comunes/SinResultados';
import { ModificarReserva } from './ModificarReserva';

interface Props {
  reserva: Reserva;
  onCerrar: () => void;
  // Vuelve a pedir la lista de reservas, así el detalle recibe la reserva al día
  onActualizar: () => void;
}

// Mientras la reserva esté CONFIRMADA o ACTIVADA, el detalle se actualiza solo cada 10 segundos
const INTERVALO_ACTUALIZACION_MS = 10_000;

const NOMBRE_CAMBIO: Record<string, string> = {
  CREACION: 'Creación',
  CONFIRMACION: 'Confirmación',
  MODIFICACION: 'Modificación',
  CANCELACION: 'Cancelación',
  ACTIVACION: 'Activación',
  VENCIMIENTO: 'Vencimiento',
};

// Nombres de los campos tal como los guarda el historial del backend
const NOMBRE_CAMPO: Record<string, string> = {
  estado: 'Estado',
  origen: 'Origen',
  destino: 'Destino',
  tipoVehiculo: 'Vehículo',
  fechaHora: 'Fecha y hora',
  zonaHoraria: 'Zona horaria',
  tarifaEstimada: 'Tarifa',
};

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false });
}

// El historial guarda los valores como texto: origen y destino vienen como JSON y la fecha en ISO
function formatearValor(campo: string | null, valor: string | null): string {
  if (valor == null) return '-';
  try {
    const dato: unknown = JSON.parse(valor);
    if (campo === 'fechaHora' && typeof dato === 'string') return formatearFecha(dato);
    if (dato && typeof dato === 'object' && 'direccion' in dato) return String(dato.direccion);
    return String(dato);
  } catch {
    return valor;
  }
}

function describirCambio(e: EntradaHistorial): string {
  if (!e.campoModificado) return '';
  const campo = NOMBRE_CAMPO[e.campoModificado] ?? e.campoModificado;
  return `${campo}: ${formatearValor(e.campoModificado, e.valorAnterior)} → ${formatearValor(e.campoModificado, e.valorNuevo)}`;
}

export function DetalleReserva({ reserva, onCerrar, onActualizar }: Props) {
  const [historial, setHistorial] = useState<EntradaHistorial[] | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [modificando, setModificando] = useState(false);

  const seActualizaSolo = reserva.estado === 'CONFIRMADA' || reserva.estado === 'ACTIVADA';
  // RF-9.6: solo se puede modificar mientras esté PENDIENTE o CONFIRMADA
  const sePuedeModificar = reserva.estado === 'PENDIENTE' || reserva.estado === 'CONFIRMADA';

  // Pide el historial al abrir, cuando la reserva cambia y en cada actualización automática
  useEffect(() => {
    let vigente = true;
    reservasApi
      .historial(reserva.id)
      .then((lista) => {
        if (!vigente) return;
        const ordenado = [...lista].sort(
          (a, b) => new Date(a.fechaCambio).getTime() - new Date(b.fechaCambio).getTime(),
        );
        setHistorial(ordenado);
        setError('');
      })
      .catch((err) => {
        if (vigente) setError(err instanceof ApiError ? err.message : 'No se pudo cargar el historial');
      });
    return () => {
      vigente = false;
    };
  }, [reserva.id, reserva.estado, reserva.modificadaEn, version]);

  useEffect(() => {
    if (!seActualizaSolo) return;
    const temporizador = window.setInterval(() => {
      onActualizar();
      setVersion((v) => v + 1);
    }, INTERVALO_ACTUALIZACION_MS);
    return () => window.clearInterval(temporizador);
  }, [seActualizaSolo, onActualizar]);

  return (
    <div>
      <button type="button" className="secundario" onClick={onCerrar}>
        Volver a la lista
      </button>

      <h3>Detalle de la reserva</h3>
      <p><strong>Origen:</strong> {reserva.origen.direccion}</p>
      <p><strong>Destino:</strong> {reserva.destino.direccion}</p>
      <p><strong>Fecha y hora:</strong> {formatearFecha(reserva.fechaHora)}</p>
      <p><strong>Vehículo:</strong> {reserva.tipoVehiculo}</p>
      <p><strong>Estado:</strong> <EstadoReserva estado={reserva.estado} /></p>
      <p><strong>Tarifa estimada:</strong> {reserva.tarifaEstimada != null ? `$${reserva.tarifaEstimada}` : '-'}</p>
      {reserva.motivoCancelacion && (
        <p><strong>Motivo de cancelación:</strong> {reserva.motivoCancelacion}</p>
      )}

      {modificando ? (
        <ModificarReserva
          reserva={reserva}
          onCerrar={() => setModificando(false)}
          onModificada={onActualizar}
        />
      ) : (
        sePuedeModificar && (
          <button type="button" onClick={() => setModificando(true)}>
            Modificar o reprogramar
          </button>
        )
      )}

      <h3>Historial</h3>
      {error ? (
        <MensajeError mensaje={error} onReintentar={() => setVersion((v) => v + 1)} />
      ) : historial === null ? (
        <Cargando texto="Cargando historial…" />
      ) : historial.length === 0 ? (
        <SinResultados texto="Esta reserva todavía no tiene cambios registrados." />
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cambio</th>
                <th>Detalle</th>
                <th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((e) => (
                <tr key={e.id}>
                  <td>{formatearFecha(e.fechaCambio)}</td>
                  <td>{NOMBRE_CAMBIO[e.tipoCambio] ?? e.tipoCambio}</td>
                  <td>
                    {describirCambio(e)}
                    {e.motivo && <span className="motivo">Motivo: {e.motivo}</span>}
                  </td>
                  <td>{e.rolActor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seActualizaSolo && <p className="motivo">Se actualiza solo cada 10 segundos.</p>}
    </div>
  );
}
