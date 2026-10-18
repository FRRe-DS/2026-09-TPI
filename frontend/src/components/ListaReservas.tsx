import { Fragment, useState } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { Reserva } from '../types';

interface Props {
  reservas: Reserva[];
  onCambio: () => void;
}

export function ListaReservas({ reservas, onCambio }: Props) {
  const [error, setError] = useState('');
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

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
    if (!motivo.trim()) {
      setError('Escribí un motivo para cancelar');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      await reservasApi.cancelar(id, motivo.trim());
      cerrar();
      onCambio();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'error inesperado';
      setError(`No se pudo cancelar: ${msg}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="card">
      <h2>Mis reservas</h2>
      {error && <p className="mensaje error">{error}</p>}

      {reservas.length === 0 ? (
        <p>No tenés reservas todavía.</p>
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
              {reservas.map((r) => {
                const noCancelable =
                  r.estado === 'CANCELADA' || r.estado === 'ACTIVADA' || r.estado === 'VENCIDA';
                return (
                  <Fragment key={r.id}>
                    <tr className={r.estado.toLowerCase()}>
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
                        <span className={`estado ${r.estado.toLowerCase()}`}>{r.estado}</span>
                      </td>
                      <td>
                        {cancelandoId !== r.id && (
                          <button className="btn-cancelar" onClick={() => abrir(r.id)} disabled={noCancelable}>
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>

                    {cancelandoId === r.id && (
                      <tr className="fila-cancelar">
                        <td colSpan={6}>
                          <div className="cancelar">
                            <input
                              placeholder="Motivo de la cancelación"
                              value={motivo}
                              onChange={(e) => setMotivo(e.target.value)}
                              autoFocus
                            />
                            <button onClick={() => confirmar(r.id)} disabled={enviando}>
                              {enviando ? 'Cancelando…' : 'Confirmar'}
                            </button>
                            <button className="secundario" onClick={cerrar} disabled={enviando}>
                              Volver
                            </button>
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