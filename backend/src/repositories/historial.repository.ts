// Repositorio del historial: solo INSERT y SELECT. Nunca se borra ni se modifica (RF-9.12).
// En la base tipo_cambio y rol_actor son UNA letra: acá se traducen.
// OJO: la base ya registra sola el historial de crear y de cambiar una reserva (trigger).
// Usar registrarHistorial para esos mismos eventos duplicaría las filas.
import { Ejecutor } from '../db/pool';
import {
  CODIGO_ROL_ACTOR,
  CODIGO_TIPO_CAMBIO,
  EntradaHistorial,
  ROL_ACTOR_DESDE_CODIGO,
  TIPO_CAMBIO_DESDE_CODIGO,
} from '../models/reserva';

export interface NuevaEntradaHistorial {
  reservaId: string;
  tipoCambio: string; // CREACION, CONFIRMACION, MODIFICACION, CANCELACION, ACTIVACION o VENCIMIENTO
  campoModificado?: string | null;
  valorAnterior?: string | null;
  valorNuevo?: string | null;
  actorId?: string | null;
  rolActor: string; // CLIENTE, OPERADOR o SISTEMA
  motivo?: string | null;
}

function aCodigo(mapa: Record<string, string>, palabra: string, nombre: string): string {
  const codigo = mapa[palabra.toUpperCase()];
  if (!codigo) throw new Error(`Valor no válido para ${nombre}: ${palabra}`);
  return codigo;
}

export async function registrarHistorial(db: Ejecutor, e: NuevaEntradaHistorial): Promise<void> {
  await db.query(
    `INSERT INTO historial_reserva
       (reserva_id, tipo_cambio, campo_modificado, valor_anterior, valor_nuevo,
        actor_id, rol_actor, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      e.reservaId,
      aCodigo(CODIGO_TIPO_CAMBIO, e.tipoCambio, 'tipo de cambio'),
      e.campoModificado ?? null,
      e.valorAnterior ?? null,
      e.valorNuevo ?? null,
      e.actorId ?? null,
      aCodigo(CODIGO_ROL_ACTOR, e.rolActor, 'rol del actor'),
      e.motivo ?? null,
    ],
  );
}

export async function listarHistorial(
  db: Ejecutor,
  reservaId: string,
): Promise<EntradaHistorial[]> {
  const { rows } = await db.query(
    'SELECT * FROM historial_reserva WHERE reserva_id = $1 ORDER BY fecha_cambio, id',
    [reservaId],
  );
  return rows.map((f: any) => ({
    id: f.id,
    reservaId: f.reserva_id,
    tipoCambio: TIPO_CAMBIO_DESDE_CODIGO[String(f.tipo_cambio).trim()] ?? f.tipo_cambio,
    campoModificado: f.campo_modificado,
    valorAnterior: f.valor_anterior,
    valorNuevo: f.valor_nuevo,
    actorId: f.actor_id,
    rolActor: ROL_ACTOR_DESDE_CODIGO[String(f.rol_actor).trim()] ?? f.rol_actor,
    motivo: f.motivo,
    fechaCambio: f.fecha_cambio,
  }));
}