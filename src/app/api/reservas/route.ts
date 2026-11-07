import { leerJson, manejar, parametrosDeConsulta, validar } from "@/server/http";
import { obtenerActor } from "@/server/identidad";
import { esquemaCrearReserva, esquemaListarReservas } from "@/server/reservas/esquemas";
import { crearReserva, listarReservas } from "@/server/reservas/servicio";

/** Lista reservas: las propias (empresa) o todas (admin). */
export const GET = manejar(async (request: Request) => {
  const actor = await obtenerActor(request);
  const filtros = validar(esquemaListarReservas, parametrosDeConsulta(request));
  return Response.json({ reservas: await listarReservas(actor, filtros) });
});

/** Crea una reserva a nombre de la empresa que hace el pedido. */
export const POST = manejar(async (request: Request) => {
  const actor = await obtenerActor(request);
  const datos = validar(esquemaCrearReserva, await leerJson(request));
  return Response.json({ reserva: await crearReserva(actor, datos) }, { status: 201 });
});
