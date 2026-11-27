import type { Reserva, NuevaReserva, ErrorApi, Ubicacion, TipoVehiculo } from '../types';
import { obtenerToken, pedirIngreso } from '../auth/sesion';

const API_URL = import.meta.env.VITE_API_URL;
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export class ApiError extends Error {
    status: number;
    constructor(status: number, mensaje: string) {
        super(mensaje);
        this.status = status;
    }
}

// Condiciones de confirmación, modificación, cancelación y tarifa (esquema Condiciones del contrato de M9)
export interface Condiciones {
    confirmacion?: string;
    modificacion?: string;
    cancelacion?: string;
    activacion?: string;
    tarifa?: string;
}

// Lo que nos interesa de la respuesta al crear: la reserva, el motivo si quedó PENDIENTE y las condiciones
export interface ResultadoCreacion {
    reserva: Reserva;
    motivo?: string;
    condiciones?: Condiciones;
}

// Una fila del historial (GET /reservas/{id}/historial, esquema EntradaHistorial del contrato de M9)
export interface EntradaHistorial {
    id: string;
    reservaId: string;
    tipoCambio: string; // CREACION, CONFIRMACION, MODIFICACION, CANCELACION, ACTIVACION, VENCIMIENTO
    campoModificado: string | null;
    valorAnterior: string | null;
    valorNuevo: string | null;
    actorId: string | null;
    rolActor: string; // CLIENTE, OPERADOR o SISTEMA
    motivo: string | null;
    fechaCambio: string;
}

// Lo que se puede cambiar con PATCH /reservas/{id} (todo opcional, esquema CambiosReserva del contrato)
export interface CambiosReserva {
    origen?: Ubicacion;
    destino?: Ubicacion;
    tipoVehiculo?: TipoVehiculo;
    fechaHora?: string;
    zonaHoraria?: string;
}

interface ReservasApi {
    listar(clienteId: string): Promise<Reserva[]>;
    crear(datos: NuevaReserva): Promise<ResultadoCreacion>;
    cancelar(id: string, motivo: string): Promise<Reserva>;
    historial(id: string): Promise<EntradaHistorial[]>;
    modificar(id: string, cambios: CambiosReserva): Promise<Reserva>;
}

// ---------- Backend real ----------
// Mensajes claros para los errores que no dependen de lo que explique la API
const MENSAJES_POR_ESTADO: Record<number, string> = {
    401: 'Tu sesión venció, volvé a ingresar',
    403: 'No tenés permiso',
    409: 'La reserva cambió, actualizá la pantalla',
    503: 'Un servicio no responde',
};

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
    const token = await obtenerToken();
    let res: Response;
    try {
        res = await fetch(`${API_URL}${ruta}`, {
            ...opciones,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
        });
    } catch {
        throw new ApiError(0, 'No se pudo conectar con el servidor');
    }

    if (!res.ok) {
        if (res.status === 401) {
            // Sin sesión válida: se vuelve a mostrar la pantalla de ingreso
            void pedirIngreso();
        }
        const mensajeFijo = MENSAJES_POR_ESTADO[res.status];
        if (mensajeFijo) {
            throw new ApiError(res.status, mensajeFijo);
        }

        // 422 y el resto: se muestra el motivo que devuelve la API
        let mensaje = `Error ${res.status}`;
        try {
            const err: ErrorApi = await res.json();
            if (err.mensaje) mensaje = err.mensaje;
            // Si el backend explica qué dato falló (lista de textos en "detalle"), lo sumamos al mensaje
            if (Array.isArray(err.detalle) && err.detalle.every((d) => typeof d === 'string')) {
                mensaje = `${mensaje}: ${err.detalle.join('; ')}`;
            }
        } catch {
            // la respuesta no trajo JSON
        }
        throw new ApiError(res.status, mensaje);
    }
    return res.json() as Promise<T>;
}

const real: ReservasApi = {
    listar: (clienteId) =>
        pedir<Reserva[]>(`/reservas?clienteId=${encodeURIComponent(clienteId)}`),
    // El backend pide una claveIdempotencia (UUID) para no crear dos veces la misma reserva,
    // y responde { mensaje, motivo, reserva, condiciones }: nos quedamos con la reserva, el motivo y las condiciones.
    crear: async (datos) => {
        const respuesta = await pedir<ResultadoCreacion>('/reservas', {
            method: 'POST',
            body: JSON.stringify({ ...datos, claveIdempotencia: crypto.randomUUID() }),
        });
        return { reserva: respuesta.reserva, motivo: respuesta.motivo, condiciones: respuesta.condiciones };
    },
    cancelar: (id, motivo) =>
        pedir<Reserva>(`/reservas/${id}/cancelar`, {
            method: 'POST',
            body: JSON.stringify({ motivo }),
        }),
    historial: (id) => pedir<EntradaHistorial[]>(`/reservas/${id}/historial`),
    modificar: (id, cambios) =>
        pedir<Reserva>(`/reservas/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(cambios),
        }),
};

// ---------- Simulación (mientras no hay backend) ----------
let reservasMock: Reserva[] = [];
const esperar = () => new Promise((r) => setTimeout(r, 500));

const mock: ReservasApi = {
    async listar(clienteId) {
        await esperar();
        return reservasMock.filter((r) => r.clienteId === clienteId);
    },
    async crear(datos) {
        await esperar();
        const minimo = Date.now() + 60 * 60 * 1000; // 60 minutos de anticipación
        if (new Date(datos.fechaHora).getTime() < minimo) {
            throw new ApiError(422, 'La reserva debe hacerse con al menos 60 minutos de anticipación');
        }
    const ahora = new Date().toISOString();
    const nueva: Reserva = {
      ...datos,
      id: crypto.randomUUID(),
      origen: datos.origen,
      destino: datos.destino,
      estado: 'CONFIRMADA',
      tarifaEstimada: 4500,
      motivoCancelacion: null,
      solicitudDespachoId: null,
      creadaEn: ahora,
    };
        reservasMock = [nueva, ...reservasMock];
        return { reserva: nueva };
    },
    async cancelar(id, motivo) {
        await esperar();
        const r = reservasMock.find((x) => x.id === id);
        if (!r) throw new ApiError(404, 'La reserva no existe');
        if (r.estado === 'CANCELADA' || r.estado === 'ACTIVADA') {
            throw new ApiError(409, `No se puede cancelar una reserva ${r.estado}`);
        }
        const cancelada: Reserva = {
            ...r,
            estado: 'CANCELADA',
            motivoCancelacion: motivo,
        };
        reservasMock = reservasMock.map((x) => (x.id === id ? cancelada : x));
        return cancelada;
    },
    async historial() {
        await esperar();
        return [];
    },
    async modificar(id, cambios) {
        await esperar();
        const r = reservasMock.find((x) => x.id === id);
        if (!r) throw new ApiError(404, 'La reserva no existe');
        if (r.estado !== 'PENDIENTE' && r.estado !== 'CONFIRMADA') {
            throw new ApiError(409, `No se puede modificar una reserva ${r.estado}`);
        }
        const modificada: Reserva = { ...r, ...cambios, modificadaEn: new Date().toISOString() };
        reservasMock = reservasMock.map((x) => (x.id === id ? modificada : x));
        return modificada;
    },
};

export const reservasApi: ReservasApi = USE_MOCK ? mock : real;