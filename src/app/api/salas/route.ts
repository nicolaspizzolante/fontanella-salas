import { listarSalas } from "@/server/catalogo";
import { manejar } from "@/server/http";
import { obtenerActor } from "@/server/identidad";

export const GET = manejar(async (request: Request) => {
  await obtenerActor(request);
  return Response.json({ salas: await listarSalas() });
});
