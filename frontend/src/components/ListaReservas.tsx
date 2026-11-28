import { Fragment, useState } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { Reserva } from '../types';
import { DetalleReserva } from './DetalleReserva';
import { EstadoReserva } from './comunes/EstadoReserva';
import { Cargando } from './comunes/Cargando';
import { MensajeError } from './comunes/MensajeError';
import { SinResultados } from './comunes/SinResultados';

interface Props {
  reservas: Reserva[];
  onCambio: () => void;
}

export function ListaReservas({ reservas, onCambio }: Props) {
  const [error, setError] = useState('');
  // Si la API no responde (503) se ofrece reintentar la misma cancelación
  const [reintentarId, setReintentarId] = useState<string | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  // Ordena por fecha del viaje (el más cercano arriba) y deja las canceladas al final
  const ordenadas = [...reservas].sort((a, b) => {
    const aCancelada = a.estado === 'CANCELADA' ? 1 : 0;
    const bCancelada = b.estado === 'CANCELADA' ? 1 : 0;
    if (aCancelada !== bCancelada) return aCancelada - bCancelada;
    return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime();
  });

  function abrir(id: string) {
    setCancelandoId(id);
    setMotivo('');
    setError('');
  }

  function cerrar() {
    setCancelandoId(null);
    setMotivo('');
  }

  async function confirmar(id: string) {
    // El backend exige un motivo de al menos 3 caracteres
    if (motivo.trim().length < 3) {
      setError('Escribí un motivo de al menos 3 caracteres para cancelar');
      return;
    }
    setEnviando(true);
    setError('');
    setReintentarId(null);
    try {
      await reservasApi.cancelar(id, motivo.trim());
      cerrar();
      onCambio();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'error inesperado';
      setError(`No se pudo cancelar: ${msg}`);
      if (err instanceof ApiError && err.status === 503) setReintentarId(id);
    } finally {
      setEnviando(false);
    }
  }

  const enDetalle = detalleId ? reservas.find((r) => r.id === detalleId) : undefined;
  if (enDetalle) {
    return (
      <div className="card">
        <h2>Mis reservas</h2>
        <DetalleReserva reserva={enDetalle} onCerrar={() => setDetalleId(null)} onActualizar={onCambio} />
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Mis reservas</h2>
      {error && (
        <MensajeError
          mensaje={error}
          onReintentar={reintentarId ? () => confirmar(reintentarId) : undefined}
        />
      )}

      {reservas.length === 0 ? (
        <SinResultados texto="No tenés reservas todavía." />
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Viaje</th>
                <th>Vehículo</th>
                <th>Fecha</th>
                <th>Tarifa</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((r) => {
                const noCancelable =
                  r.estado === 'CANCELADA' || r.estado === 'ACTIVADA' || r.estado === 'VENCIDA';
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={r.estado.toLowerCase()}
                      onClick={() => setDetalleId(r.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setDetalleId(r.id)}
                      tabIndex={0}
                      title="Ver detalle"
                    >
                      <td>
                        <strong>
                          {r.origen.direccion} → {r.destino.direccion}
                        </strong>
                        {r.motivoCancelacion && (
                          <span className="motivo">Motivo: {r.motivoCancelacion}</span>
                        )}
                      </td>
                      <td>{r.tipoVehiculo}</td>
                      <td>
                        {new Date(r.fechaHora).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', hour12: false })}
                      </td>
                      <td>{r.tarifaEstimada != null ? `$${r.tarifaEstimada}` : '-'}</td>
                      <td>
                        <EstadoReserva estado={r.estado} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {cancelandoId !== r.id && (
                          <button className="btn-cancelar" onClick={() => abrir(r.id)} disabled={noCancelable}>
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>

                    {cancelandoId === r.id && (
                      <tr className="fila-cancelar">
                        <td colSpan={6} onClick={(e) => e.stopPropagation()}>
                          <div className="cancelar">
                            <input
                              placeholder="Motivo de la cancelación"
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                              autoFocus
                            />
                            {enviando ? (
                              <Cargando texto="Cancelando…" />
                            ) : (
                              <>
                                <button onClick={() => confirmar(r.id)}>Confirmar</button>
                                <button className="secundario" onClick={cerrar}>
                                  Volver
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}