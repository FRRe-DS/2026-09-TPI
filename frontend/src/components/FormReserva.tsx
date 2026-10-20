import { useState } from 'react';
import type { FormEvent } from 'react';
import { reservasApi, ApiError } from '../api/reservas';
import type { TipoVehiculo, Ubicacion } from '../types';
import { MapaSelector } from './MapaSelector';

interface Props {
    clienteId: string;
    onCreada: () => void;
}

type Estado = 'idle' | 'guardando' | 'ok' | 'error';

export function FormReserva({ clienteId, onCreada }: Props) {
    const [origen, setOrigen] = useState<Ubicacion | null>(null);
    const [destino, setDestino] = useState<Ubicacion | null>(null);
    const [tipoVehiculo, setTipoVehiculo] = useState<TipoVehiculo>('AUTO');
    const [fechaHora, setFechaHora] = useState('');
    const [estado, setEstado] = useState<Estado>('idle');
    const [mensaje, setMensaje] = useState('');

    async function enviar(e: FormEvent) {
        e.preventDefault();
        if (!origen || !destino) {
            setEstado('error');
            setMensaje('Marcá el origen y el destino en el mapa');
            return;
        }
        setEstado('guardando');
        setMensaje('Guardando…');
        try {
            const { reserva, motivo } = await reservasApi.crear({
                clienteId,
                origen,
                destino,
                tipoVehiculo,
                fechaHora: new Date(fechaHora).toISOString(),
                zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            setEstado('ok');
            // Si no se pudo confirmar automáticamente, la reserva queda PENDIENTE y el backend dice por qué
            setMensaje(
                reserva.estado === 'PENDIENTE'
                    ? `Reserva creada, pendiente de confirmación${motivo ? `: ${motivo}` : ''}`
                    : 'Reserva creada y confirmada',
            );
            setOrigen(null);
            setDestino(null);
            setFechaHora('');
            onCreada();
        } catch (err) {
            setEstado('error');
            const motivo = err instanceof ApiError ? err.message : 'error inesperado';
            setMensaje(`No se pudo crear: ${motivo}`);
        }
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

            <button type="submit" disabled={estado === 'guardando'}>
                {estado === 'guardando' ? 'Guardando…' : 'Reservar'}
            </button>

            {mensaje && <p className={`mensaje ${estado}`}>{mensaje}</p>}
        </form>
    );
}