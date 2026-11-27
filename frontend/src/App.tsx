import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FormReserva } from './components/FormReserva';
import { ListaReservas } from './components/ListaReservas';
import { Cargando } from './components/comunes/Cargando';
import { EstadoReserva } from './components/comunes/EstadoReserva';
import { MensajeError } from './components/comunes/MensajeError';
import { SinResultados } from './components/comunes/SinResultados';
import { reservasApi, USE_MOCK, ApiError } from './api/reservas';
import { obtenerNombreUsuario, obtenerClienteId, esOperador, cerrarSesion } from './auth/sesion';
import type { Reserva } from './types';

interface ErrorPantalla {
  mensaje: string;
  // true si un servicio no respondió (503) y se puede volver a intentar
  reintentable: boolean;
}

function aErrorPantalla(err: unknown, prefijo: string): ErrorPantalla {
  const motivo = err instanceof ApiError ? err.message : 'error inesperado';
  return {
    mensaje: `${prefijo}: ${motivo}`,
    reintentable: err instanceof ApiError && err.status === 503,
  };
}

// Solo se pueden cancelar las reservas que todavía no se activaron ni terminaron
const ESTADOS_CANCELABLES: Reserva['estado'][] = ['PENDIENTE', 'CONFIRMADA'];

// Vista del cliente: formulario de creación y sus reservas
function VistaCliente() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<ErrorPantalla | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    reservasApi
      .listar(obtenerClienteId())
      .then((lista) => {
        setReservas(lista);
        setError(null);
      })
      .catch((err) => setError(aErrorPantalla(err, 'No se pudieron cargar las reservas')))
      .finally(() => setCargando(false));
  }, [version]);

  // Vuelve a pedir la lista sin desmontarla: así no se cierra el detalle que esté abierto
  // (se usa también en la actualización automática cada 10 segundos)
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <>
      <FormReserva onCreada={recargar} />

      {/* "Cargando" solo la primera vez; en las recargas la lista queda visible */}
      {cargando ? (
        <Cargando texto="Cargando reservas…" />
      ) : error ? (
        <MensajeError mensaje={error.mensaje} onReintentar={error.reintentable ? recargar : undefined} />
      ) : (
        <ListaReservas reservas={reservas} onCambio={recargar} />
      )}
    </>
  );
}

// Vista del operador: busca las reservas de un cliente por su id y las cancela con motivo
function VistaOperador() {
  const [clienteId, setClienteId] = useState('');
  const [buscado, setBuscado] = useState('');
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<ErrorPantalla | null>(null);

  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState<ErrorPantalla | null>(null);

  async function buscar(id: string) {
    setBuscando(true);
    setErrorBusqueda(null);
    try {
      setReservas(await reservasApi.listar(id));
      setBuscado(id);
    } catch (err) {
      setReservas(null);
      setErrorBusqueda(aErrorPantalla(err, 'No se pudieron buscar las reservas'));
    } finally {
      setBuscando(false);
    }
  }

  function enviarBusqueda(e: FormEvent) {
    e.preventDefault();
    const id = clienteId.trim();
    if (!id) {
      setErrorBusqueda({ mensaje: 'Escribí el id del cliente', reintentable: false });
      return;
    }
    cerrarCancelacion();
    void buscar(id);
  }

  function abrirCancelacion(id: string) {
    setCancelandoId(id);
    setMotivo('');
    setErrorCancelacion(null);
  }

  function cerrarCancelacion() {
    setCancelandoId(null);
    setMotivo('');
    setErrorCancelacion(null);
  }

  async function confirmarCancelacion(id: string) {
    // El backend exige un motivo de al menos 3 caracteres
    if (motivo.trim().length < 3) {
      setErrorCancelacion({ mensaje: 'Escribí un motivo de al menos 3 caracteres', reintentable: false });
      return;
    }
    setEnviando(true);
    setErrorCancelacion(null);
    try {
      await reservasApi.cancelar(id, motivo.trim());
      cerrarCancelacion();
      await buscar(buscado);
    } catch (err) {
      setErrorCancelacion(aErrorPantalla(err, 'No se pudo cancelar'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card operador">
      <h2>Buscar reservas de un cliente</h2>

      <form className="busqueda" onSubmit={enviarBusqueda}>
        <label>
          Id del cliente
          <input value={clienteId} onChange={(e) => setClienteId(e.target.value)} />
        </label>
        <button type="submit" disabled={buscando}>
          Buscar
        </button>
      </form>

      {buscando && <Cargando texto="Buscando reservas…" />}
      {errorBusqueda && (
        <MensajeError
          mensaje={errorBusqueda.mensaje}
          onReintentar={errorBusqueda.reintentable ? () => void buscar(clienteId.trim()) : undefined}
        />
      )}

      {!buscando && reservas && reservas.length === 0 && (
        <SinResultados texto="Ese cliente no tiene reservas." />
      )}

      {!buscando && reservas && reservas.length > 0 && (
        <ul className="resultados">
          {reservas.map((r) => (
            <li key={r.id}>
              <div className="resultado-datos">
                <EstadoReserva estado={r.estado} />
                <span>
                  {new Date(r.fechaHora).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    hour12: false,
                  })}
                </span>
                <span>
                  {r.origen.direccion} → {r.destino.direccion}
                </span>
                <span>{r.tarifaEstimada != null ? `$${r.tarifaEstimada}` : '-'}</span>
                {cancelandoId !== r.id && (
                  <button
                    type="button"
                    className="btn-cancelar"
                    onClick={() => abrirCancelacion(r.id)}
                    disabled={!ESTADOS_CANCELABLES.includes(r.estado)}
                  >
                    Cancelar
                  </button>
                )}
              </div>

              {cancelandoId === r.id && (
                <div className="cancelar">
                  <input
                    placeholder="Motivo de la cancelación"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    autoFocus
                  />
                  <button type="button" onClick={() => void confirmarCancelacion(r.id)} disabled={enviando}>
                    Confirmar
                  </button>
                  <button type="button" className="secundario" onClick={cerrarCancelacion} disabled={enviando}>
                    Volver
                  </button>
                  {enviando && <Cargando texto="Cancelando…" />}
                  {errorCancelacion && (
                    <MensajeError
                      mensaje={errorCancelacion.mensaje}
                      onReintentar={
                        errorCancelacion.reintentable ? () => void confirmarCancelacion(r.id) : undefined
                      }
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function App() {
  return (
    <>
      <header className="barra">
        <div className="barra-contenido">
          <h1>Reservas de viajes</h1>
          <div className="usuario">
            <span>{obtenerNombreUsuario()}</span>
            <button type="button" className="secundario" onClick={() => void cerrarSesion()}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className={esOperador() ? 'contenedor una-columna' : 'contenedor'}>
        {USE_MOCK && (
          <p className="aviso">Modo demo: los datos son simulados y se borran al recargar.</p>
        )}

        {esOperador() ? <VistaOperador /> : <VistaCliente />}
      </main>
    </>
  );
}
