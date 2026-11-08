"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { pedirApi, type Actor, type Empresa } from "../api";
import { ArrowRightIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ThemeProvider, useTheme } from "next-themes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProveedorApp, useApp } from "../contexto";

export function Marco({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ProveedorApp>
        <TooltipProvider delayDuration={150}>
          <Contenido>{children}</Contenido>
        </TooltipProvider>
      </ProveedorApp>
    </ThemeProvider>
  );
}

const SECCIONES = {
  empresa: [
    { href: "/disponibilidad", etiqueta: "Disponibilidad" },
    { href: "/reservas", etiqueta: "Mis reservas" },
  ],
  admin: [
    { href: "/metricas", etiqueta: "Métricas" },
    { href: "/disponibilidad", etiqueta: "Disponibilidad" },
    { href: "/reservas", etiqueta: "Reservas" },
  ],
} as const;

export const inicioDe = (actor: Actor) => (actor.tipo === "admin" ? "/metricas" : "/disponibilidad");

function Contenido({ children }: { children: ReactNode }) {
  const { actor, listo } = useApp();

  return (
    <div className="flex min-h-screen flex-col">
      <BandaSuperior />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
        {!listo ? null : actor ? children : <Entrada />}
      </main>
    </div>
  );
}

/** Encabezado: marca, secciones, identidad y tema, sobre la superficie de la página. */
function BandaSuperior() {
  const { actor, listo } = useApp();
  const ruta = usePathname();
  return (
    <header className="border-b border-borde bg-suelo">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 sm:px-6">
        <Link href="/" className="flex h-14 items-center gap-2" aria-label="Salas, inicio">
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-full bg-tinta text-[13px] font-semibold text-suelo"
          >
            S
          </span>
          <span className="text-[17px] font-semibold tracking-tight">Salas</span>
        </Link>
        {listo && actor && (
          <nav aria-label="Secciones" className="order-last -mx-3 w-full sm:order-none sm:mx-0 sm:w-auto">
            <ul className="flex gap-1">
              {SECCIONES[actor.tipo].map((s) => {
                const activa = ruta === s.href;
                return (
                  <li key={s.href}>
                    <Button
                      asChild
                      variant="ghost"
                      className={`relative h-12 rounded-md px-3 text-[15px] font-normal sm:h-9 ${
                        activa ? "text-tinta" : "text-tinta-2 hover:text-tinta"
                      }`}
                    >
                      <Link href={s.href} aria-current={activa ? "page" : undefined}>
                        {s.etiqueta}
                        {activa && <span className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-tinta max-sm:bottom-0" />}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2">
          {listo && actor && <SelectorIdentidad />}
          <SelectorTema />
        </div>
      </div>
    </header>
  );
}

function SelectorTema() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="Tema de la interfaz" className="text-tinta-2">
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon /> Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> Oscuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> Según el sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function useEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    pedirApi<{ empresas: Empresa[] }>(null, "/api/empresas")
      .then((r) => setEmpresas(r.empresas))
      .catch(() => setError(true));
  }, []);
  return { empresas, error };
}

function SelectorIdentidad() {
  const { actor, elegirActor } = useApp();
  const { empresas } = useEmpresas();
  const router = useRouter();
  const valor = actor?.tipo === "admin" ? "admin" : (actor?.empresaId ?? "");

  return (
    <div className="flex items-center gap-2 text-sm">
      <span id="etiqueta-identidad" className="hidden text-tinta-3 md:inline">
        Usando como
      </span>
      <Select
        value={valor}
        onValueChange={(id) => {
          const nuevo: Actor =
            id === "admin"
              ? { tipo: "admin" }
              : { tipo: "empresa", empresaId: id, nombre: empresas?.find((e) => e.id === id)?.nombre ?? "" };
          elegirActor(nuevo);
          router.push(inicioDe(nuevo));
        }}
      >
        <SelectTrigger
          aria-labelledby="etiqueta-identidad"
          className="h-9 w-[13rem] bg-superficie data-[size=default]:h-9"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" position="popper">
          <SelectGroup>
            <SelectLabel>Empresas clientes</SelectLabel>
            {actor?.tipo === "empresa" && !empresas && <SelectItem value={actor.empresaId}>{actor.nombre}</SelectItem>}
            {empresas?.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nombre}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Empresa administradora</SelectLabel>
            <SelectItem value="admin">Administración</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Pantalla de entrada: en la v1 no hay login, se elige con qué identidad usar la app. */
function Entrada() {
  const { elegirActor } = useApp();
  const { empresas, error } = useEmpresas();
  const router = useRouter();
  const entrar = (actor: Actor) => {
    elegirActor(actor);
    router.push(inicioDe(actor));
  };

  return (
    <div className="mx-auto max-w-xl py-6 sm:py-12">
      <h1 className="titulo text-[32px]">¿Con qué cuenta querés entrar?</h1>
      <p className="mt-3 max-w-prose text-tinta-2">
        Esta versión no tiene inicio de sesión. Elegí una empresa cliente para reservar salas en su nombre, o la
        administración para ver la actividad de todas las instalaciones.
      </p>

      <h2 className="etiqueta mt-8 text-sm text-tinta-3">Empresas clientes</h2>
      {error && (
        <Alert variant="destructive" className="mt-3 border-transparent bg-error-suelo">
          <AlertDescription>No pudimos cargar las empresas. ¿Está levantada la base de datos?</AlertDescription>
        </Alert>
      )}
      <ul className="border-t border-borde mt-3 divide-y divide-borde">
        {!empresas && !error &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="py-2">
              <Skeleton className="h-9" />
            </li>
          ))}
        {empresas?.map((e) => (
          <li key={e.id}>
            <Button
              variant="ghost"
              onClick={() => entrar({ tipo: "empresa", empresaId: e.id, nombre: e.nombre })}
              className="h-auto w-full justify-between px-2 py-3.5 text-base font-normal"
            >
              {e.nombre}
              <ArrowRightIcon className="text-tinta-3" />
            </Button>
          </li>
        ))}
      </ul>

      <h2 className="etiqueta mt-8 text-sm text-tinta-3">Empresa administradora</h2>
      <Button
        onClick={() => entrar({ tipo: "admin" })}
        className="mt-3 h-auto w-full justify-between px-4 py-3.5 text-base"
      >
        Administración
        <ArrowRightIcon className="opacity-60" />
      </Button>
    </div>
  );
}
