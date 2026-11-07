import { manejar, parametrosDeConsulta, validar } from "@/server/http";
import { obtenerActor } from "@/server/identidad";
import { esquemaDisponibilidad } from "@/server/reservas/esquemas";
import { disponibilidadDelDia } from "@/server/reservas/servicio";

/** Franjas ocupadas de cada sala en un día (`?fecha=AAAA-MM-DD`). */
export const GET = manejar(async (request: Request) => {
  const actor = await obtenerActor(request);
  const { fecha } = validar(esquemaDisponibilidad, parametrosDeConsulta(request));
  return Response.json(await disponibilidadDelDia(actor, fecha));
});
