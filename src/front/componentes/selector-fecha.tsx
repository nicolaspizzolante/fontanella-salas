"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { capitalizar, fechaCorta, fechaLarga } from "../formato";

/** El calendario trabaja con fechas del navegador; la app, con fechas locales AAAA-MM-DD. */
const aDate = (fecha: string) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d);
};
const aFecha = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sinDiaSemana = (fecha: string) => fechaCorta(fecha).replace(/^\S+\s/, "");

export function SelectorFecha({
  fecha,
  onCambiar,
  soloHabiles = false,
}: {
  fecha: string;
  onCambiar: (fecha: string) => void;
  soloHabiles?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="lg" className="min-w-[14.5rem] justify-start px-3 text-[15px]">
          <CalendarIcon className="text-tinta-3" />
          {capitalizar(fechaLarga(fecha))}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          selected={aDate(fecha)}
          defaultMonth={aDate(fecha)}
          disabled={soloHabiles ? { dayOfWeek: [0, 6] } : undefined}
          onSelect={(d) => {
            if (!d) return;
            onCambiar(aFecha(d));
            setAbierto(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function SelectorRangoFechas({
  desde,
  hasta,
  onCambiar,
}: {
  desde: string;
  hasta: string;
  onCambiar: (rango: { desde: string; hasta: string }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  // Al abrir se empieza un rango nuevo: el primer clic marca el inicio y el segundo, el fin.
  const [borrador, setBorrador] = useState<DateRange | undefined>();

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        setBorrador(undefined);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="lg" className="numeros justify-start px-3 text-[15px]">
          <CalendarIcon className="text-tinta-3" />
          {sinDiaSemana(desde)} al {sinDiaSemana(hasta)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          locale={es}
          numberOfMonths={2}
          defaultMonth={aDate(desde)}
          selected={borrador ?? { from: aDate(desde), to: aDate(hasta) }}
          onSelect={(_, dia) => {
            if (!borrador?.from) {
              setBorrador({ from: dia, to: undefined });
              return;
            }
            const [a, b] = borrador.from <= dia ? [borrador.from, dia] : [dia, borrador.from];
            onCambiar({ desde: aFecha(a), hasta: aFecha(b) });
            setAbierto(false);
            setBorrador(undefined);
          }}
        />
        <p className="border-t border-borde px-3 py-2 text-sm text-tinta-3">
          {borrador?.from ? "Elegí el último día" : "Elegí el primer día del período"}
        </p>
      </PopoverContent>
    </Popover>
  );
}
