/** Cancelar reservas: liberar la franja, conservar historial y reglas de tiempo. */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { api } from "./helpers/api";
import { crearEscenario, diaHabil, franja } from "./helpers/escenario";

let e: Awaited<ReturnType<typeof crearEscenario>>;
const fecha = diaHabil(2);

beforeEach(async () => {
  e = await crearEscenario();
});

async function reservaDeA(desde = "10:00", hasta = "11:00") {
  const { cuerpo } = await api.crearReserva(
    { empresaId: e.empresaA.id },
    { salaId: e.salaChica.id, asistentes: 2, ...franja(fecha, desde, hasta) },
  );
  return cuerpo.reserva.id as string;
}

describe("cancelar reserva", () => {
  it("cancela la reserva sin borrarla: queda el estado, la fecha y quién canceló", async () => {
    const id = await reservaDeA();

    const { status, cuerpo } = await api.cancelarReserva({ empresaId: e.empresaA.id }, id);

    expect(status).toBe(200);
    expect(cuerpo.reserva).toMatchObject({ estado: "CANCELADA", origenCancelacion: "EMPRESA" });
    expect(cuerpo.reserva.canceladaEn).not.toBeNull();
    expect(await prisma.reserva.count()).toBe(1);
  });

  it("al cancelar, la franja vuelve a estar disponible para cualquier empresa", async () => {
    const id = await reservaDeA();
    const intento = () =>
      api.crearReserva(
        { empresaId: e.empresaB.id },
        { salaId: e.salaChica.id, asistentes: 2, ...franja(fecha, "10:00", "11:00") },
      );

    expect((await intento()).status).toBe(409);
    await api.cancelarReserva({ empresaId: e.empresaA.id }, id);
    expect((await intento()).status).toBe(201);
  });

  it("la disponibilidad deja de mostrar la franja cancelada", async () => {
    const id = await reservaDeA();
    await api.cancelarReserva({ empresaId: e.empresaA.id }, id);

    const { cuerpo } = await api.disponibilidad({ empresaId: e.empresaB.id }, fecha);
    const salaChica = cuerpo.salas.find((s: { id: string }) => s.id === e.salaChica.id);
    expect(salaChica.ocupado).toEqual([]);
  });

  it("no permite cancelar dos veces", async () => {
    const id = await reservaDeA();
    await api.cancelarReserva({ empresaId: e.empresaA.id }, id);

    const { status, cuerpo } = await api.cancelarReserva({ empresaId: e.empresaA.id }, id);
    expect(status).toBe(409);
    expect(cuerpo.error.codigo).toBe("YA_CANCELADA");
  });

  it("no permite cancelar una reserva que ya empezó", async () => {
    const enCurso = await prisma.reserva.create({
      data: {
        salaId: e.salaChica.id,
        empresaId: e.empresaA.id,
        inicio: new Date(Date.now() - 30 * 60_000),
        fin: new Date(Date.now() + 30 * 60_000),
        asistentes: 2,
      },
    });

    const { status, cuerpo } = await api.cancelarReserva({ empresaId: e.empresaA.id }, enCurso.id);
    expect(status).toBe(422);
    expect(cuerpo.error.codigo).toBe("RESERVA_INICIADA");
  });

  it("el administrador puede cancelar cualquier reserva y queda registrado", async () => {
    const id = await reservaDeA();
    const { status, cuerpo } = await api.cancelarReserva("admin", id);
    expect(status).toBe(200);
    expect(cuerpo.reserva.origenCancelacion).toBe("ADMIN");
  });

  it("responde 400 si el id no es un identificador válido", async () => {
    expect((await api.cancelarReserva({ empresaId: e.empresaA.id }, "no-es-un-id")).status).toBe(400);
  });
});
