import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export function crearPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("Falta la variable de entorno DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// En desarrollo, Next recarga módulos en caliente: reutilizamos una sola instancia
// para no abrir un pool de conexiones nuevo en cada recarga.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalParaPrisma.prisma ?? crearPrismaClient();

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = prisma;
