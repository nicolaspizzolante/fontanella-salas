/** Datos de referencia: salas y empresas. */
import { prisma } from "./db";

export async function listarSalas() {
  return prisma.sala.findMany({
    where: { activa: true },
    orderBy: [{ sede: { nombre: "asc" } }, { nombre: "asc" }],
    select: { id: true, nombre: true, capacidad: true, sede: { select: { id: true, nombre: true } } },
  });
}

export async function listarEmpresas() {
  return prisma.empresa.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
}
