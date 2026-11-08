/** Lee de la base lo necesario para las métricas y delega el cálculo a una función pura. */
import { prisma } from "../db";
import { ErrorReglaNegocio } from "../errores";
import { exigirAdmin, type Actor } from "../identidad";
import { hoyLocal, instanteLocal, partesLocales } from "../reservas/horario";
import { calcularMetricas } from "./calculo";

const MS_DIA = 24 * 60 * 60_000;
const RANGO_POR_DEFECTO_DIAS = 28;
const RANGO_MAXIMO_DIAS = 366;

export async function obtenerMetricas(
  actor: Actor,
  filtros: { desde?: string; hasta?: string },
  ahora = new Date(),
) {
  exigirAdmin(actor);

  const hasta = filtros.hasta ?? hoyLocal(ahora);
  const desde =
    filtros.desde ??
    partesLocales(new Date(instanteLocal(hasta).getTime() - (RANGO_POR_DEFECTO_DIAS - 1) * MS_DIA + 12 * 3_600_000))
      .fecha;
  const inicioRango = instanteLocal(desde);
  const finRango = new Date(instanteLocal(hasta).getTime() + MS_DIA);

  if (inicioRango >= finRango) {
    throw new ErrorReglaNegocio("RANGO_INVALIDO", "La fecha 'desde' debe ser anterior o igual a 'hasta'.");
  }
  if (finRango.getTime() - inicioRango.getTime() > RANGO_MAXIMO_DIAS * MS_DIA) {
    throw new ErrorReglaNegocio("RANGO_DEMASIADO_AMPLIO", `El rango no puede superar ${RANGO_MAXIMO_DIAS} días.`);
  }

  const [salas, empresas, reservas, ultimas] = await Promise.all([
    prisma.sala.findMany({
      where: { activa: true },
      orderBy: [{ sede: { nombre: "asc" } }, { nombre: "asc" }],
      select: { id: true, nombre: true, capacidad: true, sede: { select: { id: true, nombre: true } } },
    }),
    prisma.empresa.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    prisma.reserva.findMany({
      where: { inicio: { gte: inicioRango, lt: finRango }, sala: { activa: true } },
      select: {
        salaId: true,
        empresaId: true,
        inicio: true,
        fin: true,
        asistentes: true,
        estado: true,
        canceladaEn: true,
        origenCancelacion: true,
      },
    }),
    prisma.reserva.groupBy({
      by: ["empresaId"],
      where: { estado: "CONFIRMADA", inicio: { lte: ahora } },
      _max: { inicio: true },
    }),
  ]);

  const ultimaReservaPorEmpresa = new Map(
    ultimas.filter((u) => u._max.inicio).map((u) => [u.empresaId, u._max.inicio as Date]),
  );

  return calcularMetricas({ desde, hasta, ahora, salas, empresas, reservas, ultimaReservaPorEmpresa });
}
