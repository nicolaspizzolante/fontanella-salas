"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorApi, pedirApi, type Reserva } from "../api";
import { NombreSala } from "../componentes/insignia-sala";
import { useApp } from "../contexto";
import { capitalizar, fechaCorta, fechaDe, hoy, rangoHorario, sumarDias } from "../formato";

type Pestana = "proximas" | "pasadas" | "canceladas";

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: "proximas", etiqueta: "Próximas" },
  { id: "pasadas", etiqueta: "Pasadas" },
  { id: "canceladas", etiqueta: "Canceladas" },
];

const DIAS_HISTORIAL = 60;

function consultaDe(pestana: Pestana) {
  const desdeHistorial = sumarDias(hoy(), -DIAS_HISTORIAL);
  if (pestana === "proximas") return "?estado=CONFIRMADA";
  if (pestana === "pasadas") return `?estado=CONFIRMADA&desde=${desdeHistorial}&hasta=${hoy()}`;
  return `?estado=CANCELADA&desde=${desdeHistorial}`;
}

export function VistaReservas() {
  const { actor } = useApp();
  const esAdmin = actor?.tipo === "admin";
  const [pestana, setPestana] = useState<Pestana>("proximas");
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  // Referencia de "ahora" fijada en cada carga, para clasificar próximas, en curso y pasadas.
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    setReservas(null);
    setError(null);
    try {
      const { reservas } = await pedirApi<{ reservas: Reserva[] }>(actor, `/api/reservas${consultaDe(pestana)}`);
      setReservas(reservas);
      setAhora(Date.now());
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No pudimos cargar las reservas.");
    }
  }, [actor, pestana]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    if (!reservas) return null;
    let lista = reservas;
    if (pestana === "proximas") lista = lista.filter((r) => new Date(r.fin).getTime() > ahora);
    if (pestana === "pasadas") lista = lista.filter((r) => new Date(r.fin).getTime() <= ahora).reverse();
    if (pestana === "canceladas")
      lista = [...lista].sort((a, b) => (b.canceladaEn ?? "").localeCompare(a.canceladaEn ?? ""));
    if (filtroEmpresa) lista = lista.filter((r) => r.empresa.id === filtroEmpresa);
    return lista;
  }, [reservas, pestana, filtroEmpresa, ahora]);

  const empresas = useMemo(() => {
    const mapa = new Map((reservas ?? []).map((r) => [r.empresa.id, r.empresa.nombre]));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reservas]);

  async function cancelar(reserva: Reserva) {
    try {
      const { reserva: actualizada } = await pedirApi<{ reserva: Reserva }>(actor, `/api/reservas/${reserva.id}/cancelar`, {
        method: "POST",
      });
      setReservas((lista) => lista?.filter((r) => r.id !== actualizada.id) ?? null);
      setMensaje({
        tipo: "exito",
        texto: `Cancelaste la reserva de ${actualizada.sala.nombre} del ${fechaCorta(fechaDe(actualizada.inicio))} de ${rangoHorario(actualizada.inicio, actualizada.fin)}. La franja ya está disponible para otros clientes.`,
      });
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof ErrorApi ? e.message : "No pudimos cancelar la reserva." });
      await cargar();
    }
  }

  return (
    <div>
      <h1 className="titulo-cartel text-[40px]">{esAdmin ? "Reservas" : "Mis reservas"}</h1>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={pestana}
          onValueChange={(v) => {
            setPestana(v as Pestana);
            setMensaje(null);
          }}
        >
          <TabsList aria-label="Estado de las reservas" className="h-10 border border-borde bg-superficie p-1">
            {PESTANAS.map((p) => (
              <TabsTrigger
                key={p.id}
                value={p.id}
                className="px-3.5 text-sm data-[state=active]:bg-banda data-[state=active]:text-banda-tinta data-[state=active]:shadow-none"
              >
                {p.etiqueta}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {esAdmin && empresas.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-tinta-2">
            <Label htmlFor="filtro-empresa" className="font-normal text-tinta-2">
              Empresa
            </Label>
            <Select value={filtroEmpresa || "todas"} onValueChange={(v) => setFiltroEmpresa(v === "todas" ? "" : v)}>
              <SelectTrigger id="filtro-empresa" className="h-10 w-[13rem] data-[size=default]:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                <SelectItem value="todas">Todas</SelectItem>
                {empresas.map(([id, nombre]) => (
                  <SelectItem key={id} value={id}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {mensaje && (
        <Alert
          role={mensaje.tipo === "error" ? "alert" : "status"}
          className={`mt-4 border-transparent px-4 py-3 ${mensaje.tipo === "exito" ? "bg-exito-suelo text-exito" : "bg-error-suelo text-error"}`}
        >
          <AlertDescription className="text-[15px] text-current">{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      <div className="canto mt-4">
        {error ? (
          <Alert variant="destructive" className="my-4 border-transparent bg-error-suelo">
            <AlertDescription className="text-current">{error}</AlertDescription>
            <Button variant="link" size="sm" onClick={cargar} className="mt-1 h-auto justify-start p-0 text-current">
              Reintentar
            </Button>
          </Alert>
        ) : !visibles ? (
          <TablaEsqueleto />
        ) : visibles.length === 0 ? (
          <Vacio pestana={pestana} esAdmin={esAdmin} />
        ) : (
          <TablaReservas reservas={visibles} pestana={pestana} esAdmin={esAdmin} ahora={ahora} onCancelar={cancelar} />
        )}
      </div>
      {pestana !== "proximas" && (
        <p className="mt-3 text-sm text-tinta-3">Se muestran los últimos {DIAS_HISTORIAL} días.</p>
      )}
    </div>
  );
}

function TablaReservas({
  reservas,
  pestana,
  esAdmin,
  ahora,
  onCancelar,
}: {
  reservas: Reserva[];
  pestana: Pestana;
  esAdmin: boolean;
  ahora: number;
  onCancelar: (r: Reserva) => Promise<void>;
}) {
  const th = "voz-cartel h-10 px-3 text-xs text-tinta-3 first:pl-0";
  return (
    <Table className="min-w-[720px] text-[15px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={th}>Día</TableHead>
          <TableHead className={th}>Horario</TableHead>
          <TableHead className={th}>Sala</TableHead>
          {esAdmin && <TableHead className={th}>Empresa</TableHead>}
          <TableHead className={`${th} text-right`}>Asistentes</TableHead>
          <TableHead className={th}>Motivo</TableHead>
          <TableHead className={th}>
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reservas.map((r, i) => {
          const fecha = fechaDe(r.inicio);
          const mismaFecha = i > 0 && fechaDe(reservas[i - 1].inicio) === fecha;
          return <FilaReserva key={r.id} reserva={r} mostrarFecha={!mismaFecha} pestana={pestana} esAdmin={esAdmin} ahora={ahora} onCancelar={onCancelar} />;
        })}
      </TableBody>
    </Table>
  );
}

function FilaReserva({
  reserva: r,
  mostrarFecha,
  pestana,
  esAdmin,
  ahora,
  onCancelar,
}: {
  reserva: Reserva;
  mostrarFecha: boolean;
  pestana: Pestana;
  esAdmin: boolean;
  ahora: number;
  onCancelar: (r: Reserva) => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fecha = fechaDe(r.inicio);
  const empezo = new Date(r.inicio).getTime() <= ahora;
  const td = "px-3 py-3 first:pl-0";

  return (
    <TableRow className={mostrarFecha ? "border-t border-t-borde-fuerte first:border-t-0" : ""}>
      <TableCell className={`${td} titulo-cartel whitespace-nowrap text-lg`}>
        {mostrarFecha ? (fecha === hoy() ? "Hoy" : capitalizar(fechaCorta(fecha))) : ""}
      </TableCell>
      <TableCell className={`${td} numeros`}>{rangoHorario(r.inicio, r.fin)}</TableCell>
      <TableCell className={td}>
        <NombreSala salaId={r.sala.id} nombre={r.sala.nombre} />
      </TableCell>
      {esAdmin && <TableCell className={td}>{r.empresa.nombre}</TableCell>}
      <TableCell className={`${td} numeros text-right`}>{r.asistentes}</TableCell>
      <TableCell className={`${td} max-w-[16rem] truncate text-tinta-2`} title={r.motivo ?? undefined}>
        {r.motivo ?? <span className="text-tinta-3">—</span>}
      </TableCell>
      <TableCell className={`${td} text-right`}>
        {pestana === "canceladas" ? (
          <span className="text-sm text-tinta-3">
            Cancelada {r.canceladaEn && `el ${fechaCorta(fechaDe(r.canceladaEn))}`}
            {r.origenCancelacion === "ADMIN" && " por la administración"}
          </span>
        ) : pestana === "proximas" && empezo ? (
          <Badge className="rounded-sm bg-aviso-suelo font-semibold text-aviso">En curso</Badge>
        ) : pestana === "proximas" && !confirmando ? (
          <Button
            variant="ghost"
            onClick={() => setConfirmando(true)}
            aria-label={`Cancelar la reserva de ${r.sala.nombre} del ${fechaCorta(fecha)} de ${rangoHorario(r.inicio, r.fin)}`}
            className="text-error hover:bg-error-suelo hover:text-error"
          >
            Cancelar
          </Button>
        ) : pestana === "proximas" ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-sm text-tinta-2">¿Cancelar{esAdmin ? ` la reserva de ${r.empresa.nombre}` : ""}?</span>
            <Button
              disabled={enviando}
              onClick={async () => {
                setEnviando(true);
                await onCancelar(r);
                setEnviando(false);
                setConfirmando(false);
              }}
              className="bg-error font-semibold text-white hover:bg-error/90"
            >
              {enviando ? "Cancelando…" : "Sí, cancelar"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmando(false)} className="text-tinta-2">
              No
            </Button>
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function Vacio({ pestana, esAdmin }: { pestana: Pestana; esAdmin: boolean }) {
  const textos: Record<Pestana, string> = {
    proximas: esAdmin ? "No hay reservas próximas." : "No tenés reservas próximas.",
    pasadas: "No hay reservas en los últimos 60 días.",
    canceladas: "No hay reservas canceladas en los últimos 60 días.",
  };
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-tinta-2">{textos[pestana]}</p>
      {pestana === "proximas" && !esAdmin && (
        <Button asChild size="lg" className="mt-4 font-semibold hover:bg-banda-2">
          <Link href="/disponibilidad">Ver disponibilidad y reservar</Link>
        </Button>
      )}
    </div>
  );
}

function TablaEsqueleto() {
  return (
    <div className="divide-y divide-borde">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-6 py-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}
