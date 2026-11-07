# Imagen para correr la app completa con `docker compose up --build`.
# Prioriza simplicidad: incluye las dependencias de desarrollo porque el arranque
# aplica migraciones (Prisma CLI) y carga datos de ejemplo (tsx).

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .
# El build importa los módulos del servidor; no se conecta a la base, pero
# necesita que la variable exista.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000

# Al arrancar: migraciones pendientes → datos de ejemplo solo si la base está vacía → servidor.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts --si-vacia && npx next start -H 0.0.0.0 -p 3000"]
