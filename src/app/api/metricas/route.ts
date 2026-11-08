import { manejar, parametrosDeConsulta, validar } from "@/server/http";
import { obtenerActor } from "@/server/identidad";
import { obtenerMetricas } from "@/server/metricas/servicio";
import { esquemaMetricas } from "@/server/reservas/esquemas";

/** Métricas de uso para la empresa administradora (`?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`). */
export const GET = manejar(async (request: Request) => {
  const actor = await obtenerActor(request);
  const filtros = validar(esquemaMetricas, parametrosDeConsulta(request));
  return Response.json(await obtenerMetricas(actor, filtros));
});
