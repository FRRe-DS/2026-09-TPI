// Le avisa a la base QUIÉN hace el cambio, para que el trigger del historial lo anote.
// Hay que llamarlo DENTRO de una transacción, antes del INSERT/UPDATE, con el mismo "client".
import { Ejecutor } from './pool';
import { CODIGO_ROL_ACTOR, RolActor } from '../models/reserva';

export async function establecerActor(
  db: Ejecutor,
  actorId: string | null,
  rolActor: string,
): Promise<void> {
  const rol = CODIGO_ROL_ACTOR[rolActor.toUpperCase() as RolActor];
  if (!rol) throw new Error(`Valor no válido para rol del actor: ${rolActor}`);
  await db.query(
    "SELECT set_config('app.actor_id', $1, true), set_config('app.actor_role', $2, true)",
    [actorId ?? '', rol],
  );
}