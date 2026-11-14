import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import validation from "../playwright.density-app.config";

const server = validation.webServer;
if (!server || Array.isArray(server)) throw new Error("Research requires the single isolated validation server");

export default defineConfig({
  ...validation,
  testDir: ".",
  testMatch: "density-app-research.spec.ts",
  outputDir: fileURLToPath(new URL("../../test-results/density-research", import.meta.url)),
  webServer: { ...server,
    cwd: fileURLToPath(new URL("../..", import.meta.url)) },
});