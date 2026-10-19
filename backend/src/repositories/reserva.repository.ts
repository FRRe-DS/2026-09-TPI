// Repositorio de reservas: el ÚNICO lugar donde se escribe SQL sobre la tabla reserva.
// En la base estado y tipo_vehiculo son UNA letra: acá se traduce de palabra a letra y viceversa.
import { Ejecutor } from '../db/pool';
import {
  CambiosReserva,
  CODIGO_ESTADO,
  CODIGO_TIPO_VEHICULO,
  DatosNuevaReserva,
  EstadoReserva,
  ESTADO_DESDE_CODIGO,
  Reserva,
  TIPO_VEHICULO_DESDE_CODIGO,
  TipoVehiculo,
} from '../models/reserva';

// Convierte una fila de la base (snake_case) en un objeto de TypeScript (camelCase).
export function filaAReserva(fila: any): Reserva {
  return {
    id: fila.id,
    clienteId: fila.cliente_id,
    origen: fila.origen, // jsonb: pg ya lo entrega como objeto
    destino: fila.destino,
    tipoVehiculo: TIPO_VEHICULO_DESDE_CODIGO[String(fila.tipo_vehiculo).trim()] ?? fila.tipo_vehiculo,
    fechaHora: fila.fecha_hora,
    zonaHoraria: fila.zona_horaria,
    estado: ESTADO_DESDE_CODIGO[String(fila.estado).trim()] ?? fila.estado,
    tarifaEstimada: fila.tarifa_estimada === null ? null : Number(fila.tarifa_estimada),
    motivoCancelacion: fila.motivo_cancelacion,
    solicitudDespachoId: fila.solicitud_despacho_id,
    claveIdempotencia: fila.clave_idempotencia,
    creadaEn: fila.creada_en,
    modificadaEn: fila.modificada_en,
  };
}

// El servicio que crea la reserva debe registrar CREACION en la misma transacción.
export async function insertarReserva(
  db: Ejecutor,
  datos: DatosNuevaReserva & {
    estado: EstadoReserva;
    tarifaEstimada: number | null;
    claveIdempotencia: string;
  },
): Promise<Reserva> {
  const { rows } = await db.query(
    `INSERT INTO reserva
      (cliente_id, origen, destino, tipo_vehiculo, fecha_hora, zona_horaria,
        estado, tarifa_estimada, clave_idempotencia)
    VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      datos.clienteId,
      JSON.stringify(datos.origen),
      JSON.stringify(datos.destino),
      CODIGO_TIPO_VEHICULO[datos.tipoVehiculo],
      datos.fechaHora,
      datos.zonaHoraria,
      CODIGO_ESTADO[datos.estado],
      datos.tarifaEstimada,
      datos.claveIdempotencia,
    ],
  );
  return filaAReserva(rows[0]);
}

// bloquear=true se usa dentro de transaccion para validar y escribir sobre la misma versión.
export async function buscarReservaPorId(
  db: Ejecutor,
  id: string,
  bloquear = false,
): Promise<Reserva | null> {
  const { rows } = await db.query(
    `SELECT * FROM reserva WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// Confirmación condicional: nunca vuelve a confirmar una reserva que dejó de estar PENDIENTE.
export async function confirmarReservaEnBase(
  db: Ejecutor,
  id: string,
  tarifaEstimada: number,
): Promise<Reserva | null> {
  const { rows } = await db.query(
    `UPDATE reserva SET estado = $2, tarifa_estimada = $3, modificada_en = now()
     WHERE id = $1 AND estado = $4
     RETURNING *`,
    [id, CODIGO_ESTADO.CONFIRMADA, tarifaEstimada, CODIGO_ESTADO.PENDIENTE],
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// Sirve para detectar reintentos: si ya existe, no se crea otra reserva igual.
export async function buscarReservaPorClave(
  db: Ejecutor,
  claveIdempotencia: string,
): Promise<Reserva | null> {
  const { rows } = await db.query('SELECT * FROM reserva WHERE clave_idempotencia = $1', [
    claveIdempotencia,
  ]);
  return rows[0] ? filaAReserva(rows[0]) : null;
}

export async function listarReservasPorCliente(
  db: Ejecutor,
  clienteId: string,
): Promise<Reserva[]> {
  const { rows } = await db.query(
    'SELECT * FROM reserva WHERE cliente_id = $1 ORDER BY fecha_hora',
    [clienteId],
  );
  return rows.map(filaAReserva);
}

// Actualiza SOLO si la reserva sigue en un estado editable (PENDIENTE o CONFIRMADA).
// Si otro proceso la canceló o activó un instante antes, devuelve null.
export async function actualizarDatosReserva(
  db: Ejecutor,
  id: string,
  cambios: CambiosReserva,
): Promise<Reserva | null> {
  const columnas: Record<string, string> = {
    origen: 'origen',
    destino: 'destino',
    tipoVehiculo: 'tipo_vehiculo',
    fechaHora: 'fecha_hora',
    zonaHoraria: 'zona_horaria',
    tarifaEstimada: 'tarifa_estimada',
  };
  const sets: string[] = [];
  // $1 = id, $2 y $3 = los estados en los que se puede modificar
  const valores: unknown[] = [id, CODIGO_ESTADO.PENDIENTE, CODIGO_ESTADO.CONFIRMADA];
  for (const [campo, valor] of Object.entries(cambios)) {
    if (valor === undefined || !columnas[campo]) continue;
    if (campo === 'origen' || campo === 'destino') {
      valores.push(JSON.stringify(valor));
      sets.push(`${columnas[campo]} = $${valores.length}::jsonb`);
    } else if (campo === 'tipoVehiculo') {
      valores.push(CODIGO_TIPO_VEHICULO[valor as TipoVehiculo]);
      sets.push(`${columnas[campo]} = $${valores.length}`);
    } else {
      valores.push(valor);
      sets.push(`${columnas[campo]} = $${valores.length}`);
    }
  }
  const { rows } = await db.query(
    `UPDATE reserva SET ${[...sets, 'modificada_en = now()'].join(', ')}
    WHERE id = $1 AND estado IN ($2, $3)
     RETURNING *`,
    valores,
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// Cancela SOLO si la reserva sigue en un estado editable (si no, devuelve null).
// El motivo se guarda en reserva.motivo_cancelacion .
export async function cancelarReservaEnBase(
  db: Ejecutor,
  id: string,
  motivo: string | null = null,
): Promise<Reserva | null> {
  const { rows } = await db.query(
    `UPDATE reserva SET estado = $2, motivo_cancelacion = $3, modificada_en = now()
    WHERE id = $1 AND estado IN ($4, $5)
     RETURNING *`,
    [id, CODIGO_ESTADO.CANCELADA, motivo, CODIGO_ESTADO.PENDIENTE, CODIGO_ESTADO.CONFIRMADA],
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// ACTIVACIÓN: pasa de CONFIRMADA a ACTIVADA en UNA sola instrucción (el "cartel").
// Si dos pedidos llegan a la vez, la base deja pasar a uno solo; el otro recibe null.
export async function tomarReservaParaActivar(db: Ejecutor, id: string): Promise<Reserva | null> {
  const { rows } = await db.query(
    `UPDATE reserva SET estado = $2, modificada_en = now()
     WHERE id = $1 AND estado = $3
     RETURNING *`,
    [id, CODIGO_ESTADO.ACTIVADA, CODIGO_ESTADO.CONFIRMADA],
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}

// Guarda el id que devolvió M5, solo si la reserva está ACTIVADA y todavía no tiene uno.
export async function guardarSolicitudDespacho(
  db: Ejecutor,
  id: string,
  solicitudDespachoId: string,
): Promise<Reserva | null> {
  const { rows } = await db.query(
    `UPDATE reserva SET solicitud_despacho_id = $2, modificada_en = now()
     WHERE id = $1 AND estado = $3 AND solicitud_despacho_id IS NULL
     RETURNING *`,
    [id, solicitudDespachoId, CODIGO_ESTADO.ACTIVADA],
  );
  return rows[0] ? filaAReserva(rows[0]) : null;
}