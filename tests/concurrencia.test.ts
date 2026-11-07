/**
 * El caso crítico del negocio: muchos pedidos simultáneos por la misma sala.
 * Los pedidos se disparan en paralelo (Promise.all) y viajan por conexiones
 * distintas del pool, así que compiten de verdad dentro de Postgres.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { api } from "./helpers/api";
import { crearEscenario, diaHabil, franja } from "./helpers/escenario";

let e: Awaited<ReturnType<typeof crearEscenario>>;
const fecha = diaHabil(3);

beforeEach(async () => {
  e = await crearEscenario();
});

describe("reservas simultáneas", () => {
  it("de 20 pedidos idénticos en paralelo, se confirma exactamente uno", async () => {
    const empresas = [e.empresaA.id, e.empresaB.id];
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        api.crearReserva(
          { empresaId: empresas[i % 2] },
          { salaId: e.salaChica.id, asistentes: 2, ...franja(fecha, "10:00", "11:00") },
        ),
      ),
    );

    const statuses = respuestas.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    expect(await prisma.reserva.count({ where: { salaId: e.salaChica.id, estado: "CONFIRMADA" } })).toBe(1);
  });

  it("con franjas parcialmente superpuestas en paralelo, nunca quedan dos confirmadas que se pisen", async () => {
    // Franjas de 1 h que arrancan cada 30 min: cada una se pisa con sus vecinas.
    const franjas = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00"].map((desde) => {
      const [h, m] = desde.split(":").map(Number);
      const hasta = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return franja(fecha, desde, hasta);
    });

    // Cada franja se pide 3 veces, todo a la vez y en orden mezclado.
    const pedidos = franjas.flatMap((f) => [f, f, f]).sort(() => Math.random() - 0.5);
    const respuestas = await Promise.all(
      pedidos.map((f, i) =>
        api.crearReserva(
          { empresaId: i % 2 ? e.empresaA.id : e.empresaB.id },
          { salaId: e.salaChica.id, asistentes: 2, ...f },
        ),
      ),
    );

    // Cada pedido recibe una respuesta de negocio: confirmada u ocupada. Nunca un error 500,
    // aunque Postgres resuelva internamente deadlocks entre las inserciones.
    expect(new Set(respuestas.map((r) => r.status))).toEqual(new Set([201, 409]));

    const confirmadas = await prisma.reserva.findMany({
      where: { salaId: e.salaChica.id, estado: "CONFIRMADA" },
      orderBy: { inicio: "asc" },
    });
    expect(confirmadas.length).toBeGreaterThan(0);
    for (let i = 1; i < confirmadas.length; i++) {
      expect(confirmadas[i].inicio.getTime()).toBeGreaterThanOrEqual(confirmadas[i - 1].fin.getTime());
    }
  });

  it("si dos pedidos cancelan la misma reserva a la vez, solo uno la cancela", async () => {
    const { cuerpo } = await api.crearReserva(
      { empresaId: e.empresaA.id },
      { salaId: e.salaChica.id, asistentes: 2, ...franja(fecha, "10:00", "11:00") },
    );

    const respuestas = await Promise.all([
      api.cancelarReserva({ empresaId: e.empresaA.id }, cuerpo.reserva.id),
      api.cancelarReserva("admin", cuerpo.reserva.id),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("la base rechaza la superposición aunque se escriba sin pasar por la API", async () => {
    const base = { salaId: e.salaChica.id, empresaId: e.empresaA.id, asistentes: 2 };
    const f = franja(fecha, "10:00", "11:00");
    await prisma.reserva.create({ data: { ...base, inicio: new Date(f.inicio), fin: new Date(f.fin) } });

    const g = franja(fecha, "10:30", "11:30");
    await expect(
      prisma.reserva.create({ data: { ...base, inicio: new Date(g.inicio), fin: new Date(g.fin) } }),
    ).rejects.toThrow();
    expect(await prisma.reserva.count()).toBe(1);
  });
});
