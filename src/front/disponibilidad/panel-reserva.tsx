"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorApi, type DetalleError, type Disponibilidad } from "../api";
import { NombreSala } from "../componentes/insignia-sala";
import { capitalizar, duracionTexto, fechaLarga, textoHora } from "../formato";
import type { Seleccion } from "./linea-sala";
import { BLOQUE, minutoDeBloque } from "./reglas";

type Props = {
  fecha: string;
  sala: Disponibilidad["salas"][number] | null;
  seleccion: Seleccion | null;
  esAdmin: boolean;
  cerrado: boolean;
  onDescartar: () => void;
  onConfirmar: (asistentes: number, motivo: string) => Promise<void>;
};

/** Panel lateral (no modal): resume la franja elegida y confirma la reserva. */
export function PanelReserva({ fecha, sala, seleccion, esAdmin, cerrado, onDescartar, onConfirmar }: Props) {
  const [asistentes, setAsistentes] = useState(() => (sala ? Math.min(2, sala.capacidad) : 2));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ mensaje: string; detalles: DetalleError[] } | null>(null);

  if (esAdmin || cerrado || !sala || !seleccion) {
    return (
      <aside className="border-t border-borde pt-4 lg:sticky lg:top-6">
        <h2 className="titulo text-xl">{esAdmin ? "Vista de administración" : "Reservar una sala"}</h2>
        {esAdmin ? (
          <p className="mt-2 text-[15px] text-tinta-2">
            Ves todas las reservas y de qué empresa es cada una. Las reservas las hacen las empresas clientes; podés
            cancelarlas desde la sección Reservas.
          </p>
        ) : cerrado ? (
          <p className="mt-2 text-[15px] text-tinta-2">Elegí un día de lunes a viernes para ver franjas libres.</p>
        ) : (
          <p className="mt-2 text-[15px] text-tinta-2">
            Sobre la línea de una sala, tocá la hora en que empieza la reunión y después la hora en que termina
          </p>
        )}
        {!esAdmin && !cerrado && (
          <p className="mt-3 text-sm text-tinta-3">
            De lunes a viernes, de 8 a 20 h, en bloques de 30 minutos y hasta 8 horas por reserva
          </p>
        )}
      </aside>
    );
  }

  const desde = Math.min(seleccion.ancla, seleccion.extremo);
  const hasta = Math.max(seleccion.ancla, seleccion.extremo) + 1;
  const minutos = (hasta - desde) * BLOQUE;
  const excedeCapacidad = asistentes > sala.capacidad;
  const asistentesInvalidos = !Number.isInteger(asistentes) || asistentes < 1;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (excedeCapacidad || asistentesInvalidos) return;
    setEnviando(true);
    setError(null);
    try {
      await onConfirmar(asistentes, motivo);
    } catch (e) {
      setError({
        mensaje: e instanceof ErrorApi ? e.message : "No pudimos confirmar la reserva. Intentá de nuevo.",
        detalles: e instanceof ErrorApi && Array.isArray(e.detalles) ? (e.detalles as DetalleError[]) : [],
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <aside
      className="pt-4 lg:sticky lg:top-6"
      aria-label="Nueva reserva"
    >
      <form onSubmit={enviar}>
        <h2 className="titulo text-xl">Nueva reserva</h2>
        <div className="mt-3">
          <NombreSala salaId={sala.id} nombre={sala.nombre} />
          <p className="mt-1 text-sm text-tinta-3">
            {sala.sede.nombre} · hasta {sala.capacidad} personas
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
          <dt className="text-tinta-3">Día</dt>
          <dd>{capitalizar(fechaLarga(fecha))}</dd>
          <dt className="text-tinta-3">Horario</dt>
          <dd className="numeros font-semibold">
            {textoHora(minutoDeBloque(desde))} a {textoHora(minutoDeBloque(hasta))}
          </dd>
          <dt className="text-tinta-3">Duración</dt>
          <dd className="numeros">{duracionTexto(minutos)}</dd>
        </dl>
        {!seleccion.completa && (
          <p className="mt-2 text-sm text-tinta-3">Tocá otra hora de la misma sala para extender la reserva</p>
        )}

        <div className="mt-5 grid gap-1.5">
          <Label htmlFor="asistentes">Asistentes</Label>
          <Input
            id="asistentes"
            type="number"
            inputMode="numeric"
            min={1}
            max={sala.capacidad}
            value={Number.isNaN(asistentes) ? "" : asistentes}
            onChange={(e) => setAsistentes(e.target.valueAsNumber)}
            aria-invalid={excedeCapacidad || asistentesInvalidos}
            aria-describedby="ayuda-asistentes"
            className="numeros h-10 text-base"
          />
          <span id="ayuda-asistentes" className={`text-sm ${excedeCapacidad ? "text-error" : "text-tinta-3"}`}>
            {excedeCapacidad
              ? `Esta sala admite hasta ${sala.capacidad} personas`
              : asistentesInvalidos
                ? "Indicá al menos una persona"
                : `Máximo ${sala.capacidad}`}
          </span>
        </div>

        <div className="mt-4 grid gap-1.5">
          <Label htmlFor="motivo">
            Motivo <span className="font-normal text-tinta-3">(opcional)</span>
          </Label>
          <Input
            id="motivo"
            type="text"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: Reunión con cliente"
            className="h-10 text-base"
          />
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4 border-transparent bg-error-suelo">
            <AlertTitle>{error.mensaje}</AlertTitle>
            {error.detalles.length > 0 && (
              <AlertDescription className="text-current">
                <ul className="list-disc space-y-0.5 pl-4">
                  {error.detalles.map((d, i) => (
                    <li key={i}>{d.mensaje}</li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button type="submit" size="lg" disabled={enviando || excedeCapacidad || asistentesInvalidos} className="h-10 flex-1 text-[15px] font-semibold hover:bg-banda-2">
            {enviando ? "Confirmando…" : "Confirmar reserva"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onDescartar} className="h-10 text-tinta-2">
            Descartar
          </Button>
        </div>
      </form>
    </aside>
  );
}
