import { useState } from 'react';
import type { FormEvent } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { Condiciones, ResultadoCreacion } from '../api/reservas';
import { obtenerClienteId } from '../auth/sesion';
import type { TipoVehiculo, Ubicacion } from '../types';
import { MapaSelector } from './MapaSelector';
import { Cargando } from './comunes/Cargando';
import { EstadoReserva } from './comunes/EstadoReserva';
import { MensajeError } from './comunes/MensajeError';

interface Props {
    onCreada: () => void;
}

interface ErrorCreacion {
    mensaje: string;
    // true si un servicio no respondió (503) y se puede volver a intentar
    reintentable: boolean;
}

// Títulos de cada condición que devuelve la API
const TITULOS_CONDICIONES: Record<keyof Condiciones, string> = {
    confirmacion: 'Confirmación',
    modificacion: 'Modificación',
    cancelacion: 'Cancelación',
    activacion: 'Activación',
    tarifa: 'Tarifa',
};

export function FormReserva({ onCreada }: Props) {
    const [origen, setOrigen] = useState<Ubicacion | null>(null);
    const [destino, setDestino] = useState<Ubicacion | null>(null);
    const [tipoVehiculo, setTipoVehiculo] = useState<TipoVehiculo>('AUTO');
    const [fechaHora, setFechaHora] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState<ErrorCreacion | null>(null);
    const [resultado, setResultado] = useState<ResultadoCreacion | null>(null);

    async function crearReserva() {
        if (!origen || !destino) {
            setError({ mensaje: 'Marcá el origen y el destino en el mapa', reintentable: false });
            return;
        }
        setEnviando(true);
        setError(null);
        setResultado(null);
        try {
            const creada = await reservasApi.crear({
                // El clienteId es el "sub" del usuario que ingresó
                clienteId: obtenerClienteId(),
                origen,
                destino,
                tipoVehiculo,
                fechaHora: new Date(fechaHora).toISOString(),
                zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            setResultado(creada);
            setOrigen(null);
            setDestino(null);
            setFechaHora('');
            onCreada();
        } catch (err) {
            const motivo = err instanceof ApiError ? err.message : 'error inesperado';
            setError({
                mensaje: `No se pudo crear: ${motivo}`,
                reintentable: err instanceof ApiError && err.status === 503,
            });
        } finally {
            setEnviando(false);
        }
    }

    function enviar(e: FormEvent) {
        e.preventDefault();
        void crearReserva();
    }

    return (
        <form onSubmit={enviar} className="card">
            <h2>Nueva reserva</h2>

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
                <select
                    value={tipoVehiculo}
                    onChange={(e) => setTipoVehiculo(e.target.value as TipoVehiculo)}
                >
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

            <button type="submit" disabled={enviando}>
                Reservar
            </button>
            {enviando && <Cargando texto="Creando la reserva…" />}

            {error && (
                <MensajeError
                    mensaje={error.mensaje}
                    onReintentar={error.reintentable ? () => void crearReserva() : undefined}
                />
            )}

            {resultado && (
                <section className="confirmacion" aria-live="polite">
                    <h3>
                        Reserva creada <EstadoReserva estado={resultado.reserva.estado} />
                    </h3>
                    {resultado.reserva.estado === 'PENDIENTE' && resultado.motivo && (
                        <p>Pendiente de confirmación: {resultado.motivo}</p>
                    )}
                    <p>
                        Tarifa estimada:{' '}
                        <strong>
                            {resultado.reserva.tarifaEstimada != null
                                ? `$${resultado.reserva.tarifaEstimada}`
                                : 'sin dato'}
                        </strong>
                    </p>
                    {resultado.condiciones && (
                        <dl className="condiciones">
                            {(Object.keys(TITULOS_CONDICIONES) as (keyof Condiciones)[])
                                .filter((clave) => resultado.condiciones?.[clave])
                                .map((clave) => (
                                    <div key={clave}>
                                        <dt>{TITULOS_CONDICIONES[clave]}</dt>
                                        <dd>{resultado.condiciones?.[clave]}</dd>
                                    </div>
                                ))}
                        </dl>
                    )}
                </section>
            )}
        </form>
    );
}