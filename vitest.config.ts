import { fileURLToPath } from "node:url";
import { config as cargarEnv } from "dotenv";
import { defineConfig } from "vitest/config";

cargarEnv();

const urlTest = process.env.DATABASE_URL_TEST;
if (!urlTest) throw new Error("Falta DATABASE_URL_TEST (ver .env.example)");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Los tests de integración usan una base separada, nunca la de desarrollo.
    env: { DATABASE_URL: urlTest, TZ: "UTC" },
    globalSetup: ["./tests/helpers/global-setup.ts"],
    // Comparten una única base: se ejecutan de a un archivo para no pisarse.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
