"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorApi, pedirApi, type Disponibilidad, type Reserva } from "../api";
import { Aviso, type AvisoEstado } from "../componentes/aviso";
import { SelectorFecha } from "../componentes/selector-fecha";
import { useApp } from "../contexto";
import { capitalizar, diaSemana, fechaLarga, hoy, instanteIso, minutosLocales, sumarDias } from "../formato";
import { LineaSala, type Seleccion } from "./linea-sala";
import { PanelReserva } from "./panel-reserva";
import { ANCHO_ETIQUETA, BLOQUES, CIERRE, minutoDeBloque } from "./reglas";

const esFinDeSemana = (fecha: string) => [0, 6].includes(diaSemana(fecha));

function proximoDiaHabil(fecha: string, paso: 1 | -1) {
  let f = sumarDias(fecha, paso);
  while (esFinDeSemana(f)) f = sumarDias(f, paso);
  return f;
}

/** Hoy si todavía se puede reservar algo; si no, el próximo día hábil. */
function fechaInicial() {
  const f = hoy();
  if (esFinDeSemana(f) || minutosLocales(new Date()) >= CIERRE - 30) return proximoDiaHabil(f, 1);
  return f;
}

export function VistaDisponibilidad() {
  const { actor } = useApp();
  const [fecha, setFecha] = useState(fechaInicial);
  const [datos, setDatos] = useState<Disponibilidad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [aviso, setAviso] = useState<AvisoEstado | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const respuesta = await pedirApi<Disponibilidad>(actor, `/api/disponibilidad?fecha=${fecha}`);
        setDatos(respuesta);
        setErrorCarga(null);
      } catch (error) {
        setErrorCarga(error instanceof ErrorApi ? error.message : "No pudimos cargar la disponibilidad.");
      } finally {
        setCargando(false);
      }
    },
    [actor, fecha],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  // La línea de "ahora" y las franjas pasadas se actualizan solas.
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const cambiarFecha = (nueva: string) => {
    setFecha(nueva);
    setSeleccion(null);
    setAviso(null);
  };

  const esHoy = fecha === hoy();
  const cerrado = esFinDeSemana(fecha);
  /** Primer bloque reservable: en el día de hoy, los ya empezados quedan deshabilitados. */
  const primerBloqueLibre = useMemo(() => {
    if (fecha < hoy()) return BLOQUES;
    if (!esHoy) return 0;
    const minutos = minutosLocales(ahora);
    let b = 0;
    while (b < BLOQUES && minutoDeBloque(b) <= minutos) b++;
    return b;
  }, [ahora, esHoy, fecha]);

  const salaSeleccionada = datos?.salas.find((s) => s.id === seleccion?.salaId) ?? null;
  const puedeReservar = actor?.tipo === "empresa" && !cerrado;

  async function confirmar(asistentes: number, motivo: string) {
    if (!seleccion || !salaSeleccionada) return;
    const desde = Math.min(seleccion.ancla, seleccion.extremo);
    const hasta = Math.max(seleccion.ancla, seleccion.extremo) + 1;
    try {
      const { reserva } = await pedirApi<{ reserva: Reserva }>(actor, "/api/reservas", {
        method: "POST",
        body: JSON.stringify({
          salaId: salaSeleccionada.id,
          inicio: instanteIso(fecha, minutoDeBloque(desde)),
          fin: instanteIso(fecha, minutoDeBloque(hasta)),
          asistentes,
          ...(motivo.trim() && { motivo: motivo.trim() }),
        }),
      });
      setSeleccion(null);
      setAviso({ tipo: "exito", reserva });
      await cargar(true);
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === "SALA_OCUPADA") {
        // Alguien la tomó mientras elegíamos: mostramos la ocupación actualizada.
        setSeleccion(null);
        setAviso({ tipo: "error", mensaje: error.message });
        await cargar(true);
        return;
      }
      throw error;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <h1 className="titulo-cartel text-[40px]">Disponibilidad</h1>
        <NavegadorFecha fecha={fecha} onCambiar={cambiarFecha} />
      </div>

      {aviso && (
        <div className="mt-5">
          <Aviso aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="mt-8 grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-label={`Salas el ${fechaLarga(fecha)}`} className="canto min-w-0">
          {errorCarga ? (
            <Alert variant="destructive" className="my-4 border-transparent bg-error-suelo">
              <AlertDescription className="text-current">{errorCarga}</AlertDescription>
              <Button variant="link" size="sm" onClick={() => cargar()} className="mt-1 h-auto justify-start p-0 text-current">
                Reintentar
              </Button>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[660px]">
                <EscalaHoras />
                {cerrado && (
                  <p className="border-b border-borde bg-superficie-2 px-3 py-3 text-sm text-tinta-2">
                    {capitalizar(fechaLarga(fecha))}: las salas no abren los fines de semana.
                  </p>
                )}
                {cargando && !datos
                  ? Array.from({ length: 3 }, (_, i) => <FilaEsqueleto key={i} />)
                  : datos?.salas.map((sala) => (
                      <LineaSala
                        key={sala.id}
                        sala={sala}
                        fecha={fecha}
                        esAdmin={actor?.tipo === "admin"}
                        interactiva={puedeReservar}
                        primerBloqueLibre={cerrado ? BLOQUES : primerBloqueLibre}
                        seleccion={seleccion?.salaId === sala.id ? seleccion : null}
                        onSeleccionar={(s) => {
                          setSeleccion(s);
                          setAviso(null);
                        }}
                        minutoAhora={esHoy ? minutosLocales(ahora) : null}
                      />
                    ))}
                {datos && datos.salas.length === 0 && (
                  <p className="px-4 py-8 text-center text-tinta-2">Todavía no hay salas cargadas.</p>
                )}
              </div>
            </div>
          )}
          <Leyenda esAdmin={actor?.tipo === "admin"} />
        </section>

        <PanelReserva
          key={seleccion ? `${seleccion.salaId}` : "vacio"}
          fecha={fecha}
          sala={salaSeleccionada}
          seleccion={seleccion}
          esAdmin={actor?.tipo === "admin"}
          cerrado={cerrado}
          onDescartar={() => setSeleccion(null)}
          onConfirmar={confirmar}
        />
      </div>
    </div>
  );
}

function NavegadorFecha({ fecha, onCambiar }: { fecha: string; onCambiar: (f: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon-lg" onClick={() => onCambiar(proximoDiaHabil(fecha, -1))} aria-label="Día hábil anterior">
        <ChevronLeftIcon />
      </Button>
      <SelectorFecha fecha={fecha} onCambiar={onCambiar} soloHabiles />
      <Button variant="outline" size="icon-lg" onClick={() => onCambiar(proximoDiaHabil(fecha, 1))} aria-label="Día hábil siguiente">
        <ChevronRightIcon />
      </Button>
      {fecha !== hoy() && (
        <Button variant="link" onClick={() => onCambiar(hoy())} className="text-tinta-2">
          Ir a hoy
        </Button>
      )}
    </div>
  );
}

function EscalaHoras() {
  return (
    <div className="grid border-b border-borde" style={{ gridTemplateColumns: `${ANCHO_ETIQUETA} 1fr` }}>
      <div className="voz-cartel py-2.5 text-xs text-tinta-3">Sala</div>
      <div className="relative ml-3 mr-5 h-9">
        {Array.from({ length: 13 }, (_, i) => (
          <span
            key={i}
            className="numeros absolute top-2.5 -translate-x-1/2 text-xs text-tinta-3"
            style={{ left: `${(i / 12) * 100}%` }}
          >
            {String(8 + i).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilaEsqueleto() {
  return (
    <div className="grid h-[88px] items-center border-b border-borde" style={{ gridTemplateColumns: `${ANCHO_ETIQUETA} 1fr` }}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="ml-3 mr-5 h-1" />
    </div>
  );
}

function Leyenda({ esAdmin }: { esAdmin: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-sm text-tinta-2">
      {!esAdmin && (
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-7 rounded-full bg-tinta" /> Tu reserva, en el color de la sala
        </span>
      )}
      <span className="inline-flex items-center gap-2">
        <span className="trama-ocupado h-2.5 w-7 rounded-full" /> {esAdmin ? "Reservada" : "Ocupada por otra empresa"}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="relative h-2.5 w-7">
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-tinta opacity-40" />
        </span>
        Libre
      </span>
    </div>
  );
}
