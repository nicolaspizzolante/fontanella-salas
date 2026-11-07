import { manejar, validar } from "@/server/http";
import { obtenerActor } from "@/server/identidad";
import { esquemaIdReserva } from "@/server/reservas/esquemas";
import { cancelarReserva } from "@/server/reservas/servicio";

type Contexto = { params: Promise<{ id: string }> };

/**
 * Cancela una reserva. Es un POST a una acción (no un DELETE) porque la reserva
 * no se borra: cambia de estado y se conserva para el historial y las métricas.
 */
export const POST = manejar(async (request: Request, { params }: Contexto) => {
  const actor = await obtenerActor(request);
  const id = validar(esquemaIdReserva, (await params).id);
  return Response.json({ reserva: await cancelarReserva(actor, id) });
});
