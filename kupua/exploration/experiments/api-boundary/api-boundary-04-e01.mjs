import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../src/", import.meta.url)),
    },
  },
  test: {
    include: ["exploration/experiments/api-boundary/api-boundary-04-e01.ts"],
  },
});