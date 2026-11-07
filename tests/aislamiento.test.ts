/**
 * Aislamiento entre empresas: ninguna puede ver ni modificar datos privados
 * de otra (protección contra IDOR), mientras que el administrador ve todo.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { api } from "./helpers/api";
import { crearEscenario, diaHabil, franja } from "./helpers/escenario";

let e: Awaited<ReturnType<typeof crearEscenario>>;
let reservaA: string;
let reservaB: string;
const fecha = diaHabil(2);

beforeEach(async () => {
  e = await crearEscenario();
  const crear = async (empresaId: string, desde: string, hasta: string) =>
    (
      await api.crearReserva(
        { empresaId },
        { salaId: e.salaChica.id, asistentes: 2, motivo: `Privado de ${empresaId}`, ...franja(fecha, desde, hasta) },
      )
    ).cuerpo.reserva.id as string;
  reservaA = await crear(e.empresaA.id, "10:00", "11:00");
  reservaB = await crear(e.empresaB.id, "12:00", "13:00");
});

describe("aislamiento entre empresas", () => {
  it("cada empresa lista solo sus propias reservas", async () => {
    const deA = await api.listarReservas({ empresaId: e.empresaA.id });
    const deB = await api.listarReservas({ empresaId: e.empresaB.id });

    expect(deA.cuerpo.reservas.map((r: { id: string }) => r.id)).toEqual([reservaA]);
    expect(deB.cuerpo.reservas.map((r: { id: string }) => r.id)).toEqual([reservaB]);
  });

  it("una empresa no puede cancelar la reserva de otra: 404 y la reserva sigue intacta", async () => {
    const { status } = await api.cancelarReserva({ empresaId: e.empresaB.id }, reservaA);

    // 404 y no 403: no confirmamos siquiera que esa reserva exista.
    expect(status).toBe(404);
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id: reservaA } })).estado).toBe("CONFIRMADA");
  });

  it("la respuesta a un id ajeno es idéntica a la de un id inexistente", async () => {
    const ajeno = await api.cancelarReserva({ empresaId: e.empresaB.id }, reservaA);
    const inexistente = await api.cancelarReserva(
      { empresaId: e.empresaB.id },
      "00000000-0000-4000-8000-000000000000",
    );
    expect(ajeno).toEqual(inexistente);
  });

  it("en la disponibilidad, una empresa ve que la franja está ocupada pero no de quién ni el detalle", async () => {
    const { cuerpo } = await api.disponibilidad({ empresaId: e.empresaB.id }, fecha);
    const ocupado = cuerpo.salas.find((s: { id: string }) => s.id === e.salaChica.id).ocupado;

    expect(ocupado).toEqual([
      { ...franja(fecha, "10:00", "11:00"), propia: false },
      {
        ...franja(fecha, "12:00", "13:00"),
        propia: true,
        reservaId: reservaB,
        empresa: { id: e.empresaB.id, nombre: e.empresaB.nombre },
      },
    ]);
    expect(JSON.stringify(cuerpo)).not.toContain(e.empresaA.id);
  });

  it("el administrador ve las reservas de todas las empresas", async () => {
    const { cuerpo } = await api.listarReservas("admin");
    expect(cuerpo.reservas.map((r: { id: string }) => r.id).sort()).toEqual([reservaA, reservaB].sort());
  });

  it("el administrador ve en la disponibilidad a qué empresa pertenece cada franja", async () => {
    const { cuerpo } = await api.disponibilidad("admin", fecha);
    const ocupado = cuerpo.salas.find((s: { id: string }) => s.id === e.salaChica.id).ocupado;
    expect(ocupado.map((o: { empresa: { id: string } }) => o.empresa.id)).toEqual([e.empresaA.id, e.empresaB.id]);
  });
});
