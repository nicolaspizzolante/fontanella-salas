"use client";

import type { Reserva } from "../api";
import { capitalizar, fechaDe, fechaLarga, rangoHorario } from "../formato";

export type AvisoEstado = { tipo: "exito"; reserva: Reserva } | { tipo: "error"; mensaje: string } | { tipo: "info"; mensaje: string };

/** Resultado de una operación, visible y anunciado a lectores de pantalla. */
export function Aviso({ aviso, onCerrar }: { aviso: AvisoEstado; onCerrar?: () => void }) {
  const estilos = {
    exito: "bg-exito-suelo text-exito",
    error: "bg-error-suelo text-error",
    info: "bg-superficie-2 text-tinta-2",
  }[aviso.tipo];

  return (
    <div role={aviso.tipo === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-4 rounded-md px-4 py-3 ${estilos}`}>
      <p className="text-[15px]">
        {aviso.tipo === "exito" ? (
          <>
            <span className="font-semibold">Reserva confirmada.</span> {aviso.reserva.sala.nombre},{" "}
            {fechaLarga(fechaDe(aviso.reserva.inicio))} de {rangoHorario(aviso.reserva.inicio, aviso.reserva.fin)}.
          </>
        ) : (
          capitalizar(aviso.mensaje)
        )}
      </p>
      {onCerrar && (
        <button type="button" onClick={onCerrar} className="shrink-0 text-sm font-medium underline-offset-4 hover:underline" aria-label="Cerrar aviso">
          Cerrar
        </button>
      )}
    </div>
  );
}
