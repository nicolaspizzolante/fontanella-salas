# Salas Fontanella

Sistema web para reservar salas de reuniones compartidas entre varias empresas clientes. Cada empresa reserva y ve solo lo suyo; la empresa administradora del edificio ve todo y tiene un tablero de métricas de uso con oportunidades comerciales.

- **Front:** React 19 + TypeScript (Next.js 16, App Router), Tailwind 4 y componentes de shadcn/ui.
- **Back:** Node + TypeScript con route handlers de Next.js, Zod para validar y Prisma 7 como ORM.
- **Persistencia:** PostgreSQL 17. La regla "una sala no se reserva dos veces" vive en la base como _exclusion constraint_.
- **Tests:** 86 tests con Vitest contra una base Postgres real, incluidos tests de concurrencia.

---

## Cómo correrlo

### Con un solo comando (recomendado)

Requisito: Docker con Docker Compose.

```bash
docker compose up --build
```

Abrí <http://localhost:3000>. Al arrancar, el contenedor de la app aplica las migraciones y, **solo si la base está vacía**, carga datos de ejemplo. Las reservas se guardan en un volumen de Docker y sobreviven a reinicios (`docker compose down` las conserva; `docker compose down -v` borra todo).

### Para desarrollar

Requisitos: Node 24 y Docker.

```bash
cp .env.example .env
npm install
npm run db:up        # levanta solo Postgres en Docker
npx prisma migrate deploy
npm run db:seed      # datos de ejemplo (borra y vuelve a cargar)
npm run dev
```

### Tests

Necesitan Postgres levantado (`npm run db:up`). Usan una base separada, `salas_test`, que se crea sola la primera vez que arranca el contenedor de Postgres, así que nunca tocan los datos de ejemplo.

```bash
npm test
```

### Cómo probarlo

No hay login. Al entrar se elige **quién sos**: una de las cinco empresas clientes o la administración. Se puede cambiar en cualquier momento desde "Usando como", arriba a la derecha.

- **Como empresa:** en _Disponibilidad_ se elige el día y se reserva sobre la línea de cada sala, arrastrando con el mouse o con dos clics (inicio y fin). En _Mis reservas_ se ven y se cancelan las propias. Las franjas de otras empresas aparecen como "Ocupada", sin decir de quién.
- **Como administración:** se ven todas las reservas con su empresa, se puede cancelar cualquiera y se accede a _Métricas_.

Los datos de ejemplo cubren unas 10 semanas (8 hacia atrás y 2 hacia adelante de la fecha de arranque) con patrones pensados para que las métricas tengan algo que contar: mañanas muy pedidas, viernes a la tarde vacío, un auditorio subutilizado, una empresa que cancela mucho y tarde, y otra que dejó de reservar.

La API también se puede usar directo. La identidad va en un header:

```bash
# Disponibilidad de un día, como Pampa Software
curl -H "x-empresa-id: e3e00000-0000-4000-8000-000000000002" \
  "http://localhost:3000/api/disponibilidad?fecha=2026-11-10"

# Métricas de las últimas 4 semanas, como administración
curl -H "x-rol: admin" http://localhost:3000/api/metricas
```

---

## Arquitectura

Un solo proyecto Next.js con front y back, separado en capas que no se mezclan:

```
src/
  app/                 Páginas y route handlers (/api/*): solo traducen HTTP
  server/
    identidad.ts       Único lugar donde se resuelve quién hace el pedido
    http.ts            Manejo uniforme de errores y validación con Zod
    errores.ts         Errores de dominio, cada uno con su status y código
    config/reglas.ts   Reglas de negocio centralizadas (horario, bloques, límites)
    reservas/          Casos de uso de reservas y reglas de horario
    metricas/          Lectura (servicio.ts) y cálculo puro (calculo.ts)
  front/               Pantallas: disponibilidad, reservas, métricas
  components/ui/       Componentes de shadcn/ui
prisma/                Esquema, migración (con SQL propio) y datos de ejemplo
tests/                 Tests de integración y unitarios
```

El recorrido de un pedido es siempre el mismo: **route handler → `obtenerActor` → validación con Zod → servicio → Prisma → Postgres**. Los servicios reciben un `Actor` ya resuelto y no saben nada de HTTP; los route handlers no tienen lógica de negocio.

### API

| Método | Ruta | Quién | Qué hace |
| --- | --- | --- | --- |
| `GET` | `/api/disponibilidad?fecha=AAAA-MM-DD` | todos | Franjas ocupadas de cada sala ese día |
| `GET` | `/api/reservas?desde&hasta&estado&salaId` | todos | Las propias (empresa) o todas (admin) |
| `POST` | `/api/reservas` | empresa | Crea una reserva a nombre de quien la pide |
| `POST` | `/api/reservas/:id/cancelar` | empresa (las suyas), admin (todas) | Cancela sin borrar |
| `GET` | `/api/metricas?desde&hasta` | admin | Métricas y oportunidades comerciales |
| `GET` | `/api/salas`, `/api/empresas` | todos | Catálogos |

Los errores tienen siempre la misma forma, con un código estable que el front usa para elegir el mensaje: `{ "error": { "codigo": "SALA_OCUPADA", "mensaje": "...", "detalles": ... } }`. Los status son 400 (datos mal formados), 401 (sin identificar), 403 (sin permiso), 404, 409 (sala ocupada o ya cancelada), 422 (regla de negocio) y 503 (demasiada contención, reintentar). Un error inesperado responde 500 genérico, sin exponer SQL ni detalles internos.

---

## Decisiones importantes

### Que nunca haya dos reservas superpuestas

Es el requisito central, así que la garantía está en la base de datos y no solo en el código:

```sql
ALTER TABLE reservas ADD CONSTRAINT reservas_sin_superposicion
  EXCLUDE USING gist (sala_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
  WHERE (estado = 'CONFIRMADA');
```

Postgres rechaza de forma atómica cualquier reserva confirmada que se pise con otra en la misma sala, aunque lleguen dos pedidos en el mismo milisegundo o alguien escriba en la base sin pasar por la API. Los intervalos son semiabiertos `[inicio, fin)`: una reserva de 10 a 11 y otra de 11 a 12 no chocan. Las canceladas quedan fuera de la regla, por eso cancelar libera la franja.

"Verificar disponibilidad y después insertar" no alcanza: entre la consulta y el insert otro pedido puede ganar la franja. Por eso no hay consulta previa; se intenta insertar y, si la constraint lo rechaza, se responde 409 con las franjas que chocan (sin decir de qué empresa son).

**Problema encontrado con los tests:** con muchos pedidos _parcialmente_ superpuestos en paralelo, la constraint sola producía deadlocks (Postgres aborta una transacción y Prisma devuelve un error genérico → 500). Reintentar ayudaba pero era lento e inestable. La solución final tiene dos capas:

1. Un _advisory lock_ de Postgres por sala dentro de la transacción: los pedidos para **la misma sala** se procesan de a uno; salas distintas siguen en paralelo. El lock se libera solo al terminar la transacción.
2. La exclusion constraint como garantía final, más unos pocos reintentos con espera aleatoria por si queda algún conflicto transitorio. Si la contención no cede, se responde 503 en vez de un 500.

El test que lo cubre lanza 20 pedidos idénticos en paralelo (se confirma exactamente uno) y otro lote de franjas parcialmente superpuestas, y verifica en la base que nunca quedan dos confirmadas que se pisen.

### Aislamiento entre empresas

- La identidad se resuelve en **un solo módulo** (`src/server/identidad.ts`). Hoy viene de headers (`x-empresa-id` o `x-rol: admin`); en producción esa función se reemplaza por la validación de un token sin tocar servicios ni endpoints.
- Toda consulta de reservas pasa por un filtro de alcance: una empresa solo ve sus filas; el admin, todas. La reserva se crea siempre a nombre de quien hace el pedido, aunque el cuerpo intente otra empresa.
- Pedir o cancelar una reserva ajena responde **404, igual que si no existiera**: un 403 confirmaría que el id existe.
- En la disponibilidad, las empresas ven que una franja está ocupada pero no de quién, ni el motivo ni los asistentes.

### Cancelar no borra

Cancelar es `POST /api/reservas/:id/cancelar` y no `DELETE`: la reserva cambia de estado y guarda cuándo y quién canceló (empresa o administración). Así se conserva el historial que necesitan las métricas, como las cancelaciones tardías. La actualización es condicional (`WHERE estado = 'CONFIRMADA'`), así que si dos pedidos cancelan a la vez solo uno gana.

### Fechas y zona horaria

Todo se guarda en UTC (`timestamptz`) y las reglas se evalúan en hora de Buenos Aires: el horario de atención, "hoy", los días hábiles. La conversión está concentrada en `src/server/reservas/horario.ts` y tiene tests propios (por ejemplo, las 23 h UTC siguen siendo el día anterior en Argentina).

### Métricas como función pura

`metricas/servicio.ts` lee de la base y `metricas/calculo.ts` calcula. El cálculo es una función pura que recibe datos y devuelve indicadores, así que se testea con datos armados a mano, sin base. Para el volumen de un edificio de oficinas alcanza con calcular en memoria; con mucho más volumen se movería a SQL (ver próximos pasos).

### Stack

- **Next.js para front y back:** un solo proyecto, un solo lenguaje y un solo despliegue. Es el stack que usa Fontanella, y la separación en capas permite sacar el back a un servicio aparte si hiciera falta.
- **Prisma** para el acceso tipado. Lo que Prisma no sabe expresar (la exclusion constraint y los `CHECK`) está en SQL dentro de la migración inicial. Prisma está fijado en 7.10.1: el tag `latest` de npm apuntaba a una release candidate de la 8.
- **Postgres** porque tiene exclusion constraints y rangos de fechas nativos, que resuelven el problema central mejor que cualquier lógica en la aplicación.
- **Sin colas ni servicios extra:** con el lock por sala y la constraint no hacen falta. Una cola (por ejemplo, Azure Service Bus) tendría sentido para notificaciones, no para garantizar la consistencia.

---

## Reglas de negocio y supuestos

El enunciado deja varias reglas abiertas. Las definí así, todas en `src/server/config/reglas.ts`:

| Regla | Valor | Por qué |
| --- | --- | --- |
| Zona horaria | Buenos Aires | El edificio está en Argentina; se guarda en UTC |
| Días hábiles | lunes a viernes | Horario de oficina típico |
| Horario de atención | 8 a 20 h | Ídem |
| Bloques | 30 minutos | Grilla simple de leer y de reservar |
| Duración | de 30 min a 8 h, dentro del mismo día | Evita reservas que bloquean una sala días enteros |
| Anticipación máxima | 90 días | Evita que una empresa acapare el calendario |
| Reservas en el pasado | no se permiten (ni una franja que ya empezó hoy) | |
| Cancelar | solo antes de que empiece | Una reserva en curso o pasada es historial |
| Cancelación tardía | con menos de 24 h de anticipación | Solo se usa en métricas; no se penaliza |
| Capacidad | los asistentes no pueden superar la de la sala | |
| Quién reserva | solo las empresas clientes | El admin administra y cancela, no reserva en nombre de otros |

Otros supuestos:

- **Una sede o varias:** el modelo tiene `Sede` desde el principio (los datos de ejemplo tienen dos), así que crecer a varios edificios no cambia el esquema.
- **Las salas no se borran:** tienen un campo `activa`; una sala inactiva no se puede reservar.
- **Sin aprobación:** una reserva válida queda confirmada al instante.

---

## Métricas

Para la administración, sobre un rango de fechas (por defecto, las últimas 4 semanas; máximo un año):

- **Ocupación** = horas reservadas confirmadas ÷ horas disponibles. Horas disponibles de una sala = días hábiles del rango × 12 h de atención.
- **Por sala y por sede:** ocupación, asistentes promedio y _uso de capacidad_ (asistentes ÷ capacidad: un auditorio de 30 lleno con 6 personas está mal aprovechado aunque esté reservado).
- **Mapa de calor** de ocupación por día de la semana y hora, y **tendencia semanal**, en la que las semanas que vienen muestran horas ya comprometidas.
- **Por empresa:** horas, participación sobre el total, reservas, tasa de cancelación, cancelaciones tardías, uso de capacidad y días desde la última reserva. Las cancelaciones hechas por la administración no cuentan contra la empresa.

**Oportunidades comerciales** (cada una con su criterio, para que se pueda discutir):

- **Horarios para promocionar:** las 5 franjas con menos ocupación, candidatas a tarifas reducidas o paquetes.
- **Clientes para fidelizar:** los 3 que más horas usan.
- **Clientes para reactivar:** sin reservas hace más de 30 días.
- **Cancelaciones tardías para revisar:** empresas con al menos 3 reservas en las que el 20 % o más se cancela con menos de 24 h. Esas franjas quedan difíciles de volver a vender.
- **Salas subutilizadas:** ocupación menor al 25 %, o grupos que usan menos del 40 % de la capacidad.

Todo se puede ver también como tabla, para leer los números exactos.

---

## Tests

86 tests con Vitest. Los de integración llaman a los route handlers reales con un `Request`, contra una base Postgres de tests que se limpia antes de cada uno.

| Archivo | Qué cubre |
| --- | --- |
| `reservas.test.ts` | Crear reservas: superposición (409), bordes contiguos, otra sala, capacidad, horarios inválidos, persistencia, identidad |
| `concurrencia.test.ts` | 20 pedidos idénticos en paralelo, franjas parcialmente superpuestas en paralelo, cancelación doble simultánea, constraint escribiendo directo en la base |
| `aislamiento.test.ts` | Cada empresa ve solo lo suyo; 404 idéntico para id ajeno e inexistente; la disponibilidad no revela de quién es una franja |
| `cancelacion.test.ts` | Cancelar sin borrar, liberar la franja, no cancelar dos veces ni una reserva empezada, cancelación del admin |
| `seguridad.test.ts` | Validación de entrada, headers ambiguos, inyección SQL en ids, filtros y texto libre, formato de errores sin detalles internos |
| `horario.test.ts` | Reglas de horario y conversión de zona horaria |
| `metricas-calculo.test.ts` | Cada métrica y cada oportunidad con datos armados a mano, incluido un rango sin datos |
| `metricas-api.test.ts` | Métricas solo para admin (403 / 401), rango por defecto, validación del rango |

Supertest no se usa: los route handlers de Next reciben un `Request` estándar, así que se llaman directamente.

---

## Limitaciones conocidas

- **No hay autenticación.** La identidad viaja en headers que cualquiera puede falsificar. Está aislada en un solo módulo justamente para reemplazarla.
- **Cancelaciones tardías:** se miden pero no tienen consecuencias (ni penalidad ni bloqueo).
- **No hay ABM de salas, sedes ni empresas:** se cargan con los datos de ejemplo.
- **Sin notificaciones:** nadie recibe un aviso cuando se crea o se cancela una reserva.
- **Métricas en memoria:** suficientes para un edificio; con años de historial o muchos edificios conviene calcularlas en SQL.
- **Sin feriados:** solo se excluyen fines de semana.
- **Reservas recurrentes:** no existen; cada reserva es puntual.
- **Arrastrar para reservar** funciona con mouse; en pantallas táctiles se reserva con dos toques.

## Próximos pasos

1. **Autenticación real** con tokens (por ejemplo, Microsoft Entra ID, en línea con el stack de Fontanella) y roles por empresa, reemplazando `obtenerActor`.
2. **Auditoría:** registrar quién hizo cada acción y desde dónde, no solo el origen de la cancelación.
3. **Notificaciones** por mail al reservar y cancelar, y recordatorios. Acá sí tiene sentido una cola.
4. **Reglas configurables por la administración** (horarios, anticipación, política de cancelación tardía) en vez de constantes en el código, y feriados.
5. **ABM de salas, sedes y empresas** para la administración.
6. **Métricas en SQL** con vistas materializadas o agregaciones si crece el volumen.
7. **Tests end-to-end** del front (Playwright) y pruebas de carga (k6) sobre el endpoint de reservas.
8. **Integración continua** que corra lint, tests y build en cada push.

---

## Uso de IA

Usé **Claude Code** (modelo Claude Opus) como asistente durante todo el desarrollo: para discutir el diseño, escribir buena parte del código y los tests, revisar el resultado en el navegador y redactar este README. Las decisiones de producto y de arquitectura las tomé yo después de discutir alternativas, y avancé de a un paso, revisando cada cambio antes de hacer el commit.

**Cómo lo usé:**

- **Diseño antes que código.** Primero definimos el stack, las reglas de negocio y cómo garantizar la ausencia de superposiciones, y solo después empecé a escribir código. Varias propuestas quedaron descartadas en esa etapa: Supabase, una cola para serializar reservas y Supertest.
- **Aprender en el camino.** No había trabajado antes con un ORM ni había escrito tests automatizados. Le pedí que me explicara cada decisión (qué hace Prisma, por qué una exclusion constraint, cómo se arma un test de concurrencia) en vez de solo generar código.
- **Revisión en el navegador.** Cada cambio de interfaz se probó en el navegador: flujos de reserva y cancelación, celulares, modo oscuro.

**Dónde la IA se equivocó o tuve que corregir el rumbo:**

- **Concurrencia.** El primer diseño confiaba solo en la exclusion constraint. El test de pedidos parcialmente superpuestos mostró deadlocks que terminaban en 500, y los reintentos solos eran lentos e inestables. La solución final (lock por sala + constraint + reintentos acotados) salió de investigar ese test que fallaba, no de la primera propuesta.
- **Versión de Prisma.** `npm install prisma@latest` instalaba una release candidate de la 8. La fijé en 7.10.1 e ignoré los avisos de actualización.
- **Interfaz con "cara de IA".** La primera versión de la interfaz se notaba hecha por IA a simple vista: fondo gris, tarjetas blancas redondeadas, fila de indicadores, subtítulos de ayuda en todas partes. La rehice en varias pasadas:
  - con las guías del plugin [impeccable](https://github.com/pbakaus/impeccable);
  - migrando todo a componentes de shadcn/ui (al inicializarse, shadcn reescribió los estilos y cambió la tipografía, y tuve que revertir esos cambios a mano);
  - con un pase final guiado por [unslop](https://github.com/heydamir/unslop): tipografía IBM Plex, neutros grafito, el color reservado para las líneas de las salas y el mapa de calor, y la tendencia como gráfico de líneas.
- **Detalles que encontré usando la app:** el borde de foco que quedaba al apretar Esc, un fondo alto al pasar el mouse en modo oscuro, el segundo clic que se perdía con clics rápidos, y "Sede Sede" duplicado en un rótulo. Todos se corrigieron después de verlos en el navegador.
- **Dependencias.** Revisé los paquetes que agregaban las herramientas antes de aceptarlos, por ejemplo el paquete `cn` que sumó shadcn.

**Lo que no delegué:** las reglas de negocio y sus valores, qué métricas importan para el negocio y con qué criterio, el tratamiento de la identidad (404 en vez de 403, no revelar de quién es una franja) y la decisión de qué entra en esta versión y qué queda para después.

---

## Créditos

- Pase de diseño guiado por [unslop](https://github.com/heydamir/unslop), de Damir Sokolovsky ([@heydamir](https://github.com/heydamir)), con licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Componentes de [shadcn/ui](https://ui.shadcn.com) y tipografía [IBM Plex](https://www.ibm.com/plex/) (SIL Open Font License).
