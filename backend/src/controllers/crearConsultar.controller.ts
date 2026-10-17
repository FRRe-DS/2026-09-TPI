import { Request, Response } from 'express';
import { pool } from '../db/pool';
import {
    buscarReservaPorId,
    buscarReservaPorClave,
    insertarReserva,
    listarReservasPorCliente
} from '../repositories/reserva.repository';
import { config } from '../config/env';
import { validarCliente } from '../services/ValidacionCliente.service';
import { validarUbicacion } from '../services/validacionUbicacion.service';
import { estimarTarifa } from '../services/estimacionTarifa.service';
import { confirmarReservaAutomaticamente } from '../services/confirmacionReserva.service';
import { obtenerCoordenadas } from '../services/geocodificacion.service';
import { calcularDistancia } from '../services/calculoDistancia.service';

// Crear una reserva
export const crearReservaCtrl = async (req: Request, res: Response) => {

    const datos = req.body;

    const claveIdempotencia = datos?.claveIdempotencia;

if (
    typeof claveIdempotencia !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claveIdempotencia)
) {
    return res.status(400).json({
        codigo: 'CLAVE_IDEMPOTENCIA_INVALIDA',
        mensaje: 'Debes enviar una clave de idempotencia con formato UUID'
    });
}

// Validar que estén todos los campos obligatorios
if (
    !datos ||
    typeof datos.clienteId !== 'string' ||
    datos.clienteId.trim() === '' ||
    typeof datos.origen !== 'string' ||
    datos.origen.trim() === '' ||
    typeof datos.destino !== 'string' ||
    datos.destino.trim() === '' ||
    typeof datos.tipoVehiculo !== 'string' ||
    datos.tipoVehiculo.trim() === '' ||
    typeof datos.fechaHora !== 'string' ||
    datos.fechaHora.trim() === '' ||
    typeof datos.zonaHoraria !== 'string' ||
    datos.zonaHoraria.trim() === ''
) {
    return res.status(400).json({
        codigo: 'DATOS_INCOMPLETOS',
        mensaje: 'Faltan datos obligatorios o contienen valores inválidos'
    });
}
// Validamos que el tipo de vehículo sea permitido
if (
    datos.tipoVehiculo !== 'AUTO' &&
    datos.tipoVehiculo !== 'MOTO'
) {
    return res.status(400).json({
        codigo: 'TIPO_VEHICULO_INVALIDO',
        mensaje: 'El tipo de vehículo debe ser AUTO o MOTO'
    });
}

// Validar que la zona horaria exista
try {
    new Intl.DateTimeFormat('es-AR', {
        timeZone: datos.zonaHoraria
    });
} catch (error) {
    return res.status(400).json({
        codigo: 'ZONA_HORARIA_INVALIDA',
        mensaje: 'La zona horaria indicada no es válida'
    });
}
// Convertimos la fecha recibida en un objeto Date
const fechaHoraReserva = new Date(datos.fechaHora);

// Verificamos que la fecha tenga un valor válido
if (isNaN(fechaHoraReserva.getTime())) {
    return res.status(400).json({
        codigo: 'FECHA_INVALIDA',
        mensaje: 'La fecha y hora de la reserva no son válidas'
    });
}

try {
    const reservaExistente = await buscarReservaPorClave(
        pool,
        claveIdempotencia
    );

    if (reservaExistente) {

    // Comprobar si los datos coinciden con la reserva original
    const datosCoinciden =
    reservaExistente.clienteId === datos.clienteId &&
    reservaExistente.origen.direccion === datos.origen &&
    reservaExistente.destino.direccion === datos.destino &&
    reservaExistente.tipoVehiculo === datos.tipoVehiculo &&
    reservaExistente.fechaHora.getTime() === fechaHoraReserva.getTime() &&
    reservaExistente.zonaHoraria === datos.zonaHoraria;

    // Misma clave, pero datos diferentes
    if (!datosCoinciden) {
        return res.status(409).json({
            codigo: 'CONFLICTO_IDEMPOTENCIA',
            mensaje: 'La clave de idempotencia ya fue utilizada con datos diferentes'
        });
    }

    // Misma clave y mismos datos
    return res.status(200).json({
    mensaje: 'Esta solicitud ya tiene una reserva registrada',
    reserva: reservaExistente,
    condiciones: {
        confirmacion: 'La reserva se confirma si el cliente está habilitado, las ubicaciones son válidas y se cumple la anticipación permitida.',
        modificacion: 'Se permite modificar reservas pendientes o confirmadas hasta 60 minutos antes del viaje. La nueva fecha debe respetar la anticipación mínima de 60 minutos y máxima de 30 días.',
        cancelacion: 'Se permite cancelar reservas pendientes o confirmadas hasta 60 minutos antes del viaje.',
        activacion: 'Una reserva activada no puede modificarse ni cancelarse.',
        tarifa: 'La tarifa informada es estimada y no representa un precio definitivo.'
    }
});
}

} catch (error) {
    console.error('Error al consultar la clave de idempotencia:', error);

    return res.status(500).json({
        codigo: 'ERROR_INTERNO',
        mensaje: 'No se pudo verificar la clave de idempotencia'
    });
}

// Obtenemos la fecha y hora actual
const ahora = new Date();

// Comprobamos que la reserva sea para una fecha futura
if (fechaHoraReserva <= ahora) {
    return res.status(400).json({
        codigo: 'FECHA_PASADA',
        mensaje: 'La fecha y hora de la reserva deben ser futuras'
    });
}
// Calculamos cuánto falta para la reserva
const diferenciaMilisegundos =
    fechaHoraReserva.getTime() - ahora.getTime();

const diferenciaMinutos =
    diferenciaMilisegundos / (1000 * 60);

// Anticipación mínima: 60 minutos
// Anticipación mínima configurada por el equipo
const ANTICIPACION_MINIMA_MINUTOS = config.anticipacionMinimaMinutos; //se adapta a la configuracion de equipo automaticamente

if (diferenciaMinutos < ANTICIPACION_MINIMA_MINUTOS) {
    return res.status(400).json({
        codigo: 'ANTICIPACION_INSUFICIENTE',
        mensaje: `La reserva debe realizarse con al menos ${ANTICIPACION_MINIMA_MINUTOS} minutos de anticipación`
    });
}

// Anticipación máxima: 30 días
const ANTICIPACION_MAXIMA_DIAS = config.anticipacionMaximaDias;

const diferenciaDias = diferenciaMinutos / (60 * 24);

if (diferenciaDias > ANTICIPACION_MAXIMA_DIAS) {
    return res.status(400).json({
        codigo: 'ANTICIPACION_EXCEDIDA',
        mensaje: 'La reserva no puede realizarse con más de 30 días de anticipación'
    });
}

// RF-9.3: Validación del cliente
try {
    const resultadoCliente = await validarCliente(datos.clienteId);

    if (!resultadoCliente.habilitado) {
        return res.status(403).json({
            codigo: 'CLIENTE_NO_HABILITADO',
            mensaje: resultadoCliente.motivo
                ?? 'El cliente no está habilitado para realizar reservas'
        });
    }

} catch (error) {
    console.error('Error al validar el cliente:', error);

    return res.status(500).json({
        codigo: 'ERROR_VALIDACION_CLIENTE',
        mensaje: 'No se pudo validar el cliente'
    });
}

let coordenadasOrigen;
let coordenadasDestino;

// RF-9.3: Validación de ubicaciones
try {
    const resultadoUbicacion = await validarUbicacion(
        datos.origen,
        datos.destino
    );

    if (!resultadoUbicacion.valido) {
        return res.status(400).json({
            codigo: 'UBICACION_INVALIDA',
            mensaje: resultadoUbicacion.motivo
                ?? 'El origen o destino no es válido'
        });
    }

    // M9 obtiene las coordenadas de las direcciones ingresadas
    coordenadasOrigen = await obtenerCoordenadas(datos.origen);
    coordenadasDestino = await obtenerCoordenadas(datos.destino);

    // Verificar que ambas direcciones tengan coordenadas
    if (!coordenadasOrigen || !coordenadasDestino) {
        return res.status(400).json({
            codigo: 'COORDENADAS_NO_DISPONIBLES',
            mensaje: 'No se pudieron obtener las coordenadas del origen o destino'
        });
    }

    // M9 envía las coordenadas al servicio simulado de M4
const resultadoDistancia = await calcularDistancia(
    coordenadasOrigen,
    coordenadasDestino
);

// Obtenemos la distancia devuelta por M4
const distanciaKm = resultadoDistancia.distanciaKm;

console.log('Distancia simulada del viaje:', distanciaKm, 'km');


} catch (error) {
    console.error('Error al validar la ubicación:', error);

    return res.status(500).json({
        codigo: 'ERROR_VALIDACION_UBICACION',
        mensaje: 'No se pudo validar el origen y destino'
    });
}

// RF-9.4: Estimación simulada de tarifa (M7)
let tarifaEstimada: number;

try {
    const resultadoTarifa = await estimarTarifa(datos.tipoVehiculo);

    tarifaEstimada = resultadoTarifa.tarifaEstimada;

} catch (error) {
    console.error('Error al estimar la tarifa:', error);

    return res.status(500).json({
        codigo: 'ERROR_ESTIMACION_TARIFA',
        mensaje: 'No se pudo estimar la tarifa del viaje'
    });
}

// Guardar la reserva en PostgreSQL
try {
    const nuevaReserva = await insertarReserva(pool, {
        clienteId: datos.clienteId,
        origen: {
    direccion: datos.origen,
    latitud: coordenadasOrigen.latitud,
    longitud: coordenadasOrigen.longitud
},
destino: {
    direccion: datos.destino,
    latitud: coordenadasDestino.latitud,
    longitud: coordenadasDestino.longitud
},
        tipoVehiculo: datos.tipoVehiculo,
        fechaHora: fechaHoraReserva,
        zonaHoraria: datos.zonaHoraria,
        estado: 'PENDIENTE',
        tarifaEstimada: tarifaEstimada,
        claveIdempotencia: claveIdempotencia
    });

// RF-9.5: Intentar confirmar automáticamente la reserva
let resultadoConfirmacion: {
    confirmada: boolean;
    motivo?: string;
};

try {
    resultadoConfirmacion = await confirmarReservaAutomaticamente(
        nuevaReserva.id
    );

} catch (error) {
    console.error('Error al confirmar automáticamente la reserva:', error);

    resultadoConfirmacion = {
        confirmada: false,
        motivo: 'No se pudo confirmar automáticamente la reserva'
    };
}

// Obtener la reserva con su estado actualizado
const reservaActualizada = await buscarReservaPorId(
    pool,
    nuevaReserva.id
);

return res.status(201).json({
    mensaje: resultadoConfirmacion.confirmada
        ? 'Reserva creada y confirmada correctamente'
        : 'Reserva creada, pendiente de confirmación',

    motivo: resultadoConfirmacion.motivo,

    reserva: reservaActualizada,

    condiciones: {
        confirmacion: 'La reserva se confirma si el cliente está habilitado, las ubicaciones son válidas y se cumple la anticipación permitida.',

        modificacion: 'Se permite modificar reservas pendientes o confirmadas hasta 60 minutos antes del viaje. La nueva fecha debe respetar la anticipación mínima de 60 minutos y máxima de 30 días.',

        cancelacion: 'Se permite cancelar reservas pendientes o confirmadas hasta 60 minutos antes del viaje.',

        activacion: 'Una reserva activada no puede modificarse ni cancelarse.',

        tarifa: 'La tarifa informada es estimada y no representa un precio definitivo.'
    }
});

} catch (error) {

    // Verificar si PostgreSQL detectó una clave duplicada
    if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
    ) {
        try {
            const reservaExistente = await buscarReservaPorClave(
                pool,
                claveIdempotencia
            );

            if (reservaExistente) {

                const datosCoinciden =
                    reservaExistente.clienteId === datos.clienteId &&
                    reservaExistente.origen.direccion === datos.origen &&
                    reservaExistente.destino.direccion === datos.destino &&
                    reservaExistente.tipoVehiculo === datos.tipoVehiculo &&
                    reservaExistente.fechaHora.getTime() === fechaHoraReserva.getTime() &&
                    reservaExistente.zonaHoraria === datos.zonaHoraria;

                if (!datosCoinciden) {
                    return res.status(409).json({
                        codigo: 'CONFLICTO_IDEMPOTENCIA',
                        mensaje: 'La clave de idempotencia ya fue utilizada con datos diferentes'
                    });
                }

                return res.status(200).json({
    mensaje: 'Esta solicitud ya tiene una reserva registrada',
    reserva: reservaExistente,
    condiciones: {
        confirmacion: 'La reserva se confirma si el cliente está habilitado, las ubicaciones son válidas y se cumple la anticipación permitida.',
        modificacion: 'Se permite modificar reservas pendientes o confirmadas hasta 60 minutos antes del viaje. La nueva fecha debe respetar la anticipación mínima de 60 minutos y máxima de 30 días.',
        cancelacion: 'Se permite cancelar reservas pendientes o confirmadas hasta 60 minutos antes del viaje.',
        activacion: 'Una reserva activada no puede modificarse ni cancelarse.',
        tarifa: 'La tarifa informada es estimada y no representa un precio definitivo.'
    }
});
            }

        } catch (errorBusqueda) {
            console.error(
                'Error al recuperar la reserva duplicada:',
                errorBusqueda
            );
        }
    }

    console.error('Error al crear la reserva:', error);

    return res.status(500).json({
        codigo: 'ERROR_INTERNO',
        mensaje: 'No se pudo crear la reserva'
    });
}
};

// Consultar una reserva por ID
export const consultarReservaCtrl = async (
    req: Request,
    res: Response
): Promise<void> => {
    try {
        const id = String(req.params.id);

// Validar que el ID tenga formato UUID
const formatoUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!formatoUUID.test(id)) {
    res.status(400).json({
        codigo: 'ID_INVALIDO',
        mensaje: 'El identificador de la reserva debe tener formato UUID'
    });
    return;
}
        const reservaEncontrada = await buscarReservaPorId(pool, id);

        if (!reservaEncontrada) {
            res.status(404).json({
                error: 'Reserva no encontrada'
            });
            return;
        }

        res.status(200).json(reservaEncontrada);

    } catch (error) {
        console.error('Error al consultar la reserva:', error);

        res.status(500).json({
            error: 'Error interno al consultar la reserva'
        });
    }
};

// Listar las reservas de un cliente
export const listarReservasCtrl = async (req: Request, res: Response) => {
    try {
        // Obtener el ID del cliente desde la URL
        const clienteId = req.query.clienteId;

        // Validar que se haya enviado un ID
        if (typeof clienteId !== 'string' || clienteId.trim() === '') {
            return res.status(400).json({
                codigo: 'CLIENTE_ID_REQUERIDO',
                mensaje: 'Debes indicar el identificador del cliente'
            });
        }

        // Consultar las reservas en PostgreSQL
        const reservas = await listarReservasPorCliente(pool, clienteId);

        // Devolver las reservas encontradas
        return res.status(200).json(reservas);

    } catch (error) {
        console.error('Error al listar las reservas:', error);

        return res.status(500).json({
            codigo: 'ERROR_INTERNO',
            mensaje: 'No se pudieron obtener las reservas'
        });
    }
};