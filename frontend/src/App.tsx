import { useEffect, useState } from 'react';
import { FormReserva } from './components/FormReserva';
import { ListaReservas } from './components/ListaReservas';
import { MensajeError } from './components/comunes/MensajeError';
import { reservasApi, USE_MOCK, ApiError } from './api/reservas';
import { obtenerNombreUsuario, cerrarSesion } from './auth/sesion';
import type { Reserva } from './types';

// Provisorio hasta que exista el login (M1). Es un cliente del db/seed.sql.
const CLIENTE_ID = 'cliente_001';

export default function App() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [puedeReintentar, setPuedeReintentar] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    reservasApi
      .listar(CLIENTE_ID)
      .then((lista) => {
        setReservas(lista);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las reservas');
        // Si un servicio no responde (503), se ofrece volver a intentar
        setPuedeReintentar(err instanceof ApiError && err.status === 503);
      })
      .finally(() => setCargando(false));
  }, [version]);

  const recargar = () => setVersion((v) => v + 1);

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

      <main className="contenedor">
        {USE_MOCK && (
          <p className="aviso">Modo demo: los datos son simulados y se borran al recargar.</p>
        )}

        <FormReserva clienteId={CLIENTE_ID} onCreada={recargar} />

        {cargando ? (
          <p>Cargando reservas…</p>
        ) : error ? (
          <MensajeError mensaje={error} onReintentar={puedeReintentar ? recargar : undefined} />
        ) : (
          <ListaReservas reservas={reservas} onCambio={recargar} />
        )}
      </main>
    </>
  );
}