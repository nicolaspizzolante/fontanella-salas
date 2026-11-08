"use client";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    <Alert role={aviso.tipo === "error" ? "alert" : "status"} className={`border-transparent px-4 py-3 ${estilos}`}>
      <AlertDescription className="text-[15px] text-current">
        {aviso.tipo === "exito" ? (
          <>
            <span className="font-semibold">Reserva confirmada.</span> {aviso.reserva.sala.nombre},{" "}
            {fechaLarga(fechaDe(aviso.reserva.inicio))} de {rangoHorario(aviso.reserva.inicio, aviso.reserva.fin)}.
          </>
        ) : (
          capitalizar(aviso.mensaje)
        )}
      </AlertDescription>
      {onCerrar && (
        <AlertAction>
          <Button variant="link" size="sm" onClick={onCerrar} className="text-current" aria-label="Cerrar aviso">
            Cerrar
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
